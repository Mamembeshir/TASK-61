"""
tests/api/assets/test_assets.py

Asset Ledger API integration tests — real DB, real HTTP stack.
"""
import pytest
from django.utils import timezone

from assets.factories import AssetClassificationFactory, AssetFactory
from assets.models    import Asset, AssetClassification, AssetVersion
from iam.factories    import UserSiteAssignmentFactory

pytestmark = [pytest.mark.api, pytest.mark.django_db]

ASSETS_URL           = "/api/v1/assets/"
CLASSIFICATIONS_URL  = "/api/v1/asset-classifications/"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def classification(tenant):
    return AssetClassificationFactory(tenant=tenant)


@pytest.fixture
def asset(site, classification):
    return AssetFactory(site=site, classification=classification)


@pytest.fixture
def staff_with_site(staff_user, site):
    """Staff user who is assigned to the default site."""
    UserSiteAssignmentFactory(user=staff_user, site=site)
    return staff_user


@pytest.fixture
def staff_with_site_client(auth_client, staff_with_site):
    return auth_client(staff_with_site)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def asset_url(pk):        return f"{ASSETS_URL}{pk}/"
def timeline_url(pk):     return f"{ASSETS_URL}{pk}/timeline/"
def as_of_url(pk, at):    return f"{ASSETS_URL}{pk}/as-of/?at={at}"


# ---------------------------------------------------------------------------
# Access control — COURIER blocked on all endpoints
# ---------------------------------------------------------------------------

class TestCourierAccess:

    def test_courier_list_returns_403(self, courier_client, assert_status):
        resp = courier_client.get(ASSETS_URL)
        assert_status(resp, 403)

    def test_courier_create_returns_403(self, courier_client, assert_status):
        resp = courier_client.post(ASSETS_URL, {}, format="json")
        assert_status(resp, 403)

    def test_courier_detail_returns_403(self, courier_client, asset, assert_status):
        resp = courier_client.get(asset_url(asset.pk))
        assert_status(resp, 403)

    def test_courier_timeline_returns_403(self, courier_client, asset, assert_status):
        resp = courier_client.get(timeline_url(asset.pk))
        assert_status(resp, 403)


# ---------------------------------------------------------------------------
# Create asset
# ---------------------------------------------------------------------------

class TestAssetCreate:

    def _payload(self, site, classification, code="AST-001", name="Test Asset"):
        return {
            "asset_code":        code,
            "name":              name,
            "site_id":           str(site.pk),
            "classification_id": str(classification.pk),
            "custom_data":       {"color": "red"},
        }

    def test_create_returns_201_with_version_1(
        self, admin_client, site, classification, assert_status
    ):
        resp = admin_client.post(
            ASSETS_URL, self._payload(site, classification), format="json"
        )
        assert_status(resp, 201)
        assert resp.data["asset_code"]             == "AST-001"
        assert resp.data["current_version_number"] == 1
        assert resp.data["data_snapshot"]          == {"color": "red"}
        assert resp.data["fingerprint"]            != ""

        # Version 1 in DB
        created = Asset.objects.get(pk=resp.data["id"])
        assert AssetVersion.objects.filter(asset=created).count() == 1
        assert created.current_version.version_number == 1

    def test_create_computes_fingerprint(
        self, admin_client, site, classification, assert_status
    ):
        import hashlib
        payload = self._payload(site, classification)
        resp = admin_client.post(ASSETS_URL, payload, format="json")
        assert_status(resp, 201)
        expected = hashlib.sha256(
            "|".join([
                str(site.pk),
                "ast-001",
                "test asset",
                classification.code,
            ]).encode()
        ).hexdigest()
        assert resp.data["fingerprint"] == expected

    def test_duplicate_fingerprint_returns_409(
        self, admin_client, site, classification, assert_status
    ):
        payload = self._payload(site, classification)
        admin_client.post(ASSETS_URL, payload, format="json")
        resp = admin_client.post(ASSETS_URL, payload, format="json")
        assert_status(resp, 409)
        assert "existing_id"   in resp.data["error"]["detail"]
        assert "existing_name" in resp.data["error"]["detail"]

    def test_lowercase_asset_code_returns_422(
        self, admin_client, site, classification, assert_status
    ):
        payload = self._payload(site, classification, code="abc")
        resp = admin_client.post(ASSETS_URL, payload, format="json")
        assert_status(resp, 422)

    def test_too_short_asset_code_returns_422(
        self, admin_client, site, classification, assert_status
    ):
        payload = self._payload(site, classification, code="AB")
        resp = admin_client.post(ASSETS_URL, payload, format="json")
        assert_status(resp, 422)

    def test_staff_assigned_site_can_create(
        self, staff_with_site_client, site, classification, assert_status
    ):
        resp = staff_with_site_client.post(
            ASSETS_URL, self._payload(site, classification), format="json"
        )
        assert_status(resp, 201)

    def test_staff_unassigned_site_returns_400(
        self, staff_client, site, classification, assert_status
    ):
        """Staff not assigned to the site get a field-level 400."""
        resp = staff_client.post(
            ASSETS_URL, self._payload(site, classification), format="json"
        )
        assert_status(resp, 400)


