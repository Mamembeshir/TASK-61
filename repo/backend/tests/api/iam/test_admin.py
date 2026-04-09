"""
tests/api/iam/test_admin.py

Admin user-management API integration tests.
Real DB + real HTTP stack.
"""
import pytest
from iam.models import User, UserProfile
from iam.factories import UserProfileFactory

pytestmark = [pytest.mark.api, pytest.mark.django_db]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

USERS_URL  = "/api/v1/admin/users/"
STRONG_PW  = "Courier@2024!"


@pytest.fixture
def pending_user_with_profile(pending_user, tenant):
    """PENDING_REVIEW user with a profile (photo still PENDING)."""
    UserProfileFactory(
        user=pending_user,
        tenant=tenant,
        employee_student_id="PROF-001",
    )
    return pending_user


@pytest.fixture
def pending_with_approved_photo(pending_user_with_profile):
    """PENDING_REVIEW user whose photo has been approved."""
    p = pending_user_with_profile.profile
    p.photo_id_review_status = UserProfile.PhotoIdStatus.APPROVED
    p.save(update_fields=["photo_id_review_status", "updated_at"])
    return pending_user_with_profile


def _transition_url(user_id):
    return f"{USERS_URL}{user_id}/transition/"

def _review_url(user_id):
    return f"{USERS_URL}{user_id}/review-photo/"

def _assign_url(user_id):
    return f"{USERS_URL}{user_id}/assign-role/"

def _unlock_url(user_id):
    return f"{USERS_URL}{user_id}/unlock/"


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------

class TestAdminAccess:

    def test_non_admin_gets_403(self, staff_client, staff_user, assert_status):
        """Staff users cannot access admin endpoints."""
        resp = staff_client.get(USERS_URL)
        assert_status(resp, 403)

    def test_suspended_admin_gets_403(self, auth_client, admin_user, assert_status):
        """A suspended admin is rejected by IsAdmin permission."""
        admin_user.transition_status(
            User.AccountStatus.SUSPENDED, changed_by=admin_user,
            reason="Suspend admin for test"
        )
        client = auth_client(admin_user)
        resp = client.get(USERS_URL)
        assert_status(resp, 403)

    def test_admin_can_list_users(self, admin_client, assert_status):
        resp = admin_client.get(USERS_URL)
        assert_status(resp, 200)
        assert "results" in resp.data


# ---------------------------------------------------------------------------
# Status transitions
# ---------------------------------------------------------------------------

class TestStatusTransitions:

    def test_approve_pending_with_approved_photo(
        self, admin_client, pending_with_approved_photo, assert_status
    ):
        """PENDING_REVIEW → ACTIVE when photo is APPROVED."""
        resp = admin_client.post(
            _transition_url(pending_with_approved_photo.pk),
            {"new_status": "ACTIVE", "reason": "All checks passed, approving account."},
            format="json",
        )
        assert_status(resp, 200)
        pending_with_approved_photo.refresh_from_db()
        assert pending_with_approved_photo.status == User.AccountStatus.ACTIVE

    def test_approve_pending_without_approved_photo_returns_422(
        self, admin_client, pending_user_with_profile, assert_status
    ):
        """PENDING_REVIEW → ACTIVE blocked if photo is still PENDING (422)."""
        resp = admin_client.post(
            _transition_url(pending_user_with_profile.pk),
            {"new_status": "ACTIVE", "reason": "Trying to approve without photo check."},
            format="json",
        )
        assert_status(resp, 422)
        pending_user_with_profile.refresh_from_db()
        assert pending_user_with_profile.status == User.AccountStatus.PENDING_REVIEW

    def test_reject_pending_transitions_to_deactivated(
        self, admin_client, pending_user_with_profile, assert_status
    ):
        """PENDING_REVIEW → DEACTIVATED (reject)."""
        resp = admin_client.post(
            _transition_url(pending_user_with_profile.pk),
            {"new_status": "DEACTIVATED", "reason": "Documents did not pass verification."},
            format="json",
        )
        assert_status(resp, 200)
        pending_user_with_profile.refresh_from_db()
        assert pending_user_with_profile.status == User.AccountStatus.DEACTIVATED

    def test_suspend_active_user(self, admin_client, staff_user, assert_status):
        """ACTIVE → SUSPENDED."""
        resp = admin_client.post(
            _transition_url(staff_user.pk),
            {"new_status": "SUSPENDED", "reason": "Policy violation under investigation."},
            format="json",
        )
        assert_status(resp, 200)
        staff_user.refresh_from_db()
        assert staff_user.status == User.AccountStatus.SUSPENDED

    def test_reactivate_suspended_user(
        self, admin_client, suspended_user, assert_status
    ):
        """SUSPENDED → ACTIVE."""
        resp = admin_client.post(
            _transition_url(suspended_user.pk),
            {"new_status": "ACTIVE", "reason": "Investigation complete, reinstating account."},
            format="json",
        )
        assert_status(resp, 200)
        suspended_user.refresh_from_db()
        assert suspended_user.status == User.AccountStatus.ACTIVE

    def test_cannot_transition_deactivated_returns_422(
        self, admin_client, deactivated_user, assert_status
    ):
        """DEACTIVATED is terminal — any transition returns 422."""
        resp = admin_client.post(
            _transition_url(deactivated_user.pk),
            {"new_status": "ACTIVE", "reason": "Trying to reactivate deactivated account."},
            format="json",
        )
        assert_status(resp, 422)

    def test_short_reason_returns_400(self, admin_client, staff_user, assert_status):
        """Reason shorter than 10 chars → 400 (serializer validation)."""
        resp = admin_client.post(
            _transition_url(staff_user.pk),
            {"new_status": "SUSPENDED", "reason": "Too short"},
            format="json",
        )
        assert_status(resp, 400)


