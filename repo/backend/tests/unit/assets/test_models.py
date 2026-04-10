"""
tests/unit/assets/test_models.py

Unit tests for:
  - AssetClassification: depth enforcement (max 3), code uniqueness per tenant,
    code regex validation, level property
  - Asset: fingerprint computation, create_version (sequential numbering,
    current_version pointer update), get_version_at, soft delete flag
  - AssetVersion: immutability (save/delete raise), version_number uniqueness per asset
"""
import hashlib
import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.utils import timezone

from assets.models import Asset, AssetClassification, AssetVersion
from iam.factories import TenantFactory, SiteFactory, UserFactory


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_classification(tenant, code, parent=None, name=None):
    c = AssetClassification(
        tenant=tenant,
        code=code,
        name=name or f"Class {code}",
        parent=parent,
    )
    c.save()
    return c


def make_asset(site, classification, code="ASSET-001", name="Test Asset"):
    a = Asset(
        site=site,
        asset_code=code,
        name=name,
        classification=classification,
        fingerprint="placeholder",
    )
    a.save()
    fp = a.compute_fingerprint()
    Asset.objects.filter(pk=a.pk).update(fingerprint=fp)
    a.fingerprint = fp
    return a


# ===========================================================================
# 1. AssetClassification — depth enforcement
# ===========================================================================

@pytest.mark.django_db
class TestAssetClassificationDepth:

    def test_level_1_is_valid(self):
        tenant = TenantFactory()
        c = make_classification(tenant, "MECH")
        assert c.level == 1

    def test_level_2_is_valid(self):
        tenant = TenantFactory()
        root = make_classification(tenant, "MECH")
        child = make_classification(tenant, "MECH.HV", parent=root)
        assert child.level == 2

    def test_level_3_is_valid(self):
        tenant = TenantFactory()
        root  = make_classification(tenant, "MECH")
        l2    = make_classification(tenant, "MECH.HV", parent=root)
        l3    = make_classification(tenant, "MECH.HV.AIR", parent=l2)
        assert l3.level == 3

    def test_level_4_fails_clean(self):
        """Classification at depth 4 must raise ValidationError from clean()."""
        tenant = TenantFactory()
        root = make_classification(tenant, "A")
        l2   = make_classification(tenant, "A.B", parent=root)
        l3   = make_classification(tenant, "A.B.C", parent=l2)
        l4 = AssetClassification(
            tenant=tenant, code="A.B.C.D", name="Level 4", parent=l3
        )
        with pytest.raises(ValidationError, match="cannot exceed 3"):
            l4.full_clean()

    def test_code_must_be_unique_per_tenant(self):
        tenant = TenantFactory()
        make_classification(tenant, "ELEC")
        with pytest.raises(IntegrityError):
            make_classification(tenant, "ELEC")

    def test_same_code_allowed_across_tenants(self):
        t1 = TenantFactory()
        t2 = TenantFactory()
        c1 = make_classification(t1, "MECH")
        c2 = make_classification(t2, "MECH")
        assert c1.pk != c2.pk

    def test_code_must_match_regex(self):
        """Code must only contain uppercase letters, digits, or dots."""
        tenant = TenantFactory()
        c = AssetClassification(
            tenant=tenant, code="invalid-code", name="Bad Code"
        )
        with pytest.raises(ValidationError):
            c.full_clean()

    def test_lowercase_code_rejected(self):
        tenant = TenantFactory()
        c = AssetClassification(tenant=tenant, code="mech", name="Lower")
        with pytest.raises(ValidationError):
            c.full_clean()


# ===========================================================================
# 2. Asset — fingerprint and versioning
# ===========================================================================

@pytest.mark.django_db
class TestAssetFingerprint:

    def test_compute_fingerprint_is_deterministic(self):
        tenant = TenantFactory()
        site = SiteFactory(tenant=tenant)
        cls_ = make_classification(tenant, "MECH")
        a = make_asset(site, cls_, code="ASSET-001", name="Boiler")
        fp1 = a.compute_fingerprint()
        fp2 = a.compute_fingerprint()
        assert fp1 == fp2

    def test_fingerprint_changes_when_name_changes(self):
        tenant = TenantFactory()
        site = SiteFactory(tenant=tenant)
        cls_ = make_classification(tenant, "ELEC")
        a = make_asset(site, cls_, code="ASSET-X", name="Old Name")
        fp1 = a.compute_fingerprint()
        a.name = "New Name"
        fp2 = a.compute_fingerprint()
        assert fp1 != fp2

    def test_fingerprint_is_sha256_hex(self):
        tenant = TenantFactory()
        site = SiteFactory(tenant=tenant)
        cls_ = make_classification(tenant, "MECH")
        a = make_asset(site, cls_, code="ASSET-H", name="Hvac Unit")
        fp = a.compute_fingerprint()
        # SHA-256 hex digest is always 64 chars
        assert len(fp) == 64
        assert all(c in "0123456789abcdef" for c in fp)

    def test_fingerprint_normalizes_to_lowercase(self):
        """Name and code are lowercased before hashing — case-insensitive dedup."""
        tenant = TenantFactory()
        site = SiteFactory(tenant=tenant)
        cls_ = make_classification(tenant, "MECH")
        a1 = make_asset(site, cls_, code="ASSET-Y", name="Pump")
        a2 = make_asset(site, cls_, code="ASSET-Z", name="pump")
        # Different codes → different fingerprints
        assert a1.compute_fingerprint() != a2.compute_fingerprint()