# ---------------------------------------------------------------------------
# Update asset (versioning + optimistic concurrency)
# ---------------------------------------------------------------------------

class TestAssetUpdate:

    def test_update_creates_version_2(
        self, admin_client, asset, classification, assert_status
    ):
        payload = {
            "name":              "Updated Name",
            "classification_id": str(classification.pk),
            "custom_data":       {"color": "blue"},
            "version_number":    asset.current_version.version_number,
        }
        resp = admin_client.put(asset_url(asset.pk), payload, format="json")
        assert_status(resp, 200)
        assert resp.data["current_version_number"] == 2
        assert resp.data["data_snapshot"]          == {"color": "blue"}

    def test_version_1_data_snapshot_unchanged_after_update(
        self, admin_client, asset, classification, assert_status
    ):
        """Version 1 must remain exactly as created — immutability check."""
        v1_snapshot = asset.current_version.data_snapshot

        admin_client.put(
            asset_url(asset.pk),
            {
                "name":              "Changed",
                "classification_id": str(classification.pk),
                "custom_data":       {"color": "blue"},
                "version_number":    asset.current_version.version_number,
            },
            format="json",
        )

        v1 = AssetVersion.objects.get(asset=asset, version_number=1)
        assert v1.data_snapshot == v1_snapshot

    def test_stale_version_number_returns_409(
        self, admin_client, asset, classification, assert_status
    ):
        payload = {
            "name":              "Whatever",
            "classification_id": str(classification.pk),
            "custom_data":       {},
            "version_number":    999,   # stale
        }
        resp = admin_client.put(asset_url(asset.pk), payload, format="json")
        assert_status(resp, 409)


# ---------------------------------------------------------------------------
# Soft delete
# ---------------------------------------------------------------------------

class TestSoftDelete:

    def test_admin_can_soft_delete(
        self, admin_client, asset, assert_status
    ):
        resp = admin_client.delete(asset_url(asset.pk))
        assert_status(resp, 204)
        asset.refresh_from_db()
        assert asset.is_deleted is True

    def test_deleted_excluded_from_default_list(
        self, admin_client, asset, assert_status
    ):
        admin_client.delete(asset_url(asset.pk))
        resp = admin_client.get(ASSETS_URL)
        ids  = [a["id"] for a in resp.data["results"]]
        assert str(asset.pk) not in ids

    def test_deleted_included_with_include_deleted_flag(
        self, admin_client, asset, assert_status
    ):
        admin_client.delete(asset_url(asset.pk))
        resp = admin_client.get(f"{ASSETS_URL}?include_deleted=true")
        ids  = [a["id"] for a in resp.data["results"]]
        assert str(asset.pk) in ids

    def test_staff_cannot_delete(
        self, staff_with_site_client, asset, assert_status
    ):
        resp = staff_with_site_client.delete(asset_url(asset.pk))
        assert_status(resp, 403)

    def test_soft_delete_creates_final_version(
        self, admin_client, asset, assert_status
    ):
        version_count_before = AssetVersion.objects.filter(asset=asset).count()
        admin_client.delete(asset_url(asset.pk))
        assert AssetVersion.objects.filter(asset=asset).count() == version_count_before + 1
        last_version = AssetVersion.objects.filter(asset=asset).order_by("-version_number").first()
        assert "soft-deleted" in last_version.note.lower()


# ---------------------------------------------------------------------------
# STAFF site isolation
# ---------------------------------------------------------------------------

class TestStaffSiteIsolation:

    def test_staff_cannot_see_other_site_asset(
        self, auth_client, staff_user, asset, assert_status
    ):
        """staff_user has no site assignment → asset is invisible (404)."""
        client = auth_client(staff_user)
        resp   = client.get(asset_url(asset.pk))
        assert_status(resp, 404)

    def test_staff_assigned_site_can_see_asset(
        self, staff_with_site_client, asset, assert_status
    ):
        resp = staff_with_site_client.get(asset_url(asset.pk))
        assert_status(resp, 200)
        assert resp.data["asset_code"] == asset.asset_code


