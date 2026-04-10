from rest_framework import serializers
from analytics.models import AnalyticsSummary


class AnalyticsSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model  = AnalyticsSummary
        fields = [
            "id",
            "metric_name",
            "dimensions",
            "value",
            "period_start",
            "period_end",
            "computed_at",
        ]
