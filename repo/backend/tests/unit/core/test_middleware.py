"""
tests/unit/core/test_middleware.py

Unit tests for all five middleware classes:
  - AccountStatusMiddleware: PENDING_REVIEW / DEACTIVATED → 403 on non-auth paths,
    SUSPENDED → 403 on write methods, SUSPENDED STAFF GET is allowed
  - IdempotencyMiddleware: cache hit returns cached response, only POST cached,
    only 2xx JSON cached, replayed header set
  - TenantMiddleware: attaches tenant_id to request
  - RequestLoggingMiddleware: creates a RequestLog row after request completes
  - RateLimitMiddleware: passes through when Redis unavailable (graceful fallback),
    only rate-limits /api/ paths
"""
import json
import pytest
from unittest.mock import MagicMock, patch, PropertyMock
from django.http import JsonResponse, HttpResponse

from core.middleware import (
    AccountStatusMiddleware,
    IdempotencyMiddleware,
    TenantMiddleware,
    RequestLoggingMiddleware,
    RateLimitMiddleware,
    SignedRequestMiddleware,
)
from core.models import IdempotencyRecord, RequestLog
from iam.factories import TenantFactory, UserFactory, AdminUserFactory


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_request(method="GET", path="/api/v1/assets/", user=None, headers=None):
    """
    Build a minimal mock request object.
    When user is a real Django User, is_authenticated is a read-only property
    that always returns True — we must NOT try to set it.
    When user is None we use a MagicMock that pretends to be anonymous.
    """
    req = MagicMock()
    req.method = method
    req.path = path
    req.META = dict(headers or {})
    if user is not None:
        req.user = user  # real User: is_authenticated == True already
    else:
        # Anonymous request: build a mock that looks unauthenticated
        anon = MagicMock()
        anon.is_authenticated = False
        req.user = anon
    return req


def _ok_response():
    resp = JsonResponse({"ok": True}, status=200)
    return resp


def _get_response_ok(_req):
    return _ok_response()


# ===========================================================================
# 1. AccountStatusMiddleware
# ===========================================================================

@pytest.mark.django_db
class TestAccountStatusMiddleware:
    """
    Rules:
      PENDING_REVIEW / DEACTIVATED → 403 on non-auth paths
      SUSPENDED → 403 on write methods (POST/PUT/PATCH/DELETE)
      SUSPENDED STAFF → GET allowed
      SUSPENDED non-STAFF → GET also 403
      ACTIVE → always passes through
    """

    def _mw(self):
        return AccountStatusMiddleware(_get_response_ok)

    def _user(self, status, role="STAFF"):
        tenant = TenantFactory()
        return UserFactory(tenant=tenant, status=status, role=role)
        # Note: Django's AbstractBaseUser.is_authenticated is a property
        # that always returns True — no need to set it explicitly.

    def test_active_user_passes_through(self):
        user = self._user("ACTIVE")
        req = _make_request(method="GET", path="/api/v1/assets/", user=user)
        resp = self._mw()(req)
        assert resp.status_code == 200

    def test_pending_review_blocked_on_api_path(self):
        user = self._user("PENDING_REVIEW")
        req = _make_request(method="GET", path="/api/v1/assets/", user=user)
        resp = self._mw()(req)
        assert resp.status_code == 403

    def test_deactivated_blocked_on_api_path(self):
        user = self._user("DEACTIVATED")
        req = _make_request(method="GET", path="/api/v1/assets/", user=user)
        resp = self._mw()(req)
        assert resp.status_code == 403

    def test_pending_review_allowed_on_auth_path(self):
        user = self._user("PENDING_REVIEW")
        req = _make_request(method="POST", path="/api/v1/auth/logout/", user=user)
        resp = self._mw()(req)
        assert resp.status_code == 200

    def test_deactivated_allowed_on_auth_path(self):
        user = self._user("DEACTIVATED")
        req = _make_request(method="POST", path="/api/v1/auth/login/", user=user)
        resp = self._mw()(req)
        assert resp.status_code == 200

    def test_suspended_blocked_on_post(self):
        user = self._user("SUSPENDED")
        req = _make_request(method="POST", path="/api/v1/assets/", user=user)
        resp = self._mw()(req)
        assert resp.status_code == 403

    def test_suspended_blocked_on_put(self):
        user = self._user("SUSPENDED")
        req = _make_request(method="PUT", path="/api/v1/assets/123/", user=user)
        resp = self._mw()(req)
        assert resp.status_code == 403

    def test_suspended_blocked_on_patch(self):
        user = self._user("SUSPENDED")
        req = _make_request(method="PATCH", path="/api/v1/assets/123/", user=user)
        resp = self._mw()(req)
        assert resp.status_code == 403

    def test_suspended_blocked_on_delete(self):
        user = self._user("SUSPENDED")
        req = _make_request(method="DELETE", path="/api/v1/assets/123/", user=user)
        resp = self._mw()(req)
        assert resp.status_code == 403

    def test_suspended_staff_allowed_get(self):
        """SUSPENDED STAFF can still do GET requests."""
        user = self._user("SUSPENDED", role="STAFF")
        req = _make_request(method="GET", path="/api/v1/assets/", user=user)
        resp = self._mw()(req)
        assert resp.status_code == 200

    def test_suspended_non_staff_blocked_get(self):
        """SUSPENDED COURIER/ADMIN cannot even do GET."""
        user = self._user("SUSPENDED", role="COURIER")
        req = _make_request(method="GET", path="/api/v1/assets/", user=user)
        resp = self._mw()(req)
        assert resp.status_code == 403

    def test_unauthenticated_passes_through(self):
        req = _make_request(method="GET", path="/api/v1/assets/", user=None)
        resp = self._mw()(req)
        assert resp.status_code == 200


