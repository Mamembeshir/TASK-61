"""
core/middleware.py

TenantMiddleware         — attaches tenant_id to every request.
RequestLoggingMiddleware — logs method / path / status / duration.
AccountStatusMiddleware  — gates write operations by account status.
IdempotencyMiddleware    — de-duplicates POST requests by Idempotency-Key.
RateLimitMiddleware      — 100 req/min per authenticated user via Redis.
SignedRequestMiddleware  — validates timestamp/nonce/HMAC on Token-auth requests.
"""
import hashlib
import hmac as hmac_lib
import json
import logging
import threading
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
        # Scope key by endpoint + actor so keys cannot cross user/path boundaries.
        #
        # Token auth is resolved by DRF inside the view (TokenAuthentication is an
        # auth class, not a middleware), so `request.user` is still AnonymousUser
        # here for token-authenticated callers.  We use the token-aware resolver
        # to avoid bucketing every token-auth user under a shared "anonymous" id.
        # ------------------------------------------------------------------
        endpoint = request.path
        resolved = _resolve_user(request)
        actor_id = str(resolved.pk) if resolved is not None else "anonymous"

        # ------------------------------------------------------------------
        # Cache hit?
        # ------------------------------------------------------------------
        cutoff = timezone.now() - timedelta(hours=24)
        try:
            from core.models import IdempotencyRecord
            record = IdempotencyRecord.objects.get(
                key=key, endpoint=endpoint, actor_id=actor_id, created_at__gte=cutoff
            )
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
                        endpoint=endpoint,
                        actor_id=actor_id,
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

        def _write_log():
            try:
                from core.models import RequestLog
                from django.utils import timezone as tz
                RequestLog.objects.create(
                    method=request.method,
                    path=request.path[:500],
                    status_code=response.status_code,
                    response_time_ms=duration_ms,
                    user_id=user_id,
                    timestamp=tz.now(),
                )
            except Exception:
                pass

        threading.Thread(target=_write_log, daemon=True).start()
        return response


