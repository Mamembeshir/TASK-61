"""
tests/unit/tenants/test_models.py

Unit tests for:
  - Tenant: unique name/slug, is_active flag, __str__
  - Site: unique name-per-tenant constraint, FK cascade, timezone default, __str__
"""
import pytest
from django.db import IntegrityError

from iam.factories import TenantFactory, SiteFactory


# ===========================================================================
# 1. Tenant model
# ===========================================================================

@pytest.mark.django_db
class TestTenantModel:

    def test_create_tenant_succeeds(self):
        t = TenantFactory()
        assert t.pk is not None
        assert t.name
        assert t.slug
        assert t.is_active is True

    def test_str_returns_name(self):
        t = TenantFactory(name="Harbor University")
        assert str(t) == "Harbor University"

    def test_name_must_be_unique(self):
        TenantFactory(name="UniqueOrg", slug="unique-org")
        with pytest.raises(IntegrityError):
            TenantFactory(name="UniqueOrg", slug="different-slug")

    def test_slug_must_be_unique(self):
        from tenants.models import Tenant
        # Use Tenant.objects.create directly — TenantFactory uses get_or_create
        # which silently returns the existing record instead of raising.
        Tenant.objects.create(name="Org A", slug="shared-slug")
        with pytest.raises(IntegrityError):
            Tenant.objects.create(name="Org B", slug="shared-slug")

    def test_is_active_defaults_to_true(self):
        from tenants.models import Tenant
        t = Tenant.objects.create(name="Test Org", slug="test-org")
        assert t.is_active is True

    def test_is_active_can_be_set_false(self):
        from tenants.models import Tenant
        t = Tenant.objects.create(name="Inactive Org", slug="inactive-org", is_active=False)
        assert t.is_active is False

    def test_uuid_primary_key(self):
        import uuid
        t = TenantFactory()
        assert isinstance(t.pk, uuid.UUID)

    def test_timestamps_are_set_automatically(self):
        t = TenantFactory()
        assert t.created_at is not None
        assert t.updated_at is not None


# ===========================================================================
# 2. Site model
# ===========================================================================

@pytest.mark.django_db
class TestSiteModel:

    def test_create_site_succeeds(self):
        tenant = TenantFactory()
        site = SiteFactory(tenant=tenant)
        assert site.pk is not None
        assert site.tenant == tenant
        assert site.is_active is True

    def test_str_includes_name_and_tenant_slug(self):
        tenant = TenantFactory(slug="harbor-ops")
        site = SiteFactory(tenant=tenant, name="Main Campus")
        assert "Main Campus" in str(site)
        assert "harbor-ops" in str(site)

    def test_timezone_defaults_to_new_york(self):
        from tenants.models import Site
        tenant = TenantFactory()
        site = Site.objects.create(tenant=tenant, name="Default TZ Site")
        assert site.timezone == "America/New_York"

    def test_unique_name_per_tenant_enforced(self):
        tenant = TenantFactory()
        SiteFactory(tenant=tenant, name="Alpha Campus")
        with pytest.raises(IntegrityError):
            SiteFactory(tenant=tenant, name="Alpha Campus")

    def test_same_name_allowed_across_different_tenants(self):
        """Two sites can share the same name if they belong to different tenants."""
        t1 = TenantFactory()
        t2 = TenantFactory()
        s1 = SiteFactory(tenant=t1, name="Main Campus")
        s2 = SiteFactory(tenant=t2, name="Main Campus")
        assert s1.pk != s2.pk

    def test_site_cascade_deletes_with_tenant(self):
        """Deleting a Tenant must cascade to delete its Sites."""
        tenant = TenantFactory()
        site = SiteFactory(tenant=tenant)
        site_pk = site.pk
        tenant.delete()
        from tenants.models import Site
        assert not Site.objects.filter(pk=site_pk).exists()

    def test_is_active_can_be_false(self):
        tenant = TenantFactory()
        site = SiteFactory(tenant=tenant, is_active=False)
        assert site.is_active is False

    def test_address_defaults_to_empty_string(self):
        from tenants.models import Site
        tenant = TenantFactory()
        site = Site.objects.create(tenant=tenant, name="No Address Site")
        assert site.address == ""

    def test_uuid_primary_key(self):
        import uuid
        tenant = TenantFactory()
        site = SiteFactory(tenant=tenant)
        assert isinstance(site.pk, uuid.UUID)

    def test_tenant_has_multiple_sites(self):
        tenant = TenantFactory()
        SiteFactory(tenant=tenant, name="Site A")
        SiteFactory(tenant=tenant, name="Site B")
        SiteFactory(tenant=tenant, name="Site C")
        assert tenant.sites.count() == 3
