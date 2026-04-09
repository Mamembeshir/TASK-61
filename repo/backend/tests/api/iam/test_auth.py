"""
tests/api/iam/test_auth.py

Full API integration tests for authentication endpoints.
Real DB + real HTTP stack (no mocking).

Status code contract:
  201  register success
  200  login / logout / me success
  401  wrong password
  403  locked / inactive (PENDING_REVIEW, SUSPENDED, DEACTIVATED)
  409  duplicate username same tenant
  422  password strength / file validation
"""
import datetime
import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

pytestmark = [pytest.mark.api, pytest.mark.django_db]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

REGISTER_URL = "/api/v1/auth/register/"
LOGIN_URL    = "/api/v1/auth/login/"
LOGOUT_URL   = "/api/v1/auth/logout/"
ME_URL       = "/api/v1/auth/me/"

STRONG_PW = "Test@pass1!"  # meets all strength requirements


def _reg_payload(tenant, **overrides):
    """Minimal valid registration payload for tenant."""
    base = {
        "username": "newuser",
        "password": STRONG_PW,
        "tenant_slug": tenant.slug,
        "legal_first_name": "Alice",
        "legal_last_name": "Smith",
        "employee_student_id": "EMP001",
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# POST /api/v1/auth/register/
# ---------------------------------------------------------------------------

class TestRegister:

    def test_happy_path_returns_201_pending_review(self, api_client, tenant, assert_status):
        """Valid registration → 201, user status is PENDING_REVIEW."""
        resp = api_client.post(REGISTER_URL, _reg_payload(tenant), format="json")
        assert_status(resp, 201)
        assert resp.data["status"] == "PENDING_REVIEW"
        assert resp.data["role"] == "STAFF"

    def test_duplicate_username_same_tenant_returns_409(
        self, api_client, staff_user, assert_status
    ):
        """Second registration with same username + tenant → 409 Conflict."""
        payload = _reg_payload(
            staff_user.tenant,
            username=staff_user.username,
            employee_student_id="EMP_UNIQUE_1",
        )
        resp = api_client.post(REGISTER_URL, payload, format="json")
        assert_status(resp, 409)

    def test_duplicate_username_different_tenant_returns_201(
        self, api_client, staff_user, tenant_factory, assert_status
    ):
        """Same username on a *different* tenant is allowed."""
        other_tenant = tenant_factory()
        payload = _reg_payload(
            other_tenant,
            username=staff_user.username,
            employee_student_id="EMP_UNIQUE_2",
        )
        resp = api_client.post(REGISTER_URL, payload, format="json")
        assert_status(resp, 201)

    def test_weak_password_missing_special_char_returns_422(
        self, api_client, tenant, assert_status
    ):
        """Password without a special character → 422."""
        resp = api_client.post(
            REGISTER_URL,
            _reg_payload(tenant, username="weakpw", password="NoSpecial1"),
            format="json",
        )
        assert_status(resp, 422)

    def test_weak_password_too_short_returns_422(self, api_client, tenant, assert_status):
        resp = api_client.post(
            REGISTER_URL,
            _reg_payload(tenant, username="shortpw", password="Ab1!"),
            format="json",
        )
        assert_status(resp, 422)

    def test_photo_id_wrong_file_type_returns_422(self, api_client, tenant, assert_status):
        """Uploading a text file as photo_id → 422."""
        bad_file = SimpleUploadedFile(
            "photo.txt", b"not an image", content_type="text/plain"
        )
        data = _reg_payload(tenant, username="photouser1")
        data["photo_id"] = bad_file
        resp = api_client.post(REGISTER_URL, data, format="multipart")
        assert_status(resp, 422)

    def test_photo_id_too_large_returns_422(self, api_client, tenant, assert_status):
        """Photo larger than 10 MB → 422."""
        big_file = SimpleUploadedFile(
            "big.jpg",
            b"\xff\xd8\xff" + b"\x00" * (10 * 1024 * 1024 + 1),  # > 10 MB JPEG
            content_type="image/jpeg",
        )
        data = _reg_payload(tenant, username="photouser2")
        data["photo_id"] = big_file
        resp = api_client.post(REGISTER_URL, data, format="multipart")
        assert_status(resp, 422)

    def test_missing_required_field_returns_400(self, api_client, tenant, assert_status):
        """Payload missing required fields → 400."""
        resp = api_client.post(REGISTER_URL, {"username": "incomplete"}, format="json")
        assert_status(resp, 400)

    def test_idempotent_register_same_key_creates_one_user(
        self, api_client, tenant, assert_status
    ):
        """Two POSTs with the same Idempotency-Key → identical response, 1 user in DB."""
        from iam.models import User

        payload = _reg_payload(tenant, username="idempuser")
        resp1 = api_client.post(
            REGISTER_URL, payload, format="json",
            HTTP_IDEMPOTENCY_KEY="idem-reg-001",
        )
        assert_status(resp1, 201)

        resp2 = api_client.post(
            REGISTER_URL, payload, format="json",
            HTTP_IDEMPOTENCY_KEY="idem-reg-001",
        )
        # Cached response — same status and same user id
        assert resp2.status_code == 201
        # resp2 is a plain JsonResponse from the middleware cache; use .json()
        assert resp1.json()["id"] == resp2.json()["id"]

        # Only one user in the DB
        assert User.objects.filter(username="idempuser", tenant=tenant).count() == 1


# ---------------------------------------------------------------------------
# POST /api/v1/auth/login/
# ---------------------------------------------------------------------------

class TestLogin:

    def test_happy_path_returns_200_with_token_and_profile(
        self, api_client, staff_user, assert_status
    ):
        """Valid credentials → 200, token present, profile fields returned."""
        resp = api_client.post(
            LOGIN_URL,
            {"username": staff_user.username, "password": STRONG_PW},
            format="json",
        )
        assert_status(resp, 200)
        assert "token" in resp.data
        assert resp.data["profile"]["username"] == staff_user.username

    def test_login_sets_session_cookie(self, api_client, staff_user):
        """Successful login sets a sessionid cookie."""
        api_client.post(
            LOGIN_URL,
            {"username": staff_user.username, "password": STRONG_PW},
            format="json",
        )
        assert "sessionid" in api_client.cookies

    def test_wrong_password_returns_401(self, api_client, staff_user, assert_status):
        resp = api_client.post(
            LOGIN_URL,
            {"username": staff_user.username, "password": "WrongPass1!"},
            format="json",
        )
        assert_status(resp, 401)

    def test_5_wrong_passwords_then_6th_returns_403(
        self, api_client, staff_user, assert_status
    ):
        """After 5 failed attempts the account locks; 6th attempt returns 403."""
        for _ in range(5):
            api_client.post(
                LOGIN_URL,
                {"username": staff_user.username, "password": "Wrong1!aaa"},
                format="json",
            )
        resp = api_client.post(
            LOGIN_URL,
            {"username": staff_user.username, "password": "Wrong1!aaa"},
            format="json",
        )
        assert_status(resp, 403)

    def test_login_during_lockout_returns_403_and_does_not_extend_timer(
        self, api_client, staff_user, assert_status
    ):
        """Login during active lockout returns 403; locked_until is not extended."""
        from django.utils import timezone

        locked_until = timezone.now() + datetime.timedelta(minutes=15)
        staff_user.locked_until = locked_until
        staff_user.save(update_fields=["locked_until"])

        resp = api_client.post(
            LOGIN_URL,
            {"username": staff_user.username, "password": STRONG_PW},
            format="json",
        )
        assert_status(resp, 403)

        staff_user.refresh_from_db()
        assert staff_user.locked_until == locked_until  # timer unchanged

    def test_pending_review_account_returns_403(
        self, api_client, pending_user, assert_status
    ):
        resp = api_client.post(
            LOGIN_URL,
            {"username": pending_user.username, "password": STRONG_PW},
            format="json",
        )
        assert_status(resp, 403)

    def test_suspended_account_returns_403(
        self, api_client, suspended_user, assert_status
    ):
        resp = api_client.post(
            LOGIN_URL,
            {"username": suspended_user.username, "password": STRONG_PW},
            format="json",
        )
        assert_status(resp, 403)

    def test_deactivated_account_returns_403(
        self, api_client, deactivated_user, assert_status
    ):
        resp = api_client.post(
            LOGIN_URL,
            {"username": deactivated_user.username, "password": STRONG_PW},
            format="json",
        )
        assert_status(resp, 403)


# ---------------------------------------------------------------------------
# POST /api/v1/auth/logout/
# ---------------------------------------------------------------------------

class TestLogout:

    def test_authenticated_user_can_logout_returns_200(
        self, staff_client, assert_status
    ):
        resp = staff_client.post(LOGOUT_URL)
        assert_status(resp, 200)

    def test_unauthenticated_logout_returns_401(self, api_client, assert_status):
        resp = api_client.post(LOGOUT_URL)
        assert_status(resp, 401)


# ---------------------------------------------------------------------------
# GET /api/v1/auth/me/
# ---------------------------------------------------------------------------

class TestMe:

    def test_returns_current_user_profile(self, staff_client, staff_user, assert_status):
        resp = staff_client.get(ME_URL)
        assert_status(resp, 200)
        assert resp.data["username"] == staff_user.username
        assert resp.data["role"] == staff_user.role
        assert resp.data["status"] == staff_user.status

    def test_unauthenticated_returns_401(self, api_client, assert_status):
        resp = api_client.get(ME_URL)
        assert_status(resp, 401)


# ---------------------------------------------------------------------------
# AccountStatusMiddleware
# ---------------------------------------------------------------------------

class TestAccountStatusMiddleware:

    def test_suspended_user_post_returns_403(
        self, auth_client, suspended_user, assert_status
    ):
        """A SUSPENDED user cannot POST (write operation)."""
        client = auth_client(suspended_user)
        resp = client.post(ME_URL, {}, format="json")
        assert_status(resp, 403)

    def test_suspended_staff_user_get_returns_allowed(
        self, auth_client, suspended_user, assert_status
    ):
        """A SUSPENDED STAFF user can still GET."""
        client = auth_client(suspended_user)
        resp = client.get(ME_URL)
        # Should not be 403 from AccountStatusMiddleware (GET is allowed for STAFF)
        assert resp.status_code != 403

    def test_pending_review_user_get_non_auth_endpoint_returns_403(
        self, auth_client, pending_user, assert_status
    ):
        """A PENDING_REVIEW user cannot access non-auth endpoints."""
        client = auth_client(pending_user)
        resp = client.get("/api/v1/assets/")
        assert_status(resp, 403)
