"""
iam/tests/test_models.py

Unit tests for:
  - Account status state machine (all valid/invalid transitions, terminal state)
  - Login lockout (5 fails locks, no extension during lockout, successful reset)
  - Government ID encryption round-trip and mask
  - Username uniqueness per-tenant (same username across tenants is allowed)
  - Employee/student ID uniqueness per-tenant
"""
import pytest
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.utils import timezone

from iam.factories import (
    TenantFactory,
    SiteFactory,
    UserFactory,
    AdminUserFactory,
    PendingUserFactory,
    UserProfileFactory,
    UserSiteAssignmentFactory,
)
from iam.models import (
    User,
    UserProfile,
    UserSiteAssignment,
    AccountStatusHistory,
)


# ===========================================================================
# Helpers
# ===========================================================================

def make_admin(tenant=None):
    if tenant is None:
        tenant = TenantFactory()
    return AdminUserFactory(tenant=tenant)


# ===========================================================================
# 1. Account status state machine
# ===========================================================================

@pytest.mark.django_db
class TestStatusStateMachine:
    """PRD §10.1 — all valid transitions, invalid transitions, terminal state."""

    # ---- valid transitions ------------------------------------------------

    def test_pending_review_to_active(self):
        user = PendingUserFactory()
        admin = make_admin(tenant=user.tenant)
        user.transition_status(User.AccountStatus.ACTIVE, changed_by=admin, reason="Approved")
        user.refresh_from_db()
        assert user.status == User.AccountStatus.ACTIVE

    def test_pending_review_to_deactivated(self):
        user = PendingUserFactory()
        admin = make_admin(tenant=user.tenant)
        user.transition_status(User.AccountStatus.DEACTIVATED, changed_by=admin, reason="Rejected")
        user.refresh_from_db()
        assert user.status == User.AccountStatus.DEACTIVATED

    def test_active_to_suspended(self):
        user = UserFactory(status=User.AccountStatus.ACTIVE)
        admin = make_admin(tenant=user.tenant)
        user.transition_status(User.AccountStatus.SUSPENDED, changed_by=admin, reason="Policy breach")
        user.refresh_from_db()
        assert user.status == User.AccountStatus.SUSPENDED

    def test_active_to_deactivated(self):
        user = UserFactory(status=User.AccountStatus.ACTIVE)
        admin = make_admin(tenant=user.tenant)
        user.transition_status(User.AccountStatus.DEACTIVATED, changed_by=admin, reason="Terminated")
        user.refresh_from_db()
        assert user.status == User.AccountStatus.DEACTIVATED

    def test_suspended_to_active(self):
        user = UserFactory(status=User.AccountStatus.SUSPENDED)
        admin = make_admin(tenant=user.tenant)
        user.transition_status(User.AccountStatus.ACTIVE, changed_by=admin, reason="Reinstated")
        user.refresh_from_db()
        assert user.status == User.AccountStatus.ACTIVE

    def test_suspended_to_deactivated(self):
        user = UserFactory(status=User.AccountStatus.SUSPENDED)
        admin = make_admin(tenant=user.tenant)
        user.transition_status(User.AccountStatus.DEACTIVATED, changed_by=admin, reason="Terminated")
        user.refresh_from_db()
        assert user.status == User.AccountStatus.DEACTIVATED

    # ---- status history is recorded ---------------------------------------

    def test_transition_creates_history_record(self):
        user = PendingUserFactory()
        admin = make_admin(tenant=user.tenant)
        user.transition_status(User.AccountStatus.ACTIVE, changed_by=admin, reason="Looks good")
        history = AccountStatusHistory.objects.filter(user=user).order_by("-timestamp")
        assert history.count() == 1
        record = history.first()
        assert record.old_status == User.AccountStatus.PENDING_REVIEW
        assert record.new_status == User.AccountStatus.ACTIVE
        assert record.changed_by == admin
        assert record.reason == "Looks good"

    def test_multiple_transitions_all_recorded(self):
        user = PendingUserFactory()
        admin = make_admin(tenant=user.tenant)
        user.transition_status(User.AccountStatus.ACTIVE,    changed_by=admin, reason="Step 1")
        user.transition_status(User.AccountStatus.SUSPENDED, changed_by=admin, reason="Step 2")
        user.transition_status(User.AccountStatus.ACTIVE,    changed_by=admin, reason="Step 3")
        assert AccountStatusHistory.objects.filter(user=user).count() == 3

    # ---- invalid transitions ----------------------------------------------

    def test_pending_review_to_suspended_is_invalid(self):
        user = PendingUserFactory()
        admin = make_admin(tenant=user.tenant)
        with pytest.raises(ValidationError, match="PENDING_REVIEW"):
            user.transition_status(User.AccountStatus.SUSPENDED, changed_by=admin, reason="Bad")

    def test_active_to_pending_review_is_invalid(self):
        user = UserFactory(status=User.AccountStatus.ACTIVE)
        admin = make_admin(tenant=user.tenant)
        with pytest.raises(ValidationError):
            user.transition_status(User.AccountStatus.PENDING_REVIEW, changed_by=admin, reason="Rollback")

    def test_suspended_to_pending_review_is_invalid(self):
        user = UserFactory(status=User.AccountStatus.SUSPENDED)
        admin = make_admin(tenant=user.tenant)
        with pytest.raises(ValidationError):
            user.transition_status(User.AccountStatus.PENDING_REVIEW, changed_by=admin, reason="Rollback")

    def test_unknown_status_is_rejected(self):
        user = UserFactory(status=User.AccountStatus.ACTIVE)
        admin = make_admin(tenant=user.tenant)
        with pytest.raises(ValidationError, match="not a valid account status"):
            user.transition_status("LIMBO", changed_by=admin, reason="Whatever")

    # ---- DEACTIVATED is terminal (questions.md §1.6) ----------------------

    def test_deactivated_to_active_is_terminal(self):
        user = UserFactory(status=User.AccountStatus.DEACTIVATED)
        admin = make_admin(tenant=user.tenant)
        with pytest.raises(ValidationError, match="terminal"):
            user.transition_status(User.AccountStatus.ACTIVE, changed_by=admin, reason="Reactivate")

    def test_deactivated_to_suspended_is_terminal(self):
        user = UserFactory(status=User.AccountStatus.DEACTIVATED)
        admin = make_admin(tenant=user.tenant)
        with pytest.raises(ValidationError, match="terminal"):
            user.transition_status(User.AccountStatus.SUSPENDED, changed_by=admin, reason="Re-suspend")

    def test_deactivated_to_pending_review_is_terminal(self):
        user = UserFactory(status=User.AccountStatus.DEACTIVATED)
        admin = make_admin(tenant=user.tenant)
        with pytest.raises(ValidationError, match="terminal"):
            user.transition_status(User.AccountStatus.PENDING_REVIEW, changed_by=admin, reason="Reset")

    def test_deactivated_to_deactivated_is_terminal(self):
        user = UserFactory(status=User.AccountStatus.DEACTIVATED)
        admin = make_admin(tenant=user.tenant)
        with pytest.raises(ValidationError, match="terminal"):
            user.transition_status(User.AccountStatus.DEACTIVATED, changed_by=admin, reason="Again")

    # ---- reason is required -----------------------------------------------

    def test_empty_reason_raises(self):
        user = PendingUserFactory()
        admin = make_admin(tenant=user.tenant)
        with pytest.raises(ValidationError, match="reason"):
            user.transition_status(User.AccountStatus.ACTIVE, changed_by=admin, reason="")

    def test_whitespace_reason_raises(self):
        user = PendingUserFactory()
        admin = make_admin(tenant=user.tenant)
        with pytest.raises(ValidationError, match="reason"):
            user.transition_status(User.AccountStatus.ACTIVE, changed_by=admin, reason="   ")

    # ---- status not mutated on invalid transition -------------------------

    def test_status_unchanged_after_invalid_transition(self):
        user = PendingUserFactory()
        admin = make_admin(tenant=user.tenant)
        with pytest.raises(ValidationError):
            user.transition_status(User.AccountStatus.SUSPENDED, changed_by=admin, reason="Bad")
        user.refresh_from_db()
        assert user.status == User.AccountStatus.PENDING_REVIEW

    def test_history_not_created_after_invalid_transition(self):
        user = PendingUserFactory()
        admin = make_admin(tenant=user.tenant)
        with pytest.raises(ValidationError):
            user.transition_status(User.AccountStatus.SUSPENDED, changed_by=admin, reason="Bad")
        assert AccountStatusHistory.objects.filter(user=user).count() == 0


