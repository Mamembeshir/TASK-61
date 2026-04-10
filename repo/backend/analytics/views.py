"""
analytics/views.py

DashboardView  GET /api/v1/analytics/dashboard/
ExportView     GET /api/v1/analytics/export/?format=csv

Access control:
  - COURIER → 403 on all endpoints
  - ADMIN   → full access to all metrics / export
  - STAFF   → dashboard only, filtered to their assigned sites + global metrics
"""
import csv
import json

from django.http import StreamingHttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated

from analytics.models import AnalyticsSummary
from analytics.serializers import AnalyticsSummarySerializer


class _IsNotCourier(IsAuthenticated):
    """Deny COURIER role; allow ADMIN and STAFF."""

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        if getattr(request.user, "role", None) == "COURIER":
            return False
        return True


def _latest_summaries(queryset):
    """
    For each unique (metric_name, dimensions JSON), return only the row
    with the highest computed_at timestamp.

    We do this in Python because JSON equality in DB queries is not portable.
    """
    seen = {}
    # Order descending by computed_at so first occurrence wins
    for row in queryset.order_by("-computed_at"):
        key = (row.metric_name, json.dumps(row.dimensions, sort_keys=True))
        if key not in seen:
            seen[key] = row
    return list(seen.values())


class DashboardView(APIView):
    """
    GET /api/v1/analytics/dashboard/

    Returns the latest AnalyticsSummary rows grouped by metric_name.

    Response shape:
        {
            "metrics": {
                "menu.funnel": [ {...}, ... ],
                "task.completion_rate_pct": [ {...}, ... ],
                ...
            }
        }
    """
    permission_classes = [_IsNotCourier]

    def get(self, request):
        user = request.user

        if user.role == "ADMIN":
            qs = AnalyticsSummary.objects.all()
        elif user.role == "STAFF":
            from iam.models import UserSiteAssignment
            assigned_site_ids = set(
                str(sid) for sid in
                UserSiteAssignment.objects.filter(user=user)
                .values_list("site_id", flat=True)
            )
            # All summaries; we filter in Python because dimensions is JSON
            qs = AnalyticsSummary.objects.all()
            # Apply site filter after fetching latest rows
            all_latest = _latest_summaries(qs)
            filtered = []
            for row in all_latest:
                site_id_in_dim = row.dimensions.get("site_id")
                if site_id_in_dim is None:
                    # Global metric — always include
                    filtered.append(row)
                elif site_id_in_dim in assigned_site_ids:
                    filtered.append(row)
            # Group and return
            grouped = {}
            for row in filtered:
                grouped.setdefault(row.metric_name, []).append(
                    AnalyticsSummarySerializer(row).data
                )
            return Response({"metrics": grouped})
        else:
            raise PermissionDenied("Access denied.")

        latest_rows = _latest_summaries(qs)
        grouped = {}
        for row in latest_rows:
            grouped.setdefault(row.metric_name, []).append(
                AnalyticsSummarySerializer(row).data
            )
        return Response({"metrics": grouped})


class _EchoBuffer:
    """Minimal write buffer that yields each value written to it."""
    def write(self, value):
        return value


class ExportView(APIView):
    """
    GET /api/v1/analytics/export/

    ADMIN only. Streams all AnalyticsSummary rows as a CSV file.

    Columns: metric_name, dimensions, value, period_start, period_end, computed_at
    """
    permission_classes = [_IsNotCourier]

    def get(self, request):
        user = request.user
        if user.role != "ADMIN":
            raise PermissionDenied(
                "Only ADMIN users can export analytics data."
            )

        rows = AnalyticsSummary.objects.order_by("metric_name", "-computed_at")

        def _stream():
            buffer = _EchoBuffer()
            writer = csv.writer(buffer)
            # Header row
            yield writer.writerow([
                "metric_name",
                "dimensions",
                "value",
                "period_start",
                "period_end",
                "computed_at",
            ])
            for row in rows.iterator(chunk_size=500):
                yield writer.writerow([
                    row.metric_name,
                    json.dumps(row.dimensions, sort_keys=True),
                    str(row.value),
                    row.period_start.isoformat(),
                    row.period_end.isoformat(),
                    row.computed_at.isoformat(),
                ])

        response = StreamingHttpResponse(
            _stream(),
            content_type="text/csv",
        )
        response["Content-Disposition"] = "attachment; filename=analytics_export.csv"
        return response
