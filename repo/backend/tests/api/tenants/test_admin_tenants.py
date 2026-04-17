"""
tests/api/tenants/test_admin_tenants.py

API tests for the platform-level tenant management endpoints.
All require IsSuperuser (is_superuser=True, tenant=None).

Endpoints under test:
  GET    /api/v1/admin/tenants/
  POST   /api/v1/admin/tenants/
  GET    /api/v1/admin/tenants/:pk/
  PATCH  /api/v1/admin/tenants/:pk/
  DELETE /api/v1/admin/tenants/:pk/
  GET    /api/v1/admin/tenants/:pk/sites/
  POST   /api/v1/admin/tenants/:pk/sites/
  PATCH  /api/v1/admin/tenants/:pk/sites/:site_pk/
  DELETE /api/v1/admin/tenants/:pk/sites/:site_pk/
"""
import pytest
from iam.models import User
from iam.factories import TenantFactory, SiteFactory
from tests.signed_client import make_signed_client

pytestmark = [pytest.mark.api, pytest.mark.django_db]

TENANTS_URL = "/api/v1/admin/tenants/"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def superuser(db):
    """Django superuser with no tenant (platform admin)."""
    return User.objects.create_superuser(
        username="superadmin",
        password="Test@pass1!",
    )


@pytest.fixture
def superuser_client(superuser):
    """Signed API client authenticated as the superuser."""
    return make_signed_client(superuser)


@pytest.fixture
def existing_tenant():
    return TenantFactory()


@pytest.fixture
def existing_site(existing_tenant):
    return SiteFactory(tenant=existing_tenant)


def _tenant_url(pk):
    return f"{TENANTS_URL}{pk}/"


def _tenant_sites_url(pk):
    return f"{TENANTS_URL}{pk}/sites/"


def _tenant_site_url(pk, site_pk):
    return f"{TENANTS_URL}{pk}/sites/{site_pk}/"


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------

class TestTenantAdminAccessControl:

    def test_unauthenticated_returns_401(self, api_client, assert_status):
        resp = api_client.get(TENANTS_URL)
        assert_status(resp, 401)

    def test_regular_admin_cannot_access_tenant_list(
        self, admin_client, assert_status
    ):
        """Tenant admin (IsAdmin) cannot access platform tenant management (IsSuperuser)."""
        resp = admin_client.get(TENANTS_URL)
        assert_status(resp, 403)

    def test_staff_cannot_access_tenant_list(self, staff_client, assert_status):
        resp = staff_client.get(TENANTS_URL)
        assert_status(resp, 403)


# ---------------------------------------------------------------------------
# GET /api/v1/admin/tenants/
# ---------------------------------------------------------------------------

class TestTenantList:

    def test_superuser_can_list_tenants(
        self, superuser_client, existing_tenant, assert_status
    ):
        resp = superuser_client.get(TENANTS_URL)
        assert_status(resp, 200)
        assert "results" in resp.data

    def test_list_includes_created_tenant(
        self, superuser_client, existing_tenant, assert_status
    ):
        resp = superuser_client.get(TENANTS_URL)
        assert_status(resp, 200)
        ids = [t["id"] for t in resp.data["results"]]
        assert str(existing_tenant.pk) in ids

    def test_list_response_shape(
        self, superuser_client, existing_tenant, assert_status
    ):
        resp = superuser_client.get(TENANTS_URL)
        assert_status(resp, 200)
        if resp.data["results"]:
            t = resp.data["results"][0]
            assert "id" in t
            assert "name" in t
            assert "slug" in t
            assert "is_active" in t


# ---------------------------------------------------------------------------
# POST /api/v1/admin/tenants/
# ---------------------------------------------------------------------------

class TestTenantCreate:

    def test_superuser_can_create_tenant(
        self, superuser_client, assert_status
    ):
        resp = superuser_client.post(
            TENANTS_URL,
            {"name": "New University", "slug": "new-university"},
            format="json",
        )
        assert_status(resp, 201)
        assert resp.data["name"] == "New University"
        assert resp.data["slug"] == "new-university"
        assert resp.data["is_active"] is True

    def test_create_tenant_duplicate_slug_returns_400(
        self, superuser_client, existing_tenant, assert_status
    ):
        resp = superuser_client.post(
            TENANTS_URL,
            {"name": "Duplicate", "slug": existing_tenant.slug},
            format="json",
        )
        assert_status(resp, 400)

    def test_create_tenant_missing_name_returns_400(
        self, superuser_client, assert_status
    ):
        resp = superuser_client.post(
            TENANTS_URL,
            {"slug": "no-name"},
            format="json",
        )
        assert_status(resp, 400)


# ---------------------------------------------------------------------------
# GET /api/v1/admin/tenants/:pk/
# ---------------------------------------------------------------------------

class TestTenantDetail:

    def test_superuser_can_retrieve_tenant(
        self, superuser_client, existing_tenant, assert_status
    ):
        resp = superuser_client.get(_tenant_url(existing_tenant.pk))
        assert_status(resp, 200)
        assert resp.data["id"] == str(existing_tenant.pk)
        assert resp.data["name"] == existing_tenant.name

    def test_retrieve_nonexistent_tenant_returns_404(
        self, superuser_client, assert_status
    ):
        import uuid
        resp = superuser_client.get(_tenant_url(uuid.uuid4()))
        assert_status(resp, 404)


# ---------------------------------------------------------------------------
# PATCH /api/v1/admin/tenants/:pk/
# ---------------------------------------------------------------------------