# ===========================================================================
# 2. AccountStatusHistory immutability
# ===========================================================================

@pytest.mark.django_db
class TestStatusHistoryImmutability:

    def test_history_record_cannot_be_updated(self):
        user  = PendingUserFactory()
        admin = make_admin(tenant=user.tenant)
        user.transition_status(User.AccountStatus.ACTIVE, changed_by=admin, reason="OK")
        record = AccountStatusHistory.objects.filter(user=user).first()
        with pytest.raises(PermissionError):
            record.reason = "Tampered"
            record.save()

    def test_history_record_cannot_be_deleted(self):
        user  = PendingUserFactory()
        admin = make_admin(tenant=user.tenant)
        user.transition_status(User.AccountStatus.ACTIVE, changed_by=admin, reason="OK")
        record = AccountStatusHistory.objects.filter(user=user).first()
        with pytest.raises(PermissionError):
            record.delete()


# ===========================================================================
# 3. Login lockout (questions.md §2.1)
# ===========================================================================

@pytest.mark.django_db
class TestLoginLockout:

    def _fresh_user(self):
        return UserFactory(status=User.AccountStatus.ACTIVE)

    def test_is_locked_false_when_no_lock(self):
        user = self._fresh_user()
        assert user.is_locked is False

    def test_is_locked_true_within_window(self):
        user = self._fresh_user()
        user.locked_until = timezone.now() + timedelta(minutes=15)
        assert user.is_locked is True

    def test_is_locked_false_after_window_expires(self):
        user = self._fresh_user()
        user.locked_until = timezone.now() - timedelta(seconds=1)
        assert user.is_locked is False

    def test_five_failures_locks_account(self):
        user = self._fresh_user()
        for _ in range(5):
            user.record_failed_login()
        user.refresh_from_db()
        assert user.is_locked is True
        assert user.locked_until is not None

    def test_fewer_than_five_failures_does_not_lock(self):
        user = self._fresh_user()
        for _ in range(4):
            user.record_failed_login()
        user.refresh_from_db()
        assert user.is_locked is False
        assert user.failed_login_count == 4

    def test_attempts_during_lockout_do_not_increment_counter(self):
        """questions.md §2.1: counter must not grow while locked."""
        user = self._fresh_user()
        for _ in range(5):
            user.record_failed_login()
        user.refresh_from_db()
        count_at_lock = user.failed_login_count

        for _ in range(3):
            user.record_failed_login()
        user.refresh_from_db()

        assert user.failed_login_count == count_at_lock

    def test_attempts_during_lockout_do_not_extend_timer(self):
        """questions.md §2.1: locked_until must not change during lockout."""
        user = self._fresh_user()
        for _ in range(5):
            user.record_failed_login()
        user.refresh_from_db()
        original_locked_until = user.locked_until

        user.record_failed_login()
        user.refresh_from_db()

        assert user.locked_until == original_locked_until

    def test_successful_login_resets_counter_and_lock(self):
        user = self._fresh_user()
        for _ in range(5):
            user.record_failed_login()
        user.record_successful_login()
        user.refresh_from_db()
        assert user.failed_login_count == 0
        assert user.locked_until is None
        assert user.is_locked is False

    def test_successful_login_resets_partial_counter(self):
        user = self._fresh_user()
        for _ in range(3):
            user.record_failed_login()
        user.record_successful_login()
        user.refresh_from_db()
        assert user.failed_login_count == 0


