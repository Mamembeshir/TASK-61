from django.contrib import admin

from integrations.models import Alert, WebhookEndpoint, WebhookDeliveryAttempt


@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    list_display  = [
        "id", "tenant", "alert_type", "severity", "status",
        "acknowledged_by", "assigned_to", "closed_by", "created_at",
    ]
    list_filter   = ["alert_type", "severity", "status"]
    search_fields = ["message", "tenant__name"]
    readonly_fields = [
        "id", "tenant", "alert_type", "severity", "message",
        "original_alert", "acknowledged_by", "acknowledged_at",
        "assigned_to", "closed_by", "closed_at",
        "resolution_note", "created_at", "updated_at",
    ]
    ordering = ["-created_at"]


@admin.register(WebhookEndpoint)
class WebhookEndpointAdmin(admin.ModelAdmin):
    list_display  = ["id", "tenant", "url", "is_active", "events", "created_at"]
    list_filter   = ["is_active"]
    search_fields = ["url", "tenant__name"]
    readonly_fields = ["id", "tenant", "created_at", "updated_at"]
    ordering = ["-created_at"]


@admin.register(WebhookDeliveryAttempt)
class WebhookDeliveryAttemptAdmin(admin.ModelAdmin):
    list_display  = [
        "id", "endpoint", "event_type", "status",
        "attempt_number", "response_status_code", "sent_at", "created_at",
    ]
    list_filter   = ["status", "event_type"]
    search_fields = ["event_type", "endpoint__url"]
    readonly_fields = [
        "id", "endpoint", "event_type", "idempotency_key", "payload",
        "status", "attempt_number", "response_status_code",
        "response_body", "sent_at", "created_at",
    ]
    ordering = ["-created_at"]