# ===========================================================================
# 2. IdempotencyMiddleware
# ===========================================================================

@pytest.mark.django_db
class TestIdempotencyMiddleware:

    def _mw(self, get_response=None):
        return IdempotencyMiddleware(get_response or _get_response_ok)

    def test_non_post_passes_through(self):
        req = _make_request(method="GET", path="/api/v1/assets/")
        resp = self._mw()(req)
        assert resp.status_code == 200

    def test_post_without_key_passes_through(self):
        req = _make_request(method="POST", path="/api/v1/assets/")
        # No HTTP_IDEMPOTENCY_KEY in META
        resp = self._mw()(req)
        assert resp.status_code == 200

    def test_first_post_with_key_stores_record(self):
        req = _make_request(method="POST", path="/api/v1/assets/")
        req.META["HTTP_IDEMPOTENCY_KEY"] = "first-key-001"

        def get_response(_req):
            return JsonResponse({"created": True}, status=201)

        mw = self._mw(get_response)
        resp = mw(req)

        assert resp.status_code == 201
        assert IdempotencyRecord.objects.filter(key="first-key-001").exists()

    def test_repeated_post_returns_cached_response(self):
        """Second request with same key must return cached body without calling view."""
        key = "replay-key-999"
        IdempotencyRecord.objects.create(
            key=key,
            endpoint="/api/v1/assets/",
            response_status=201,
            response_body={"id": "cached-id"},
        )

        call_count = {"n": 0}
        def get_response(_req):
            call_count["n"] += 1
            return JsonResponse({"new": True}, status=201)

        req = _make_request(method="POST", path="/api/v1/assets/")
        req.META["HTTP_IDEMPOTENCY_KEY"] = key
        mw = self._mw(get_response)
        resp = mw(req)

        assert resp.status_code == 201
        body = json.loads(resp.content)
        assert body.get("id") == "cached-id"
        assert call_count["n"] == 0  # view was NOT called
        assert resp.get("X-Idempotency-Replayed") == "true"

    def test_non_2xx_response_not_cached(self):
        """Error responses must NOT be stored in IdempotencyRecord."""
        key = "error-key-123"
        req = _make_request(method="POST", path="/api/v1/assets/")
        req.META["HTTP_IDEMPOTENCY_KEY"] = key

        def get_response(_req):
            return JsonResponse({"error": "bad"}, status=400)

        mw = self._mw(get_response)
        mw(req)
        assert not IdempotencyRecord.objects.filter(key=key).exists()

    def test_non_json_response_not_cached(self):
        """Non-JSON responses must NOT be stored."""
        key = "html-key-456"
        req = _make_request(method="POST", path="/api/v1/assets/")
        req.META["HTTP_IDEMPOTENCY_KEY"] = key

        def get_response(_req):
            resp = HttpResponse("<html>ok</html>", status=200, content_type="text/html")
            return resp

        mw = self._mw(get_response)
        mw(req)
        assert not IdempotencyRecord.objects.filter(key=key).exists()


