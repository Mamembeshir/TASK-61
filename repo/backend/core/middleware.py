"""
core/middleware.py

TenantMiddleware         — attaches tenant_id to every request.
RequestLoggingMiddleware — logs method / path / status / duration.
AccountStatusMiddleware  — gates write operations by account status.
IdempotencyMiddleware    — de-duplicates POST requests by Idempotency-Key.
"""
import json
import logging
import time
from datetime import timedelta

from django.http import JsonResponse
from django.utils import timezone

logger = logging.getLogger("harborops.requests")

# URL prefixes that are always accessible (auth endpoints, admin)
_AUTH_PREFIXES = ("/api/v1/auth/", "/admin/", "/api/v1/core/health")

# HTTP methods that mutate state
_WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _is_auth_path(path: str) -> bool:
    return any(path.startswith(p) for p in _AUTH_PREFIXES)


def _resolve_user(request):
    """
    Return the authenticated User for this request, or None.

    Session-based auth: Django's AuthenticationMiddleware already resolved
    request.user before our middleware runs.
    Token-based auth: DRF resolves users inside the view, so we manually
    look up the token from the Authorization header here.
    """
    user = getattr(request, "user", None)
    if user and user.is_authenticated:
        return user

    auth_header = request.META.get("HTTP_AUTHORIZATION", "")
    if auth_header.startswith("Token "):
        token_key = auth_header[6:].strip()
        try:
            from rest_framework.authtoken.models import Token
            return Token.objects.select_related("user").get(key=token_key).user
        except Exception:
            pass
    return None


class AccountStatusMiddleware:
    """
    Enforces business rules based on the authenticated user's account status.

    SUSPENDED users:
      - May not use write methods (POST/PUT/PATCH/DELETE) → 403
      - GET requests are allowed only if role is STAFF

    PENDING_REVIEW / DEACTIVATED users:
      - May not access any endpoint outside auth/admin paths → 403
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = _resolve_user(request)
        if user and user.is_authenticated:
            status_val = getattr(user, "status", None)

            if status_val in ("PENDING_REVIEW", "DEACTIVATED"):
                if not _is_auth_path(request.path):
                    return JsonResponse(
                        {"error": {"code": "forbidden",
                                   "message": "Account access restricted.",
                                   "detail": None}},
                        status=403,
                    )

            elif status_val == "SUSPENDED":
                if request.method in _WRITE_METHODS:
                    return JsonResponse(
                        {"error": {"code": "forbidden",
                                   "message": "Suspended accounts cannot perform write operations.",
                                   "detail": None}},
                        status=403,
                    )
                # GET is allowed only for STAFF role
                if request.method == "GET" and getattr(user, "role", None) != "STAFF":
                    return JsonResponse(
                        {"error": {"code": "forbidden",
                                   "message": "Account is suspended.",
                                   "detail": None}},
                        status=403,
                    )

        return self.get_response(request)


class IdempotencyMiddleware:
    """
    Caches POST responses by the Idempotency-Key request header.

    On first request with a given key → processes normally, caches the
    JSON response body and status code in IdempotencyRecord.

    On repeat request with the same key (within 24 h) → returns the cached
    response immediately without re-executing the view.

    Only 2xx JSON responses are cached. Non-JSON and error responses are
    passed through unchanged.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method != "POST":
            return self.get_response(request)

        key = request.META.get("HTTP_IDEMPOTENCY_KEY", "").strip()
        if not key:
            return self.get_response(request)

        # ------------------------------------------------------------------
        # Cache hit?
        # ------------------------------------------------------------------
        cutoff = timezone.now() - timedelta(hours=24)
        try:
            from core.models import IdempotencyRecord
            record = IdempotencyRecord.objects.get(key=key, created_at__gte=cutoff)
            response = JsonResponse(record.response_body, status=record.response_status, safe=False)
            response["X-Idempotency-Replayed"] = "true"
            return response
        except Exception:
            pass  # DoesNotExist or DB error → process normally

        # ------------------------------------------------------------------
        # Cache miss — execute the view
        # ------------------------------------------------------------------
        response = self.get_response(request)

        # Cache only successful JSON responses
        if 200 <= response.status_code < 300:
            content_type = response.get("Content-Type", "")
            if "application/json" in content_type:
                try:
                    body = json.loads(response.content)
                    from core.models import IdempotencyRecord
                    IdempotencyRecord.objects.create(
                        key=key,
                        endpoint=request.path,
                        response_status=response.status_code,
                        response_body=body,
                    )
                except Exception:
                    pass  # Don't fail the request if caching fails

        return response


class TenantMiddleware:
    """
    Reads `request.user.tenant_id` (set after AuthenticationMiddleware)
    and stores it as `request.tenant_id` for easy access in views.
    Unauthenticated requests get tenant_id = None.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.tenant_id = None
        response = self.get_response(request)
        # Attach after auth middleware has run
        user = getattr(request, "user", None)
        if user and user.is_authenticated:
            request.tenant_id = getattr(user, "tenant_id", None)
        return response


class RequestLoggingMiddleware:
    """
    Records method, path, status_code, and response time for every request.
    Used by the analytics app to compute API health metrics.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start = time.monotonic()
        response = self.get_response(request)
        duration_ms = round((time.monotonic() - start) * 1000)

        user = getattr(request, "user", None)
        user_id = str(user.pk) if (user and user.is_authenticated) else "anonymous"

        logger.info(
            "%s %s %s %dms user=%s",
            request.method,
            request.path,
            response.status_code,
            duration_ms,
            user_id,
        )
        return response