class RateLimitMiddleware:
    """
    Enforces a per-user rate limit of 100 requests per minute for /api/ paths.

    Key scheme: ratelimit:{user_id}:{minute_window}
    where minute_window = int(time.time() // 60).

    Falls back gracefully (allows the request) if Redis is unavailable.
    Unauthenticated requests are not rate-limited.
    """

    _LIMIT = 100
    _WINDOW = 60  # seconds

    def __init__(self, get_response):
        self.get_response = get_response
        self._redis = None
        self._redis_init_attempted = False

    def _get_redis(self):
        """Lazily initialise a Redis client from CELERY_BROKER_URL."""
        if self._redis_init_attempted:
            return self._redis
        self._redis_init_attempted = True
        try:
            import redis as redis_lib
            from django.conf import settings
            url = getattr(settings, "CELERY_BROKER_URL", "redis://localhost:6379/0")
            self._redis = redis_lib.Redis.from_url(url, socket_connect_timeout=1, socket_timeout=1)
        except Exception:
            self._redis = None
        return self._redis

    def __call__(self, request):
        if not request.path.startswith("/api/"):
            return self.get_response(request)

        user = _resolve_user(request)
        if not (user and user.is_authenticated):
            return self.get_response(request)

        try:
            r = self._get_redis()
            if r is None:
                return self.get_response(request)

            minute_window = int(time.time() // self._WINDOW)
            key = f"ratelimit:{user.pk}:{minute_window}"

            pipe = r.pipeline()
            pipe.incr(key)
            pipe.expire(key, self._WINDOW + 5)  # slight buffer to avoid race on expiry
            count, _ = pipe.execute()

            if count > self._LIMIT:
                return JsonResponse(
                    {
                        "error": {
                            "code": "rate_limited",
                            "message": "Rate limit exceeded. Maximum 100 requests per minute.",
                            "detail": None,
                        }
                    },
                    status=429,
                    headers={"Retry-After": str(self._WINDOW)},
                )
        except Exception:
            # Redis unavailable or any error — allow the request through
            pass

        return self.get_response(request)


class SignedRequestMiddleware:
    """
    Enforces per-request signed-request verification for Token-authenticated API calls.

    For any request carrying ``Authorization: Token <key>`` on a /api/ path,
    three additional headers are required:

        X-Request-Timestamp : Unix epoch seconds (integer string)
        X-Request-Nonce     : Random string (UUID recommended), max 128 chars
        X-Request-Signature : Hex-encoded HMAC-SHA256 of the canonical message

    Canonical message (UTF-8, newline-joined):
        {METHOD}\\n{path}\\n{timestamp}\\n{nonce}

    The HMAC secret is the DRF token key itself — a per-user secret already
    transmitted over TLS — so no out-of-band shared secret is needed.

    Validation rules:
        1. Timestamp must be within ±TIMESTAMP_TOLERANCE_S of server time.
        2. Nonce must not have been seen within the replay window (cache).
        3. HMAC signature must verify.

    Session-authenticated requests (no Authorization header) are exempt —
    they are protected by Django's CSRF middleware.
    Requests to _AUTH_PREFIXES are always exempt (login has no token yet).
    """

    TIMESTAMP_TOLERANCE_S = 300   # ±5 minutes
    NONCE_CACHE_TTL_S     = 660   # must exceed 2 × tolerance

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if self._requires_signature(request):
            error = self._verify(request)
            if error:
                return error
        return self.get_response(request)

    def _requires_signature(self, request) -> bool:
        if not request.path.startswith("/api/"):
            return False
        if _is_auth_path(request.path):
            return False
        return request.META.get("HTTP_AUTHORIZATION", "").startswith("Token ")

    def _verify(self, request):
        token_key = request.META["HTTP_AUTHORIZATION"][6:].strip()
        ts_header = request.META.get("HTTP_X_REQUEST_TIMESTAMP", "").strip()
        nonce     = request.META.get("HTTP_X_REQUEST_NONCE", "").strip()
        signature = request.META.get("HTTP_X_REQUEST_SIGNATURE", "").strip()

        if not (ts_header and nonce and signature):
            return self._err(
                "signed_request_required",
                "X-Request-Timestamp, X-Request-Nonce, and X-Request-Signature are required.",
            )

        # 1. Timestamp freshness
        try:
            ts = int(ts_header)
        except ValueError:
            return self._err("invalid_timestamp", "X-Request-Timestamp must be a Unix epoch integer.")

        skew = abs(time.time() - ts)
        if skew > self.TIMESTAMP_TOLERANCE_S:
            return self._err(
                "timestamp_expired",
                f"Request timestamp rejected (skew={skew:.0f}s, max={self.TIMESTAMP_TOLERANCE_S}s).",
            )

        # 2. Nonce replay check
        if len(nonce) > 128:
            return self._err("invalid_nonce", "X-Request-Nonce must not exceed 128 characters.")

        cache_key = f"req_nonce:{token_key[:16]}:{nonce}"
        try:
            from django.core.cache import cache
            if cache.get(cache_key) is not None:
                return self._err("nonce_replayed", "Request nonce has already been used.")
            cache.set(cache_key, 1, timeout=self.NONCE_CACHE_TTL_S)
        except Exception:
            pass  # cache unavailable — fail-open to avoid hard-locking users

        # 3. HMAC verification
        message = f"{request.method}\n{request.path}\n{ts_header}\n{nonce}".encode()
        expected = hmac_lib.new(token_key.encode(), message, hashlib.sha256).hexdigest()

        if not hmac_lib.compare_digest(expected, signature.lower()):
            return self._err("invalid_signature", "Request signature verification failed.")

        return None

    @staticmethod
    def _err(code: str, message: str):
        return JsonResponse(
            {"error": {"code": code, "message": message, "detail": None}},
            status=400,
        )