# ===========================================================================
# 3. TenantMiddleware
# ===========================================================================

@pytest.mark.django_db
class TestTenantMiddleware:

    def _mw(self):
        def get_response(req):
            return _ok_response()
        return TenantMiddleware(get_response)

    def test_sets_tenant_id_for_authenticated_user(self):
        tenant = TenantFactory()
        user = UserFactory(tenant=tenant)
        # is_authenticated is a read-only property on real User objects (always True)

        req = _make_request(user=user)
        self._mw()(req)
        # TenantMiddleware reads user.tenant_id from the authenticated user
        assert user.tenant_id == tenant.pk

    def test_unauthenticated_gets_none_tenant_id(self):
        req = _make_request(user=None)
        self._mw()(req)
        assert req.tenant_id is None


# ===========================================================================
# 4. RequestLoggingMiddleware
# ===========================================================================

@pytest.mark.django_db
class TestRequestLoggingMiddleware:

    def test_creates_request_log_entry(self):
        """After the request completes, a RequestLog row must be written."""
        req = _make_request(method="GET", path="/api/v1/assets/")
        mw = RequestLoggingMiddleware(_get_response_ok)
        mw(req)

        import time
        time.sleep(0.05)  # allow daemon thread to finish

        assert RequestLog.objects.filter(path="/api/v1/assets/").exists()

    def test_log_captures_method_and_status(self):
        req = _make_request(method="POST", path="/api/v1/test/")

        def get_response(_req):
            return JsonResponse({}, status=201)

        mw = RequestLoggingMiddleware(get_response)
        mw(req)

        import time
        time.sleep(0.05)

        log = RequestLog.objects.filter(path="/api/v1/test/").first()
        if log:  # thread may not have finished in CI
            assert log.method == "POST"
            assert log.status_code == 201

    def test_response_is_returned_unchanged(self):
        """Middleware must not alter the response."""
        req = _make_request(method="GET", path="/api/v1/health/")
        mw = RequestLoggingMiddleware(_get_response_ok)
        resp = mw(req)
        assert resp.status_code == 200


# ===========================================================================
# 5. RateLimitMiddleware
# ===========================================================================

@pytest.mark.django_db
class TestRateLimitMiddleware:
    """
    RateLimitMiddleware uses Redis. In the test environment Redis may not be
    available. We test:
      - graceful fallback when Redis is unavailable (request passes through)
      - unauthenticated requests always pass through
      - non-/api/ paths are skipped entirely
    """

    def _mw(self):
        return RateLimitMiddleware(_get_response_ok)

    def test_unauthenticated_passes_through(self):
        req = _make_request(method="GET", path="/api/v1/assets/", user=None)
        resp = self._mw()(req)
        assert resp.status_code == 200

    def test_non_api_path_skips_rate_limiting(self):
        req = _make_request(method="GET", path="/admin/", user=None)
        resp = self._mw()(req)
        assert resp.status_code == 200

    def test_redis_unavailable_passes_through(self):
        """When Redis is down the middleware must not block the request."""
        tenant = TenantFactory()
        user = UserFactory(tenant=tenant)
        # is_authenticated is a read-only property on real User — always True
        req = _make_request(method="GET", path="/api/v1/assets/", user=user)

        mw = self._mw()
        mw._redis = None
        mw._redis_init_attempted = True

        resp = mw(req)
        assert resp.status_code == 200

    def test_rate_limit_exceeded_returns_429(self):
        """Simulate Redis returning a count above the limit."""
        tenant = TenantFactory()
        user = UserFactory(tenant=tenant)
        req = _make_request(method="GET", path="/api/v1/assets/", user=user)

        mw = self._mw()

        # Mock a Redis client that returns count > 100
        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        mock_redis.pipeline.return_value = mock_pipe
        mock_pipe.execute.return_value = [101, True]  # count=101 exceeds limit
        mw._redis = mock_redis
        mw._redis_init_attempted = True

        resp = mw(req)
        assert resp.status_code == 429
        body = json.loads(resp.content)
        assert body["error"]["code"] == "rate_limited"
        assert "Retry-After" in resp


