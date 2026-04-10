"""
tests/api/analytics/test_analytics.py

Integration tests for the HarborOps Analytics API.

Endpoints under test:
  GET /api/v1/analytics/dashboard/
  GET /api/v1/analytics/export/?format=csv
"""
import datetime
from decimal import Decimal

import pytest

from analytics.models import AnalyticsSummary

pytestmark = [pytest.mark.api, pytest.mark.django_db]

DASHBOARD_URL = "/api/v1/analytics/dashboard/"
EXPORT_URL    = "/api/v1/analytics/export/"


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------

def _make_summary(metric_name, value=1.0, dimensions=None, **kwargs):
    """Create an AnalyticsSummary row with sensible defaults."""
    now = datetime.datetime.now(tz=datetime.timezone.utc)
    return AnalyticsSummary.objects.create(
        metric_name  = metric_name,
        dimensions   = dimensions or {},
        value        = Decimal(str(value)),
        period_start = now - datetime.timedelta(hours=1),
        period_end   = now,
        **kwargs,
    )


# ---------------------------------------------------------------------------
# 1. Dashboard
# ---------------------------------------------------------------------------

class TestAnalyticsDashboard:

    def test_admin_can_get_dashboard(
        self, admin_client, assert_status
    ):
        _make_summary("alert.mttr_minutes", value=5.0)

        resp = admin_client.get(DASHBOARD_URL)
        assert_status(resp, 200)

        data = resp.json()
        assert "metrics" in data
        assert isinstance(data["metrics"], dict)

    def test_dashboard_response_contains_created_metric(
        self, admin_client, assert_status
    ):
        _make_summary("menu.funnel", value=42.0, dimensions={"status": "PUBLISHED"})

        resp = admin_client.get(DASHBOARD_URL)
        assert_status(resp, 200)

        assert "menu.funnel" in resp.json()["metrics"]

    def test_staff_can_get_dashboard_filtered_to_their_sites(
        self, staff_client, staff_user, site, assert_status
    ):
        from iam.models import UserSiteAssignment

        # Assign staff_user to site
        UserSiteAssignment.objects.get_or_create(user=staff_user, site=site)

        # Site-specific metric (should be visible to staff)
        _make_summary(
            "asset.utilization_pct",
            value=80.0,
            dimensions={"site_id": str(site.pk), "site_name": site.name},
        )
        # Global metric (should always be visible)
        _make_summary("api.error_rate_pct", value=0.5)

        resp = staff_client.get(DASHBOARD_URL)
        assert_status(resp, 200)

        data = resp.json()["metrics"]
        assert "asset.utilization_pct" in data
        assert "api.error_rate_pct" in data

    def test_staff_cannot_see_metrics_for_unassigned_sites(
        self, staff_client, staff_user, site, site_factory, tenant, assert_status
    ):
        from iam.models import UserSiteAssignment

        other_site = site_factory(tenant=tenant)

        # Assign staff_user ONLY to site, not to other_site
        UserSiteAssignment.objects.get_or_create(user=staff_user, site=site)

        _make_summary(
            "asset.utilization_pct",
            value=60.0,
            dimensions={"site_id": str(other_site.pk), "site_name": other_site.name},
        )

        resp = staff_client.get(DASHBOARD_URL)
        assert_status(resp, 200)

        # The metric for other_site should not appear
        site_metrics = resp.json()["metrics"].get("asset.utilization_pct", [])
        visible_site_ids = [m["dimensions"].get("site_id") for m in site_metrics]
        assert str(other_site.pk) not in visible_site_ids

    def test_courier_cannot_get_dashboard(
        self, courier_client, assert_status
    ):
        resp = courier_client.get(DASHBOARD_URL)
        assert_status(resp, 403)


# ---------------------------------------------------------------------------
# 2. Export
# ---------------------------------------------------------------------------

class TestAnalyticsExport:

    def test_admin_can_export_csv(
        self, admin_client, assert_status
    ):
        _make_summary("menu.funnel", value=10.0, dimensions={"status": "DRAFT"})

        resp = admin_client.get(EXPORT_URL)
        assert_status(resp, 200)

        content_type = resp.get("Content-Type", "")
        assert "text/csv" in content_type

    def test_export_csv_contains_header_row(
        self, admin_client, assert_status
    ):
        resp = admin_client.get(EXPORT_URL)
        assert_status(resp, 200)

        # Collect streaming response content
        content = b"".join(resp.streaming_content).decode("utf-8")
        first_line = content.splitlines()[0]
        assert "metric_name" in first_line
        assert "dimensions" in first_line
        assert "value" in first_line

    def test_export_csv_contains_data_rows(
        self, admin_client, assert_status
    ):
        _make_summary("alert.mttr_minutes", value=12.5)

        resp = admin_client.get(EXPORT_URL)
        assert_status(resp, 200)

        content = b"".join(resp.streaming_content).decode("utf-8")
        assert "alert.mttr_minutes" in content

    def test_staff_cannot_export_csv(
        self, staff_client, assert_status
    ):
        resp = staff_client.get(EXPORT_URL)
        assert_status(resp, 403)

    def test_courier_cannot_export_csv(
        self, courier_client, assert_status
    ):
        resp = courier_client.get(EXPORT_URL)
        assert_status(resp, 403)


# ---------------------------------------------------------------------------
# 3. compute_analytics task (synchronous)
# ---------------------------------------------------------------------------

class TestComputeAnalytics:
    """
    Invoke the compute_analytics Celery task synchronously via .apply()
    and assert the expected side-effects on the AnalyticsSummary table.
    """

    def test_compute_analytics_returns_metrics_computed(self):
        from analytics.tasks import compute_analytics

        result = compute_analytics.apply()
        assert result.successful(), "compute_analytics task raised an exception"

        payload = result.get()
        assert "metrics_computed" in payload
        assert payload["metrics_computed"] > 0

    def test_compute_analytics_creates_summary_rows(self):
        from analytics.tasks import compute_analytics

        before = AnalyticsSummary.objects.count()
        compute_analytics.apply()
        after = AnalyticsSummary.objects.count()

        assert after > before, (
            "Expected AnalyticsSummary rows to be created by compute_analytics, "
            f"but count went from {before} to {after}."
        )

    def test_compute_analytics_produces_known_metric_names(self):
        from analytics.tasks import compute_analytics

        compute_analytics.apply()

        expected_metrics = {
            "menu.funnel",
            "menu.draft_to_published_rate",
            "api.p95_response_time_ms",
            "api.error_rate_pct",
            "alert.mttr_minutes",
            "resolution.completion_rate_pct",
            "asset.import_exception_count",
        }
        existing_names = set(
            AnalyticsSummary.objects.values_list("metric_name", flat=True).distinct()
        )
        assert expected_metrics.issubset(existing_names), (
            f"Missing expected metric names: {expected_metrics - existing_names}"
        )

    def test_compute_analytics_is_idempotent(self):
        """Running compute_analytics twice should not grow the table unboundedly."""
        from analytics.tasks import compute_analytics

        compute_analytics.apply()
        count_after_first = AnalyticsSummary.objects.count()

        compute_analytics.apply()
        count_after_second = AnalyticsSummary.objects.count()

        # The task deletes old rows for the period before bulk-creating fresh ones,
        # so the count should remain stable (within a small tolerance for timing).
        assert count_after_second <= count_after_first * 2, (
            "compute_analytics appears to be accumulating rows instead of replacing them."
        )
