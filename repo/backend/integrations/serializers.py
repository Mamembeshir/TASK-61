"""
integrations/serializers.py

Serializers for Alert, WebhookEndpoint, and WebhookDeliveryAttempt.
"""
from rest_framework import serializers

from integrations.models import Alert, WebhookEndpoint, WebhookDeliveryAttempt


# ---------------------------------------------------------------------------
# Alert serializers
# ---------------------------------------------------------------------------

class AlertSerializer(serializers.ModelSerializer):
    assigned_to_username     = serializers.CharField(source="assigned_to.username",     read_only=True, default=None)
    acknowledged_by_username = serializers.CharField(source="acknowledged_by.username", read_only=True, default=None)
    closed_by_username       = serializers.CharField(source="closed_by.username",       read_only=True, default=None)

    class Meta:
        model  = Alert
        fields = [
            "id",
            "tenant_id",
            "alert_type",
            "severity",
            "message",
            "status",
            "original_alert_id",
            "acknowledged_by_id",
            "acknowledged_by_username",
            "acknowledged_at",
            "assigned_to_id",
            "assigned_to_username",
            "closed_by_id",
            "closed_by_username",
            "closed_at",
            "resolution_note",
            "created_at",
            "updated_at",
        ]


class AlertListSerializer(serializers.ModelSerializer):
    assigned_to_username = serializers.CharField(source="assigned_to.username", read_only=True, default=None)

    class Meta:
        model  = Alert
        fields = [
            "id",
            "alert_type",
            "severity",
            "message",
            "status",
            "assigned_to_username",
            "created_at",
        ]


# ---------------------------------------------------------------------------
# Webhook serializers
# ---------------------------------------------------------------------------

class WebhookEndpointSerializer(serializers.ModelSerializer):

    class Meta:
        model  = WebhookEndpoint
        fields = [
            "id",
            "tenant_id",
            "url",
            "secret",
            "is_active",
            "events",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "tenant_id", "created_at", "updated_at"]
        extra_kwargs = {"secret": {"write_only": True}}

    def validate_url(self, value):
        if not value:
            raise serializers.ValidationError("url is required.")
        return value

    def validate_events(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("events must be a list of event type strings.")
        for item in value:
            if not isinstance(item, str) or not item.strip():
                raise serializers.ValidationError(
                    "Each entry in events must be a non-empty string."
                )
        return value


class WebhookDeliverySerializer(serializers.ModelSerializer):

    class Meta:
        model  = WebhookDeliveryAttempt
        fields = [
            "id",
            "endpoint_id",
            "event_type",
            "idempotency_key",
            "payload",
            "status",
            "attempt_number",
            "response_status_code",
            "response_body",
            "sent_at",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "endpoint_id",
            "event_type",
            "idempotency_key",
            "payload",
            "status",
            "attempt_number",
            "response_status_code",
            "response_body",
            "sent_at",
            "created_at",
        ]
