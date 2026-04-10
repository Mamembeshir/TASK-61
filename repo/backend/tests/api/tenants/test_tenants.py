"""
tests/api/tenants/test_tenants.py

API tests for:
  - GET /api/v1/tenants/sites/  — auth required, role-based site scoping:
      ADMIN sees all active sites for the tenant
      STAFF sees only their assigned sites
      COURIER sees only their assigned sites
      Inactive sites are hidden from everyone
"""
import pytest
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token

from iam.factories import (
    TenantFactory, SiteFactory, UserFactory,
    AdminUserFactory, UserSiteAssignmentFactory,
)
from iam.models import User


pytestmark = [pytest.mark.api, pytest.mark.django_db]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_client(user):
    token, _ = Token.objects.get_or_create(user=user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
    return client


SITES_URL = "/api/v1/tenants/sites/"


# ===========================================================================
# 1. Authentication
# ===========================================================================

class TestSiteListAuth:

    def test_unauthenticated_returns_401(self):
        resp = APIClient().get(SITES_URL)
        assert resp.status_code == 401


# ===========================================================================
# 2. ADMIN — sees all active sites for the tenant
# ===========================================================================

class TestAdminSiteList:

    def test_admin_sees_all_active_sites(self):
        tenant = TenantFactory()
        SiteFactory(tenant=tenant, name="Alpha")
        SiteFactory(tenant=tenant, name="Beta")
        SiteFactory(tenant=tenant, name="Gamma")
        admin = AdminUserFactory(tenant=tenant)
        resp = make_client(admin).get(SITES_URL)
        assert resp.status_code == 200
        names = {s["name"] for s in resp.data}
        assert {"Alpha", "Beta", "Gamma"} <= names

    def test_admin_does_not_see_inactive_sites(self):
        tenant = TenantFactory()
        SiteFactory(tenant=tenant, name="Active Site", is_active=True)
        SiteFactory(tenant=tenant, name="Inactive Site", is_active=False)
        admin = AdminUserFactory(tenant=tenant)
        resp = make_client(admin).get(SITES_URL)
        names = {s["name"] for s in resp.data}
        assert "Active Site" in names
        assert "Inactive Site" not in names

    def test_admin_does_not_see_other_tenant_sites(self):
        tenant_a = TenantFactory()
        tenant_b = TenantFactory()
        SiteFactory(tenant=tenant_a, name="Tenant A Site")
        SiteFactory(tenant=tenant_b, name="Tenant B Site")
        admin = AdminUserFactory(tenant=tenant_a)
        resp = make_client(admin).get(SITES_URL)
        names = {s["name"] for s in resp.data}
        assert "Tenant A Site" in names
        assert "Tenant B Site" not in names

    def test_admin_empty_tenant_returns_empty_list(self):
        tenant = TenantFactory()
        admin = AdminUserFactory(tenant=tenant)
        resp = make_client(admin).get(SITES_URL)
        assert resp.status_code == 200
        assert resp.data == []

    def test_response_shape_has_id_name_timezone(self):
        tenant = TenantFactory()
        SiteFactory(tenant=tenant, name="Shape Site")
        admin = AdminUserFactory(tenant=tenant)
        resp = make_client(admin).get(SITES_URL)
        assert len(resp.data) >= 1
        site = resp.data[0]
        assert "id" in site
        assert "name" in site
        assert "timezone" in site


# ===========================================================================
# 3. STAFF — sees only assigned sites
# ===========================================================================

class TestStaffSiteList:

    def test_staff_sees_only_assigned_sites(self):
        tenant = TenantFactory()
        assigned_site = SiteFactory(tenant=tenant, name="Assigned")
        other_site    = SiteFactory(tenant=tenant, name="Not Assigned")
        staff = UserFactory(tenant=tenant, role=User.Role.STAFF)
        UserSiteAssignmentFactory(user=staff, site=assigned_site)

        resp = make_client(staff).get(SITES_URL)
        names = {s["name"] for s in resp.data}
        assert "Assigned" in names
        assert "Not Assigned" not in names

    def test_staff_with_no_assignments_sees_empty_list(self):
        tenant = TenantFactory()
        SiteFactory(tenant=tenant, name="Unassigned Site")
        staff = UserFactory(tenant=tenant, role=User.Role.STAFF)
        resp = make_client(staff).get(SITES_URL)
        assert resp.status_code == 200
        assert resp.data == []

    def test_staff_with_multiple_assignments(self):
        tenant = TenantFactory()
        s1 = SiteFactory(tenant=tenant, name="Site 1")
        s2 = SiteFactory(tenant=tenant, name="Site 2")
        SiteFactory(tenant=tenant, name="Site 3")  # not assigned
        staff = UserFactory(tenant=tenant, role=User.Role.STAFF)
        UserSiteAssignmentFactory(user=staff, site=s1)
        UserSiteAssignmentFactory(user=staff, site=s2)

        resp = make_client(staff).get(SITES_URL)
        names = {s["name"] for s in resp.data}
        assert "Site 1" in names
        assert "Site 2" in names
        assert "Site 3" not in names

    def test_staff_does_not_see_inactive_assigned_sites(self):
        tenant = TenantFactory()
        inactive_site = SiteFactory(tenant=tenant, name="Inactive", is_active=False)
        staff = UserFactory(tenant=tenant, role=User.Role.STAFF)
        UserSiteAssignmentFactory(user=staff, site=inactive_site)

        resp = make_client(staff).get(SITES_URL)
        names = {s["name"] for s in resp.data}
        assert "Inactive" not in names


# ===========================================================================
# 4. COURIER — sees only assigned sites
# ===========================================================================

class TestCourierSiteList:

    def test_courier_sees_only_assigned_sites(self):
        tenant = TenantFactory()
        assigned_site = SiteFactory(tenant=tenant, name="Courier Site")
        SiteFactory(tenant=tenant, name="Other Site")
        courier = UserFactory(tenant=tenant, role=User.Role.COURIER)
        UserSiteAssignmentFactory(user=courier, site=assigned_site)

        resp = make_client(courier).get(SITES_URL)
        names = {s["name"] for s in resp.data}
        assert "Courier Site" in names
        assert "Other Site" not in names

    def test_courier_with_no_assignments_sees_empty_list(self):
        tenant = TenantFactory()
        SiteFactory(tenant=tenant, name="Unassigned")
        courier = UserFactory(tenant=tenant, role=User.Role.COURIER)

        resp = make_client(courier).get(SITES_URL)
        assert resp.status_code == 200
        assert resp.data == []


# ===========================================================================
# 5. Site isolation across tenants
# ===========================================================================

class TestCrossTenantIsolation:

    def test_staff_cannot_see_other_tenant_sites_via_assignment(self):
        """
        Even if a UserSiteAssignment somehow pointed to a site in another tenant
        (which shouldn't happen), the active-only filter means no cross-tenant bleed.
        We verify the normal case: STAFF only sees their own tenant's assigned sites.
        """
        tenant_a = TenantFactory()
        tenant_b = TenantFactory()
        site_a = SiteFactory(tenant=tenant_a, name="A-Site")
        SiteFactory(tenant=tenant_b, name="B-Site")
        staff_a = UserFactory(tenant=tenant_a, role=User.Role.STAFF)
        UserSiteAssignmentFactory(user=staff_a, site=site_a)

        resp = make_client(staff_a).get(SITES_URL)
        names = {s["name"] for s in resp.data}
        assert "A-Site" in names
        assert "B-Site" not in names