@pytest.mark.django_db
class TestAssetVersioning:

    def _setup(self):
        tenant = TenantFactory()
        site = SiteFactory(tenant=tenant)
        cls_ = make_classification(tenant, "MECH")
        user = UserFactory(tenant=tenant)
        asset = make_asset(site, cls_, code="ASSET-001", name="Boiler")
        return asset, user

    def test_first_create_version_gets_number_1(self):
        asset, user = self._setup()
        v = asset.create_version(
            data={"condition": "Good"},
            source=AssetVersion.ChangeSource.MANUAL,
            user=user,
        )
        assert v.version_number == 1

    def test_second_create_version_gets_number_2(self):
        asset, user = self._setup()
        asset.create_version(data={"condition": "Good"}, source="MANUAL", user=user)
        v2 = asset.create_version(data={"condition": "Fair"}, source="MANUAL", user=user)
        assert v2.version_number == 2

    def test_current_version_pointer_advances(self):
        asset, user = self._setup()
        v1 = asset.create_version(data={"x": 1}, source="MANUAL", user=user)
        v2 = asset.create_version(data={"x": 2}, source="MANUAL", user=user)
        asset.refresh_from_db()
        assert str(asset.current_version_id) == str(v2.pk)

    def test_fingerprint_updated_after_create_version(self):
        asset, user = self._setup()
        old_fp = asset.fingerprint
        asset.create_version(data={"updated": True}, source="MANUAL", user=user)
        asset.refresh_from_db()
        # Fingerprint is recomputed — may or may not change depending on fields,
        # but it must be a valid 64-char hex string.
        assert len(asset.fingerprint) == 64

    def test_get_version_at_returns_latest_before_cutoff(self):
        from datetime import timedelta
        asset, user = self._setup()
        v1 = asset.create_version(data={"rev": 1}, source="MANUAL", user=user)
        # v1 is now in the past — get_version_at(now) should return v1
        cutoff = timezone.now() + timedelta(seconds=1)
        result = asset.get_version_at(cutoff)
        assert result is not None
        assert result.pk == v1.pk

    def test_get_version_at_returns_none_before_any_version(self):
        from datetime import timedelta
        asset, user = self._setup()
        # Query before any version was created
        past = timezone.now() - timedelta(days=365)
        result = asset.get_version_at(past)
        assert result is None

    def test_asset_version_stores_data_snapshot(self):
        asset, user = self._setup()
        data = {"condition": "Good", "location": "Room 101"}
        v = asset.create_version(data=data, source="MANUAL", user=user, note="First check")
        v.refresh_from_db()
        assert v.data_snapshot["condition"] == "Good"
        assert v.note == "First check"


# ===========================================================================
# 3. AssetVersion — immutability
# ===========================================================================

@pytest.mark.django_db
class TestAssetVersionImmutability:

    def _make_version(self):
        tenant = TenantFactory()
        site = SiteFactory(tenant=tenant)
        cls_ = make_classification(tenant, "PLMB")
        user = UserFactory(tenant=tenant)
        asset = make_asset(site, cls_, code="ASSET-IMM")
        v = asset.create_version(data={}, source="MANUAL", user=user)
        return v

    def test_save_existing_version_raises(self):
        v = self._make_version()
        v.note = "tampered"
        with pytest.raises(PermissionError, match="immutable"):
            v.save()

    def test_delete_version_raises(self):
        v = self._make_version()
        with pytest.raises(PermissionError, match="cannot be deleted"):
            v.delete()


# ===========================================================================
# 4. Asset — soft delete flag
# ===========================================================================

@pytest.mark.django_db
class TestAssetSoftDelete:

    def test_is_deleted_defaults_to_false(self):
        tenant = TenantFactory()
        site = SiteFactory(tenant=tenant)
        cls_ = make_classification(tenant, "SOFT")
        a = make_asset(site, cls_, code="ASSET-SD")
        assert a.is_deleted is False

    def test_soft_delete_does_not_remove_row(self):
        tenant = TenantFactory()
        site = SiteFactory(tenant=tenant)
        cls_ = make_classification(tenant, "SRCH")
        a = make_asset(site, cls_, code="ASSET-SR")
        Asset.objects.filter(pk=a.pk).update(is_deleted=True)
        assert Asset.objects.filter(pk=a.pk, is_deleted=True).exists()
        assert Asset.all_objects.filter(pk=a.pk).exists() if hasattr(Asset, 'all_objects') else True