# ---------------------------------------------------------------------------
# Role assignment
# ---------------------------------------------------------------------------

class TestRoleAssignment:

    def test_assign_courier_role(self, admin_client, staff_user, site, assert_status):
        """Admin can reassign a staff member to COURIER and set their site."""
        resp = admin_client.post(
            _assign_url(staff_user.pk),
            {"role": "COURIER", "site_ids": [str(site.pk)]},
            format="json",
        )
        assert_status(resp, 200)
        staff_user.refresh_from_db()
        assert staff_user.role == User.Role.COURIER
        assert staff_user.site_assignments.filter(site=site).exists()

    def test_cannot_self_promote(self, admin_client, admin_user, assert_status):
        """Admin cannot modify their own role assignment."""
        resp = admin_client.post(
            _assign_url(admin_user.pk),
            {"role": "STAFF", "site_ids": []},
            format="json",
        )
        assert_status(resp, 403)


# ---------------------------------------------------------------------------
# Unlock
# ---------------------------------------------------------------------------

class TestUnlock:

    def test_unlock_clears_lockout(self, admin_client, staff_user, assert_status):
        """Admin can clear a user's lockout."""
        import datetime
        from django.utils import timezone

        staff_user.locked_until = timezone.now() + datetime.timedelta(minutes=15)
        staff_user.save(update_fields=["locked_until"])
        assert staff_user.is_locked

        resp = admin_client.post(_unlock_url(staff_user.pk))
        assert_status(resp, 200)

        staff_user.refresh_from_db()
        assert not staff_user.is_locked
        assert staff_user.failed_login_count == 0


# ---------------------------------------------------------------------------
# Create courier
# ---------------------------------------------------------------------------

class TestCreateCourier:

    def test_create_courier_returns_201_active(
        self, admin_client, site, assert_status
    ):
        """Admin can create a COURIER account directly (bypasses self-registration)."""
        resp = admin_client.post(
            f"{USERS_URL}create-courier/",
            {
                "username": "courier_new",
                "password": STRONG_PW,
                "legal_first_name": "Fast",
                "legal_last_name":  "Driver",
                "employee_student_id": "COR-001",
                "site_ids": [str(site.pk)],
            },
            format="json",
        )
        assert_status(resp, 201)
        assert resp.data["role"]   == User.Role.COURIER
        assert resp.data["status"] == User.AccountStatus.ACTIVE

        # Verify site assignment
        created = User.objects.get(username="courier_new")
        assert created.site_assignments.filter(site=site).exists()

    def test_duplicate_courier_username_returns_409(
        self, admin_client, staff_user, assert_status
    ):
        """Creating a courier with a username that already exists in this tenant → 409."""
        resp = admin_client.post(
            f"{USERS_URL}create-courier/",
            {
                "username": staff_user.username,
                "password": STRONG_PW,
                "legal_first_name": "Dup",
                "legal_last_name":  "Courier",
                "employee_student_id": "COR-DUP",
                "site_ids": [],
            },
            format="json",
        )
        assert_status(resp, 409)
