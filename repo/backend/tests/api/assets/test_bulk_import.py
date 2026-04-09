"""
tests/api/assets/test_bulk_import.py

Bulk import / export API integration tests.
"""
import csv
import io
import uuid
from unittest import mock

import pytest

from assets.factories import AssetClassificationFactory, AssetFactory
from assets.models    import Asset, BulkImportJob
from iam.factories    import UserSiteAssignmentFactory

pytestmark = [pytest.mark.api, pytest.mark.django_db]

IMPORT_URL = "/api/v1/assets/import/"
EXPORT_URL = "/api/v1/assets/export/"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def classification(tenant):
    return AssetClassificationFactory(tenant=tenant, code="MECH")


@pytest.fixture
def admin_client(auth_client, admin_user):
    return auth_client(admin_user)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_csv(*rows, extra_headers=()):
    """
    Build an in-memory CSV file-like object.

    `rows` is a list of dicts with at least asset_code, name, classification_code.
    Returns a BytesIO (with .name set) suitable for multipart upload.
    """
    headers = ["asset_code", "name", "classification_code"] + list(extra_headers)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    result = io.BytesIO(buf.getvalue().encode("utf-8"))
    result.name = "test.csv"
    return result


def import_url(job_id, suffix=""):
    return f"{IMPORT_URL}{job_id}/{suffix}"


# ---------------------------------------------------------------------------
# 1. Happy path — 5 NEW rows, sync preview + confirm
# ---------------------------------------------------------------------------

class TestHappyPathCSV:

    def test_upload_returns_preview_with_5_new_rows(
        self, admin_client, site, classification, assert_status
    ):
        rows = [
            {"asset_code": f"AST-{i:03d}", "name": f"Asset {i}",
             "classification_code": "MECH"}
            for i in range(1, 6)
        ]
        csv_file = _make_csv(*rows)
        resp = admin_client.post(
            IMPORT_URL,
            data={"file": csv_file, "site_id": str(site.pk)},
            format="multipart",
        )
        assert_status(resp, 200)
        data = resp.json()
        assert data["new_count"] == 5
        assert data["rejected_count"] == 0
        assert data["total"] == 5
        assert "import_id" in data
        assert data["status"] == BulkImportJob.Status.PREVIEW_READY

    def test_confirm_creates_assets(
        self, admin_client, admin_user, site, classification, assert_status
    ):
        rows = [
            {"asset_code": f"CNF-{i:03d}", "name": f"Confirm Asset {i}",
             "classification_code": "MECH"}
            for i in range(1, 4)
        ]
        # Upload
        resp = admin_client.post(
            IMPORT_URL,
            data={"file": _make_csv(*rows), "site_id": str(site.pk)},
            format="multipart",
        )
        import_id = resp.json()["import_id"]
        preview_rows = resp.json()["rows"]

        # Build decisions: create all NEW rows
        decisions = [
            {"row_number": r["row_number"], "action": "create"}
            for r in preview_rows if r["status"] == "NEW"
        ]
        resp2 = admin_client.post(
            import_url(import_id, "confirm/"),
            data={"decisions": decisions},
            format="json",
        )
        assert_status(resp2, 200)
        d = resp2.json()
        assert d["created"] == 3
        assert d["updated"] == 0
        assert d["skipped"] == 0
        assert Asset.objects.filter(site=site).count() == 3


# ---------------------------------------------------------------------------
# 2. Validation errors — missing headers, bad asset_code, unknown cls
# ---------------------------------------------------------------------------

