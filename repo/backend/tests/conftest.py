"""
tests/conftest.py

Fixtures shared across BOTH unit and api test suites:
  - one Tenant + one Site per test (via factory_boy)
  - pre-built admin, staff, courier, and pending users
  - raw factory access (TenantFactory, UserFactory, …)

All fixtures here assume access to the real DB (pytest.mark.django_db is
applied at the suite level in unit/conftest.py and api/conftest.py).
"""
import pytest

from iam.factories import (
    TenantFactory,
    SiteFactory,
    UserFactory,
    AdminUserFactory,
    PendingUserFactory,
    UserProfileFactory,
    UserSiteAssignmentFactory,
)
from iam.models import User


# ---------------------------------------------------------------------------
# Re-export factories as fixtures so tests can request them directly
# ---------------------------------------------------------------------------

@pytest.fixture
def tenant_factory():
    return TenantFactory

@pytest.fixture
def site_factory():
    return SiteFactory

@pytest.fixture
def user_factory():
    return UserFactory

@pytest.fixture
def admin_user_factory():
    return AdminUserFactory

@pytest.fixture
def pending_user_factory():
    return PendingUserFactory

@pytest.fixture
def user_profile_factory():
    return UserProfileFactory

@pytest.fixture
def user_site_assignment_factory():
    return UserSiteAssignmentFactory


# ---------------------------------------------------------------------------
# Pre-built default objects
# ---------------------------------------------------------------------------

@pytest.fixture
def tenant():
    """A single active Tenant for use in tests that only need one."""
    return TenantFactory()


@pytest.fixture
def site(tenant):
    """A single Site belonging to the default tenant."""
    return SiteFactory(tenant=tenant)


@pytest.fixture
def admin_user(tenant):
    """An ACTIVE Admin user scoped to the default tenant."""
    return AdminUserFactory(tenant=tenant)


@pytest.fixture
def staff_user(tenant):
    """An ACTIVE Staff user scoped to the default tenant."""
    return UserFactory(tenant=tenant, role=User.Role.STAFF)


@pytest.fixture
def courier_user(tenant):
    """An ACTIVE Courier user scoped to the default tenant."""
    return UserFactory(tenant=tenant, role=User.Role.COURIER)


@pytest.fixture
def pending_user(tenant):
    """A PENDING_REVIEW Staff user scoped to the default tenant."""
    return PendingUserFactory(tenant=tenant)


@pytest.fixture
def suspended_user(tenant, admin_user):
    """A SUSPENDED Staff user (transitioned from ACTIVE)."""
    user = UserFactory(tenant=tenant, status=User.AccountStatus.ACTIVE)
    user.transition_status(
        User.AccountStatus.SUSPENDED,
        changed_by=admin_user,
        reason="Suspended for testing",
    )
    return user


@pytest.fixture
def deactivated_user(tenant, admin_user):
    """A DEACTIVATED Staff user (terminal state)."""
    user = UserFactory(tenant=tenant, status=User.AccountStatus.ACTIVE)
    user.transition_status(
        User.AccountStatus.DEACTIVATED,
        changed_by=admin_user,
        reason="Deactivated for testing",
    )
    return user
