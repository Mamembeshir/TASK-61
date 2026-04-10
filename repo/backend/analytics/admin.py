from django.contrib import admin
from analytics.models import AnalyticsSummary


@admin.register(AnalyticsSummary)
class AnalyticsSummaryAdmin(admin.ModelAdmin):
    list_display  = ("metric_name", "value", "period_start", "period_end", "computed_at")
    list_filter   = ("metric_name",)
    search_fields = ("metric_name",)
    readonly_fields = (
        "id",
        "metric_name",
        "dimensions",
        "value",
        "period_start",
        "period_end",
        "computed_at",
    )
    ordering = ("-computed_at",)