class TestValidationErrors:

    def test_missing_required_header_returns_422(
        self, admin_client, site, classification, assert_status
    ):
        # CSV with no 'name' column
        buf = io.BytesIO(b"asset_code,classification_code\nAST-001,MECH\n")
        resp = admin_client.post(
            IMPORT_URL,
            data={"file": buf, "site_id": str(site.pk)},
            format="multipart",
        )
        assert_status(resp, 422)

    def test_bad_asset_code_row_classified_rejected(
        self, admin_client, site, classification, assert_status
    ):
        rows = [
            {"asset_code": "bad code!", "name": "Bad", "classification_code": "MECH"},
            {"asset_code": "GOOD-001",  "name": "Good", "classification_code": "MECH"},
        ]
        resp = admin_client.post(
            IMPORT_URL,
            data={"file": _make_csv(*rows), "site_id": str(site.pk)},
            format="multipart",
        )
        assert_status(resp, 200)
        data = resp.json()
        assert data["rejected_count"] == 1
        assert data["new_count"] == 1

    def test_unknown_classification_code_rejected(
        self, admin_client, site, classification, assert_status
    ):
        rows = [{"asset_code": "AST-X01", "name": "X", "classification_code": "UNKNOWN"}]
        resp = admin_client.post(
            IMPORT_URL,
            data={"file": _make_csv(*rows), "site_id": str(site.pk)},
            format="multipart",
        )
        assert_status(resp, 200)
        assert resp.json()["rejected_count"] == 1


# ---------------------------------------------------------------------------
# 3. UPDATE_CANDIDATE — existing asset with same code, different fingerprint
# ---------------------------------------------------------------------------

class TestUpdateCandidate:

    def test_existing_asset_code_classified_as_update_candidate(
        self, admin_client, site, classification, assert_status
    ):
        # Pre-create an asset
        existing = AssetFactory(
            site=site,
            classification=classification,
            asset_code="UPD-001",
            name="Original Name",
        )
        rows = [{"asset_code": "UPD-001", "name": "New Name", "classification_code": "MECH"}]
        resp = admin_client.post(
            IMPORT_URL,
            data={"file": _make_csv(*rows), "site_id": str(site.pk)},
            format="multipart",
        )
        assert_status(resp, 200)
        data = resp.json()
        assert data["update_count"] == 1
        row = data["rows"][0]
        assert row["status"] == "UPDATE_CANDIDATE"
        assert row["existing_asset_id"] == str(existing.pk)

    def test_confirm_update_changes_asset_name(
        self, admin_client, site, classification, assert_status
    ):
        existing = AssetFactory(
            site=site,
            classification=classification,
            asset_code="UPD-002",
            name="Old Name",
        )
        rows = [{"asset_code": "UPD-002", "name": "Updated Name", "classification_code": "MECH"}]
        resp = admin_client.post(
            IMPORT_URL,
            data={"file": _make_csv(*rows), "site_id": str(site.pk)},
            format="multipart",
        )
        import_id = resp.json()["import_id"]
        row_num   = resp.json()["rows"][0]["row_number"]

        resp2 = admin_client.post(
            import_url(import_id, "confirm/"),
            data={"decisions": [{"row_number": row_num, "action": "update"}]},
            format="json",
        )
        assert_status(resp2, 200)
        assert resp2.json()["updated"] == 1
        existing.refresh_from_db()
        assert existing.name == "Updated Name"


# ---------------------------------------------------------------------------
# 4. DUPLICATE detection — exact fingerprint match
# ---------------------------------------------------------------------------

class TestDuplicateDetection:

    def test_exact_match_classified_as_duplicate(
        self, admin_client, site, classification, assert_status
    ):
        AssetFactory(
            site=site,
            classification=classification,
            asset_code="DUP-001",
            name="Exact Match",
        )
        rows = [{"asset_code": "DUP-001", "name": "Exact Match", "classification_code": "MECH"}]
        resp = admin_client.post(
            IMPORT_URL,
            data={"file": _make_csv(*rows), "site_id": str(site.pk)},
            format="multipart",
        )
        assert_status(resp, 200)
        assert resp.json()["duplicate_count"] == 1
        assert resp.json()["rows"][0]["status"] == "DUPLICATE"


# ---------------------------------------------------------------------------
# 5. Corrections — REJECTED row can be patched and re-classified
# ---------------------------------------------------------------------------