# ===========================================================================
# 4. Government ID encryption round-trip and masking
# ===========================================================================

@pytest.mark.django_db
class TestGovernmentIdEncryption:

    def _profile_with_gov_id(self, plaintext: str) -> UserProfile:
        profile = UserProfileFactory()
        profile.set_government_id(plaintext)
        profile.save()
        return profile

    def test_roundtrip_ssn_format(self):
        profile = self._profile_with_gov_id("123-45-6789")
        profile.refresh_from_db()
        assert profile.get_government_id() == "123-45-6789"

    def test_roundtrip_arbitrary_string(self):
        profile = self._profile_with_gov_id("AB1234567")
        profile.refresh_from_db()
        assert profile.get_government_id() == "AB1234567"

    def test_ciphertext_differs_from_plaintext(self):
        plaintext = "123-45-6789"
        profile = self._profile_with_gov_id(plaintext)
        raw = bytes(profile.government_id_encrypted).decode("ascii")
        assert raw != plaintext

    def test_two_encryptions_of_same_value_differ(self):
        """AES-GCM uses a random nonce — each encryption is unique."""
        profile1 = self._profile_with_gov_id("123-45-6789")
        profile2 = self._profile_with_gov_id("123-45-6789")
        assert profile1.government_id_encrypted != profile2.government_id_encrypted

    def test_mask_shows_last_four_only(self):
        profile = self._profile_with_gov_id("123-45-6789")
        assert profile.government_id_mask == "*******6789"

    def test_mask_short_value_exact_four(self):
        profile = self._profile_with_gov_id("1234")
        assert profile.government_id_mask == "****"

    def test_mask_short_value_fewer_than_four(self):
        profile = self._profile_with_gov_id("12")
        assert profile.government_id_mask == "**"

    def test_set_none_clears_fields(self):
        profile = self._profile_with_gov_id("123-45-6789")
        profile.set_government_id(None)
        profile.save()
        assert profile.government_id_encrypted is None
        assert profile.government_id_mask == ""
        assert profile.get_government_id() is None

    def test_set_empty_string_clears_fields(self):
        profile = self._profile_with_gov_id("123-45-6789")
        profile.set_government_id("")
        profile.save()
        assert profile.government_id_encrypted is None
        assert profile.get_government_id() is None