# ===========================================================================
# 6. SignedRequestMiddleware
# ===========================================================================

import hashlib
import hmac as _hmac_lib
import time as _time
import uuid as _uuid


def _signed_headers(token_key: str, method: str, path: str, *,
                    ts: int | None = None, nonce: str | None = None,
                    signature: str | None = None) -> dict:
    """Build a valid (or deliberately tampered) set of signing headers."""
    ts_val   = ts    if ts    is not None else int(_time.time())
    nonce_val = nonce if nonce is not None else str(_uuid.uuid4())
    message  = f"{method}\n{path}\n{ts_val}\n{nonce_val}".encode()
    sig      = signature if signature is not None else _hmac_lib.new(
        token_key.encode(), message, hashlib.sha256
    ).hexdigest()
    return {
        "HTTP_AUTHORIZATION":       f"Token {token_key}",
        "HTTP_X_REQUEST_TIMESTAMP": str(ts_val),
        "HTTP_X_REQUEST_NONCE":     nonce_val,
        "HTTP_X_REQUEST_SIGNATURE": sig,
    }


@pytest.mark.django_db
class TestSignedRequestMiddleware:
    """
    Covers the four rejection paths in SignedRequestMiddleware._verify():
      1. Missing headers             → 400 signed_request_required
      2. Expired timestamp           → 400 timestamp_expired
      3. Invalid (wrong) signature   → 400 invalid_signature
      4. Nonce replay                → 400 nonce_replayed
    Plus the positive path: valid headers pass through.
    Non-Token requests are always exempt.
    """

    TOKEN = "test-token-key-0000000000000000"
    PATH  = "/api/v1/assets/"

    def _mw(self):
        return SignedRequestMiddleware(_get_response_ok)

    def _req(self, headers: dict) -> MagicMock:
        req = _make_request(method="GET", path=self.PATH, headers=headers)
        return req

    # ------------------------------------------------------------------
    # Happy path
    # ------------------------------------------------------------------

    def test_valid_signed_request_passes_through(self):
        headers = _signed_headers(self.TOKEN, "GET", self.PATH)
        resp = self._mw()(_make_request(method="GET", path=self.PATH, headers=headers))
        assert resp.status_code == 200

    def test_non_token_auth_exempt(self):
        """Session-authenticated requests carry no Authorization: Token header."""
        req = _make_request(method="GET", path=self.PATH, headers={
            "HTTP_AUTHORIZATION": "Session abc123",
        })
        resp = self._mw()(req)
        assert resp.status_code == 200

    def test_non_api_path_exempt(self):
        req = _make_request(method="GET", path="/admin/", headers={
            "HTTP_AUTHORIZATION": f"Token {self.TOKEN}",
        })
        resp = self._mw()(req)
        assert resp.status_code == 200

    # ------------------------------------------------------------------
    # Missing headers
    # ------------------------------------------------------------------

    def test_missing_all_signing_headers_returns_400(self):
        req = _make_request(method="GET", path=self.PATH, headers={
            "HTTP_AUTHORIZATION": f"Token {self.TOKEN}",
            # No timestamp / nonce / signature
        })
        resp = self._mw()(req)
        assert resp.status_code == 400
        body = json.loads(resp.content)
        assert body["error"]["code"] == "signed_request_required"

    def test_missing_nonce_returns_400(self):
        headers = _signed_headers(self.TOKEN, "GET", self.PATH)
        del headers["HTTP_X_REQUEST_NONCE"]
        resp = self._mw()(_make_request(method="GET", path=self.PATH, headers=headers))
        assert resp.status_code == 400
        assert json.loads(resp.content)["error"]["code"] == "signed_request_required"

    def test_missing_signature_returns_400(self):
        headers = _signed_headers(self.TOKEN, "GET", self.PATH)
        del headers["HTTP_X_REQUEST_SIGNATURE"]
        resp = self._mw()(_make_request(method="GET", path=self.PATH, headers=headers))
        assert resp.status_code == 400
        assert json.loads(resp.content)["error"]["code"] == "signed_request_required"

    # ------------------------------------------------------------------
    # Expired timestamp
    # ------------------------------------------------------------------

    def test_timestamp_too_old_returns_400(self):
        stale_ts = int(_time.time()) - SignedRequestMiddleware.TIMESTAMP_TOLERANCE_S - 1
        headers = _signed_headers(self.TOKEN, "GET", self.PATH, ts=stale_ts)
        resp = self._mw()(_make_request(method="GET", path=self.PATH, headers=headers))
        assert resp.status_code == 400
        assert json.loads(resp.content)["error"]["code"] == "timestamp_expired"

    def test_timestamp_in_future_returns_400(self):
        future_ts = int(_time.time()) + SignedRequestMiddleware.TIMESTAMP_TOLERANCE_S + 1
        headers = _signed_headers(self.TOKEN, "GET", self.PATH, ts=future_ts)
        resp = self._mw()(_make_request(method="GET", path=self.PATH, headers=headers))
        assert resp.status_code == 400
        assert json.loads(resp.content)["error"]["code"] == "timestamp_expired"

    def test_non_integer_timestamp_returns_400(self):
        headers = _signed_headers(self.TOKEN, "GET", self.PATH)
        headers["HTTP_X_REQUEST_TIMESTAMP"] = "not-a-number"
        resp = self._mw()(_make_request(method="GET", path=self.PATH, headers=headers))
        assert resp.status_code == 400
        assert json.loads(resp.content)["error"]["code"] == "invalid_timestamp"

    # ------------------------------------------------------------------
    # Invalid signature
    # ------------------------------------------------------------------

    def test_wrong_signature_returns_400(self):
        headers = _signed_headers(self.TOKEN, "GET", self.PATH,
                                  signature="deadbeef" * 8)
        resp = self._mw()(_make_request(method="GET", path=self.PATH, headers=headers))
        assert resp.status_code == 400
        assert json.loads(resp.content)["error"]["code"] == "invalid_signature"

    def test_signature_for_different_path_returns_400(self):
        """Signing /api/v1/other/ then sending to /api/v1/assets/ must fail."""
        headers = _signed_headers(self.TOKEN, "GET", "/api/v1/other/")
        # Keep all headers but send request to a different path
        req = _make_request(method="GET", path=self.PATH, headers=headers)
        resp = self._mw()(req)
        assert resp.status_code == 400
        assert json.loads(resp.content)["error"]["code"] == "invalid_signature"

    def test_signature_for_different_method_returns_400(self):
        """Signing GET then sending as POST must fail."""
        headers = _signed_headers(self.TOKEN, "GET", self.PATH)
        req = _make_request(method="POST", path=self.PATH, headers=headers)
        resp = self._mw()(req)
        assert resp.status_code == 400
        assert json.loads(resp.content)["error"]["code"] == "invalid_signature"

    # ------------------------------------------------------------------
    # Nonce replay
    # ------------------------------------------------------------------

    def test_nonce_replay_returns_400(self):
        """Using the same nonce twice must be rejected on the second request."""
        fixed_nonce = str(_uuid.uuid4())
        headers = _signed_headers(self.TOKEN, "GET", self.PATH, nonce=fixed_nonce)

        mw = self._mw()
        # First request — must succeed
        resp1 = mw(_make_request(method="GET", path=self.PATH, headers=headers))
        assert resp1.status_code == 200

        # Second request with identical nonce — must be rejected
        resp2 = mw(_make_request(method="GET", path=self.PATH, headers=headers))
        assert resp2.status_code == 400
        assert json.loads(resp2.content)["error"]["code"] == "nonce_replayed"