# ---------------------------------------------------------------------------
# Timeline
# ---------------------------------------------------------------------------

class TestTimeline:

    def test_timeline_returns_all_versions_newest_first(
        self, admin_client, asset, classification, assert_status
    ):
        # Create version 2
        admin_client.put(
            asset_url(asset.pk),
            {
                "name":              asset.name,
                "classification_id": str(classification.pk),
                "custom_data":       {"v": 2},
                "version_number":    1,
            },
            format="json",
        )

        resp     = admin_client.get(timeline_url(asset.pk))
        versions = resp.data["results"]
        assert_status(resp, 200)
        assert len(versions) == 2
        assert versions[0]["version_number"] == 2
        assert versions[1]["version_number"] == 1


# ---------------------------------------------------------------------------
# As-of query
# ---------------------------------------------------------------------------

class TestAsOf:

    def test_as_of_returns_version_at_timestamp(
        self, admin_client, asset, classification, assert_status
    ):
        v1 = asset.current_version
        # Artificially place v1 in the past so v2's time is after it
        from datetime import timedelta
        t_v1 = timezone.now() - timedelta(seconds=10)
        # Push v1's created_at into the past via direct queryset update
        AssetVersion.objects.filter(pk=v1.pk).update(created_at=t_v1)

        # Create version 2 (will have current time)
        admin_client.put(
            asset_url(asset.pk),
            {
                "name":              asset.name,
                "classification_id": str(classification.pk),
                "custom_data":       {"version": 2},
                "version_number":    1,
            },
            format="json",
        )

        # Query at a time between v1 and v2 → should return v1
        at = (t_v1 + timedelta(seconds=5)).isoformat().replace("+00:00", "Z")
        resp = admin_client.get(as_of_url(asset.pk, at))
        assert_status(resp, 200)
        assert resp.data["version_number"] == 1

    def test_as_of_missing_param_returns_400(
        self, admin_client, asset, assert_status
    ):
        resp = admin_client.get(f"{ASSETS_URL}{asset.pk}/as-of/")
        assert_status(resp, 400)

    def test_as_of_before_creation_returns_404(
        self, admin_client, asset, assert_status
    ):
        resp = admin_client.get(as_of_url(asset.pk, "2000-01-01T00:00:00Z"))
        assert_status(resp, 404)


# ---------------------------------------------------------------------------
# Classification tree
# ---------------------------------------------------------------------------

class TestClassifications:

    def test_create_classification_depth_1(
        self, admin_client, assert_status
    ):
        resp = admin_client.post(
            CLASSIFICATIONS_URL,
            {"code": "ELEC", "name": "Electronics"},
            format="json",
        )
        assert_status(resp, 201)
        assert resp.data["level"] == 1

    def test_create_classification_depth_3(
        self, admin_client, tenant, assert_status
    ):
        l1 = AssetClassificationFactory(tenant=tenant, code="L1")
        l2 = AssetClassificationFactory(tenant=tenant, code="L1.A", parent=l1)

        resp = admin_client.post(
            CLASSIFICATIONS_URL,
            {"code": "L1.A.1", "name": "Level 3", "parent": str(l2.pk)},
            format="json",
        )
        assert_status(resp, 201)
        assert resp.data["level"] == 3

    def test_classification_depth_exceeds_3_returns_422(
        self, admin_client, tenant, assert_status
    ):
        l1 = AssetClassificationFactory(tenant=tenant, code="D1")
        l2 = AssetClassificationFactory(tenant=tenant, code="D1.A", parent=l1)
        l3 = AssetClassificationFactory(tenant=tenant, code="D1.A.1", parent=l2)

        resp = admin_client.post(
            CLASSIFICATIONS_URL,
            {"code": "D1.A.1.X", "name": "Level 4", "parent": str(l3.pk)},
            format="json",
        )
        assert_status(resp, 422)

    def test_non_admin_cannot_create_classification(
        self, staff_client, assert_status
    ):
        resp = staff_client.post(
            CLASSIFICATIONS_URL,
            {"code": "X", "name": "X"},
            format="json",
        )
        assert_status(resp, 403)

    def test_list_returns_tree_structure(
        self, admin_client, tenant, assert_status
    ):
        root  = AssetClassificationFactory(tenant=tenant, code="ROOT")
        child = AssetClassificationFactory(tenant=tenant, code="ROOT.A", parent=root)

        resp = admin_client.get(CLASSIFICATIONS_URL)
        assert_status(resp, 200)

        roots = [c for c in resp.data["results"] if c["code"] == "ROOT"]
        assert len(roots) == 1
        assert any(c["code"] == "ROOT.A" for c in roots[0]["children"])