# ===========================================================================
# 5. Username uniqueness per tenant
# ===========================================================================

@pytest.mark.django_db
class TestUsernameUniqueness:

    def test_duplicate_username_same_tenant_raises(self):
        tenant = TenantFactory()
        UserFactory(tenant=tenant, username="alice")
        # Bypass factory get_or_create — force a raw INSERT to hit the DB constraint
        with pytest.raises(IntegrityError):
            User.objects.create_user(username="alice", tenant=tenant, password="Test@pass1!")

    def test_same_username_different_tenants_is_allowed(self):
        tenant_a = TenantFactory()
        tenant_b = TenantFactory()
        user_a = UserFactory(tenant=tenant_a, username="alice")
        user_b = UserFactory(tenant=tenant_b, username="alice")
        assert user_a.pk != user_b.pk

    def test_different_usernames_same_tenant_is_allowed(self):
        tenant = TenantFactory()
        UserFactory(tenant=tenant, username="alice")
        UserFactory(tenant=tenant, username="bob")


# ===========================================================================
# 6. Employee / student ID uniqueness per tenant
# ===========================================================================

@pytest.mark.django_db
class TestEmployeeIdUniqueness:

    def test_duplicate_employee_id_same_tenant_raises(self):
        tenant = TenantFactory()
        user_a = UserFactory(tenant=tenant)
        user_b = UserFactory(tenant=tenant)
        UserProfileFactory(user=user_a, tenant=tenant, employee_student_id="EMP001")
        with pytest.raises(IntegrityError):
            UserProfileFactory(user=user_b, tenant=tenant, employee_student_id="EMP001")

    def test_same_employee_id_different_tenants_is_allowed(self):
        tenant_a = TenantFactory()
        tenant_b = TenantFactory()
        user_a = UserFactory(tenant=tenant_a)
        user_b = UserFactory(tenant=tenant_b)
        profile_a = UserProfileFactory(user=user_a, tenant=tenant_a, employee_student_id="EMP001")
        profile_b = UserProfileFactory(user=user_b, tenant=tenant_b, employee_student_id="EMP001")
        assert profile_a.pk != profile_b.pk

    def test_different_employee_ids_same_tenant_is_allowed(self):
        tenant = TenantFactory()
        user_a = UserFactory(tenant=tenant)
        user_b = UserFactory(tenant=tenant)
        UserProfileFactory(user=user_a, tenant=tenant, employee_student_id="EMP001")
        UserProfileFactory(user=user_b, tenant=tenant, employee_student_id="EMP002")


# ===========================================================================
# 7. UserSiteAssignment uniqueness
# ===========================================================================

@pytest.mark.django_db
class TestUserSiteAssignment:

    def test_duplicate_assignment_raises(self):
        tenant = TenantFactory()
        user = UserFactory(tenant=tenant)
        site = SiteFactory(tenant=tenant)
        UserSiteAssignmentFactory(user=user, site=site)
        with pytest.raises(IntegrityError):
            UserSiteAssignmentFactory(user=user, site=site)

    def test_same_user_different_sites_allowed(self):
        tenant = TenantFactory()
        user = UserFactory(tenant=tenant)
        site_a = SiteFactory(tenant=tenant)
        site_b = SiteFactory(tenant=tenant)
        UserSiteAssignmentFactory(user=user, site=site_a)
        UserSiteAssignmentFactory(user=user, site=site_b)


# ===========================================================================
# 8. UserProfile tenant auto-population
# ===========================================================================

@pytest.mark.django_db
class TestUserProfileTenantSync:

    def test_profile_tenant_matches_user_tenant(self):
        tenant = TenantFactory()
        user = UserFactory(tenant=tenant)
        profile = UserProfileFactory(user=user, tenant=tenant)
        assert profile.tenant == user.tenant