class TestTenantUpdate:

    def test_superuser_can_patch_tenant_name(
        self, superuser_client, existing_tenant, assert_status
    ):
        resp = superuser_client.patch(
            _tenant_url(existing_tenant.pk),
            {"name": "Renamed University"},
            format="json",
        )
        assert_status(resp, 200)
        assert resp.data["name"] == "Renamed University"
        existing_tenant.refresh_from_db()
        assert existing_tenant.name == "Renamed University"

    def test_superuser_can_deactivate_tenant_via_patch(
        self, superuser_client, existing_tenant, assert_status
    ):
        resp = superuser_client.patch(
            _tenant_url(existing_tenant.pk),
            {"is_active": False},
            format="json",
        )
        assert_status(resp, 200)
        assert resp.data["is_active"] is False


# ---------------------------------------------------------------------------
# DELETE /api/v1/admin/tenants/:pk/
# ---------------------------------------------------------------------------

class TestTenantDelete:

    def test_superuser_can_soft_delete_tenant(
        self, superuser_client, existing_tenant, assert_status
    ):
        resp = superuser_client.delete(_tenant_url(existing_tenant.pk))
        assert_status(resp, 204)
        existing_tenant.refresh_from_db()
        assert existing_tenant.is_active is False

    def test_delete_nonexistent_tenant_returns_404(
        self, superuser_client, assert_status
    ):
        import uuid
        resp = superuser_client.delete(_tenant_url(uuid.uuid4()))
        assert_status(resp, 404)


# ---------------------------------------------------------------------------
# GET /api/v1/admin/tenants/:pk/sites/
# ---------------------------------------------------------------------------

class TestTenantSiteList:

    def test_superuser_can_list_tenant_sites(
        self, superuser_client, existing_tenant, existing_site, assert_status
    ):
        resp = superuser_client.get(_tenant_sites_url(existing_tenant.pk))
        assert_status(resp, 200)
        assert "results" in resp.data
        ids = [s["id"] for s in resp.data["results"]]
        assert str(existing_site.pk) in ids

    def test_list_sites_for_nonexistent_tenant_returns_404(
        self, superuser_client, assert_status
    ):
        import uuid
        resp = superuser_client.get(_tenant_sites_url(uuid.uuid4()))
        assert_status(resp, 404)

    def test_sites_response_shape(
        self, superuser_client, existing_tenant, existing_site, assert_status
    ):
        resp = superuser_client.get(_tenant_sites_url(existing_tenant.pk))
        assert_status(resp, 200)
        if resp.data["results"]:
            s = resp.data["results"][0]
            assert "id" in s
            assert "name" in s
            assert "timezone" in s
            assert "is_active" in s


# ---------------------------------------------------------------------------
# POST /api/v1/admin/tenants/:pk/sites/
# ---------------------------------------------------------------------------

class TestTenantSiteCreate:

    def test_superuser_can_create_site_under_tenant(
        self, superuser_client, existing_tenant, assert_status
    ):
        resp = superuser_client.post(
            _tenant_sites_url(existing_tenant.pk),
            {
                "name": "Harbor West",
                "address": "1 Harbor Blvd",
                "timezone": "America/Chicago",
            },
            format="json",
        )
        assert_status(resp, 201)
        assert resp.data["name"] == "Harbor West"
        assert resp.data["is_active"] is True

    def test_create_site_missing_name_returns_400(
        self, superuser_client, existing_tenant, assert_status
    ):
        resp = superuser_client.post(
            _tenant_sites_url(existing_tenant.pk),
            {"address": "1 Harbor Blvd", "timezone": "UTC"},
            format="json",
        )
        assert_status(resp, 400)


# ---------------------------------------------------------------------------
# PATCH /api/v1/admin/tenants/:pk/sites/:site_pk/
# ---------------------------------------------------------------------------

class TestTenantSiteUpdate:

    def test_superuser_can_patch_site_name(
        self, superuser_client, existing_tenant, existing_site, assert_status
    ):
        resp = superuser_client.patch(
            _tenant_site_url(existing_tenant.pk, existing_site.pk),
            {"name": "Renamed Site"},
            format="json",
        )
        assert_status(resp, 200)
        assert resp.data["name"] == "Renamed Site"
        existing_site.refresh_from_db()
        assert existing_site.name == "Renamed Site"

    def test_patch_site_from_wrong_tenant_returns_404(
        self, superuser_client, existing_tenant, assert_status
    ):
        other_tenant = TenantFactory()
        other_site = SiteFactory(tenant=other_tenant)
        resp = superuser_client.patch(
            _tenant_site_url(existing_tenant.pk, other_site.pk),
            {"name": "Should Fail"},
            format="json",
        )
        assert_status(resp, 404)


# ---------------------------------------------------------------------------
# DELETE /api/v1/admin/tenants/:pk/sites/:site_pk/
# ---------------------------------------------------------------------------

class TestTenantSiteDelete:

    def test_superuser_can_soft_delete_site(
        self, superuser_client, existing_tenant, existing_site, assert_status
    ):
        resp = superuser_client.delete(
            _tenant_site_url(existing_tenant.pk, existing_site.pk)
        )
        assert_status(resp, 204)
        existing_site.refresh_from_db()
        assert existing_site.is_active is False

    def test_delete_site_from_wrong_tenant_returns_404(
        self, superuser_client, existing_tenant, assert_status
    ):
        other_tenant = TenantFactory()
        other_site = SiteFactory(tenant=other_tenant)
        resp = superuser_client.delete(
            _tenant_site_url(existing_tenant.pk, other_site.pk)
        )
        assert_status(resp, 404)