class TestCorrections:

    def test_correct_bad_asset_code_becomes_new(
        self, admin_client, site, classification, assert_status
    ):
        rows = [{"asset_code": "bad!", "name": "Something", "classification_code": "MECH"}]
        resp = admin_client.post(
            IMPORT_URL,
            data={"file": _make_csv(*rows), "site_id": str(site.pk)},
            format="multipart",
        )
        assert_status(resp, 200)
        import_id = resp.json()["import_id"]
        row_num   = resp.json()["rows"][0]["row_number"]
        assert resp.json()["rejected_count"] == 1

        # Apply correction
        resp2 = admin_client.post(
            import_url(import_id, "correct/"),
            data={"corrections": [
                {"row_number": row_num, "field": "asset_code", "new_value": "FIXED-001"}
            ]},
            format="json",
        )
        assert_status(resp2, 200)
        assert resp2.json()["rejected_count"] == 0
        assert resp2.json()["new_count"] == 1

    def test_correct_unknown_classification(
        self, admin_client, site, classification, assert_status
    ):
        rows = [{"asset_code": "FIX-002", "name": "Fix Me", "classification_code": "WRONG"}]
        resp = admin_client.post(
            IMPORT_URL,
            data={"file": _make_csv(*rows), "site_id": str(site.pk)},
            format="multipart",
        )
        import_id = resp.json()["import_id"]
        row_num   = resp.json()["rows"][0]["row_number"]

        resp2 = admin_client.post(
            import_url(import_id, "correct/"),
            data={"corrections": [
                {"row_number": row_num, "field": "classification_code", "new_value": "MECH"}
            ]},
            format="json",
        )
        assert_status(resp2, 200)
        assert resp2.json()["new_count"] == 1


# ---------------------------------------------------------------------------
# 6. File too large → 422
# ---------------------------------------------------------------------------

class TestFileSizeLimit:

    def test_oversized_file_returns_422(
        self, admin_client, site, classification, assert_status
    ):
        big_file = io.BytesIO(b"x" * 26)  # small content; size check uses uploaded.size
        big_file.name = "big.csv"

        with mock.patch("assets.views.MAX_IMPORT_SIZE", 1):  # 1 byte limit
            resp = admin_client.post(
                IMPORT_URL,
                data={"file": big_file, "site_id": str(site.pk)},
                format="multipart",
            )
        assert_status(resp, 422)


# ---------------------------------------------------------------------------
# 7. Row count limit → 422
# ---------------------------------------------------------------------------

class TestRowCountLimit:

    def test_too_many_rows_returns_422(
        self, admin_client, site, classification, assert_status
    ):
        rows = [
            {"asset_code": f"OVR-{i:04d}", "name": f"Asset {i}",
             "classification_code": "MECH"}
            for i in range(12)
        ]
        with mock.patch("assets.views.MAX_IMPORT_ROWS", 10):
            resp = admin_client.post(
                IMPORT_URL,
                data={"file": _make_csv(*rows), "site_id": str(site.pk)},
                format="multipart",
            )
        assert_status(resp, 422)


# ---------------------------------------------------------------------------
# 8. XLSX upload
# ---------------------------------------------------------------------------

class TestXLSXUpload:

    def test_xlsx_file_parsed_correctly(
        self, admin_client, site, classification, assert_status
    ):
        try:
            from openpyxl import Workbook
        except ImportError:
            pytest.skip("openpyxl not installed")

        wb = Workbook()
        ws = wb.active
        ws.append(["asset_code", "name", "classification_code"])
        ws.append(["XLS-001", "XLSX Asset", "MECH"])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        buf.name = "test.xlsx"

        resp = admin_client.post(
            IMPORT_URL,
            data={"file": buf, "site_id": str(site.pk)},
            format="multipart",
        )
        assert_status(resp, 200)
        assert resp.json()["new_count"] == 1


# ---------------------------------------------------------------------------
# 9. All-skip decisions — no assets created
# ---------------------------------------------------------------------------

class TestAllSkip:

    def test_skip_all_creates_nothing(
        self, admin_client, site, classification, assert_status
    ):
        rows = [
            {"asset_code": f"SKP-{i:03d}", "name": f"Skip {i}",
             "classification_code": "MECH"}
            for i in range(3)
        ]
        resp = admin_client.post(
            IMPORT_URL,
            data={"file": _make_csv(*rows), "site_id": str(site.pk)},
            format="multipart",
        )
        import_id = resp.json()["import_id"]
        row_nums  = [r["row_number"] for r in resp.json()["rows"]]

        decisions = [{"row_number": n, "action": "skip"} for n in row_nums]
        resp2 = admin_client.post(
            import_url(import_id, "confirm/"),
            data={"decisions": decisions},
            format="json",
        )
        assert_status(resp2, 200)
        assert resp2.json()["created"] == 0
        assert resp2.json()["skipped"] == 3
        assert Asset.objects.filter(site=site).count() == 0


