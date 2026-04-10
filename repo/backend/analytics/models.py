"""
analytics/models.py
"""
import uuid
from django.db import models


class AnalyticsSummary(models.Model):
    """
    Pre-computed metric snapshot. One row per (metric_name, dimensions, period).
    The compute_analytics task refreshes these every 15 minutes.
    """
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    metric_name  = models.CharField(max_length=100, db_index=True)
    dimensions   = models.JSONField(default=dict)   # e.g. {"site_id": "...", "site_name": "..."}
    value        = models.DecimalField(max_digits=18, decimal_places=4)
    period_start = models.DateTimeField()
    period_end   = models.DateTimeField()
    computed_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "analytics_summary"
        indexes = [
            models.Index(fields=["metric_name", "computed_at"]),
        ]