# ---------------------------------------------------------------------------
# 10. Export — CSV and XLSX
# ---------------------------------------------------------------------------

class TestExport:

    def test_csv_export_contains_assets(
        self, admin_client, site, classification, assert_status
    ):
        AssetFactory(site=site, classification=classification, asset_code="EXP-001")
        AssetFactory(site=site, classification=classification, asset_code="EXP-002")

        resp = admin_client.get(f"{EXPORT_URL}?file_format=csv&site_id={site.pk}")
        assert_status(resp, 200)
        assert resp["Content-Type"] == "text/csv"
        content = resp.content.decode("utf-8")
        assert "EXP-001" in content
        assert "EXP-002" in content

    def test_xlsx_export_returns_xlsx_content_type(
        self, admin_client, site, classification, assert_status
    ):
        AssetFactory(site=site, classification=classification, asset_code="EXP-003")
        resp = admin_client.get(f"{EXPORT_URL}?file_format=xlsx&site_id={site.pk}")
        assert_status(resp, 200)
        assert "spreadsheetml" in resp["Content-Type"]


# ---------------------------------------------------------------------------
# 11. BATCH_DUPLICATE detection
# ---------------------------------------------------------------------------

class TestBatchDuplicate:

    def test_same_code_twice_in_batch_gives_batch_duplicate(
        self, admin_client, site, classification, assert_status
    ):
        rows = [
            {"asset_code": "DUP-BATCH", "name": "First",  "classification_code": "MECH"},
            {"asset_code": "DUP-BATCH", "name": "Second", "classification_code": "MECH"},
        ]
        resp = admin_client.post(
            IMPORT_URL,
            data={"file": _make_csv(*rows), "site_id": str(site.pk)},
            format="multipart",
        )
        assert_status(resp, 200)
        data = resp.json()
        assert data["new_count"] == 1
        assert data["batch_duplicate_count"] == 1
        statuses = [r["status"] for r in data["rows"]]
        assert "NEW" in statuses
        assert "BATCH_DUPLICATE" in statuses


# ---------------------------------------------------------------------------
# 12. Async dispatch — large row count triggers Celery task
# ---------------------------------------------------------------------------

class TestAsyncDispatch:

    def test_large_upload_dispatches_celery_task(
        self, admin_client, site, classification, assert_status
    ):
        rows = [
            {"asset_code": f"ASY-{i:04d}", "name": f"Async {i}",
             "classification_code": "MECH"}
            for i in range(5)
        ]

        # Patch ASYNC_THRESHOLD to 3 so our 5-row file triggers async
        with mock.patch("assets.views.ASYNC_THRESHOLD", 3), \
             mock.patch("assets.tasks.process_bulk_import_async.delay") as mock_delay:
            resp = admin_client.post(
                IMPORT_URL,
                data={"file": _make_csv(*rows), "site_id": str(site.pk)},
                format="multipart",
            )

        assert_status(resp, 202)
        data = resp.json()
        assert data["status"] == BulkImportJob.Status.PROCESSING
        assert "import_id" in data
        mock_delay.assert_called_once_with(data["import_id"])

    def test_poll_endpoint_returns_job_status(
        self, admin_client, site, classification, assert_status
    ):
        """GET /import/{job_id}/ returns current job status."""
        rows = [
            {"asset_code": f"PLN-{i:03d}", "name": f"Poll {i}",
             "classification_code": "MECH"}
            for i in range(2)
        ]
        resp = admin_client.post(
            IMPORT_URL,
            data={"file": _make_csv(*rows), "site_id": str(site.pk)},
            format="multipart",
        )
        import_id = resp.json()["import_id"]

        resp2 = admin_client.get(import_url(import_id))
        assert_status(resp2, 200)
        assert resp2.json()["import_id"] == import_id
        assert resp2.json()["status"] == BulkImportJob.Status.PREVIEW_READY
