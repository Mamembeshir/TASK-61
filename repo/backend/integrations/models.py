"""
integrations/models.py

Alert:                State machine OPEN→ACKNOWLEDGED→ASSIGNED→CLOSED.
WebhookEndpoint:      Active subscriptions per tenant.
WebhookDeliveryAttempt: Per-delivery record with status + retry tracking.
"""
import uuid
from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone


class Alert(models.Model):
    class AlertType(models.TextChoices):
        CELERY_FAILURE       = "CELERY_FAILURE",       "Celery Task Failure"
        WEBHOOK_FAILURE      = "WEBHOOK_FAILURE",      "Webhook Delivery Failure"
        IMPORT_FAILURE       = "IMPORT_FAILURE",       "Bulk Import Failure"
        OVERDUE_THRESHOLD    = "OVERDUE_THRESHOLD",    "Overdue Task Threshold"
        CRITICAL_RENOTIFY    = "CRITICAL_RENOTIFY",    "Critical Alert Re-notification"

    class Severity(models.TextChoices):
        CRITICAL = "CRITICAL", "Critical"
        WARNING  = "WARNING",  "Warning"
        INFO     = "INFO",     "Info"

    class Status(models.TextChoices):
        OPEN         = "OPEN",         "Open"
        ACKNOWLEDGED = "ACKNOWLEDGED", "Acknowledged"
        ASSIGNED     = "ASSIGNED",     "Assigned"
        CLOSED       = "CLOSED",       "Closed"

    _TRANSITIONS = {
        "OPEN":         ["ACKNOWLEDGED"],
        "ACKNOWLEDGED": ["ASSIGNED"],
        "ASSIGNED":     ["CLOSED"],
        "CLOSED":       [],
    }

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant          = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, related_name="alerts")
    alert_type      = models.CharField(max_length=30, choices=AlertType.choices)
    severity        = models.CharField(max_length=10, choices=Severity.choices, db_index=True)
    message         = models.TextField()
    status          = models.CharField(max_length=15, choices=Status.choices, default=Status.OPEN, db_index=True)
    original_alert  = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="renotifications")
    acknowledged_by = models.ForeignKey("iam.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="acknowledged_alerts")
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    assigned_to     = models.ForeignKey("iam.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="assigned_alerts")
    closed_by       = models.ForeignKey("iam.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="closed_alerts")
    closed_at       = models.DateTimeField(null=True, blank=True)
    resolution_note = models.TextField(blank=True, default="")
    created_at      = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "integrations_alert"
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.severity}] {self.alert_type} ({self.status})"

    def transition(self, new_status: str, actor, **kwargs) -> None:
        """
        Enforce state machine. Extra kwargs:
          acknowledge: nothing extra needed
          assign:      assigned_to (User)
          close:       resolution_note (str, ≥10 chars)
        """
        allowed = self._TRANSITIONS.get(self.status, [])
        if new_status not in allowed:
            raise ValidationError(
                f"Cannot transition alert from {self.status} to {new_status}."
            )
        if new_status == Alert.Status.CLOSED:
            note = kwargs.get("resolution_note", "").strip()
            if len(note) < 10:
                raise ValidationError(
                    "resolution_note must be at least 10 characters when closing an alert."
                )
            self.resolution_note = note
            self.closed_by = actor
            self.closed_at = timezone.now()
        elif new_status == Alert.Status.ACKNOWLEDGED:
            self.acknowledged_by = actor
            self.acknowledged_at = timezone.now()
        elif new_status == Alert.Status.ASSIGNED:
            assigned_to = kwargs.get("assigned_to")
            if assigned_to is None:
                raise ValidationError("assigned_to is required when assigning an alert.")
            self.assigned_to = assigned_to
        self.status = new_status
        self.save()


class WebhookEndpoint(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant     = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, related_name="webhook_endpoints")
    url        = models.URLField(max_length=500)
    secret     = models.CharField(max_length=200)  # HMAC signing secret
    is_active  = models.BooleanField(default=True)
    events     = models.JSONField(default=list)  # list of subscribed event_type strings
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "integrations_webhook_endpoint"

    def __str__(self):
        return f"{self.url} ({'active' if self.is_active else 'inactive'})"


class WebhookDeliveryAttempt(models.Model):
    class DeliveryStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SUCCESS = "SUCCESS", "Success"
        FAILED  = "FAILED",  "Failed"

    id                   = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    endpoint             = models.ForeignKey(WebhookEndpoint, on_delete=models.CASCADE, related_name="deliveries")
    event_type           = models.CharField(max_length=100)
    idempotency_key      = models.UUIDField(default=uuid.uuid4)
    payload              = models.JSONField()
    status               = models.CharField(max_length=10, choices=DeliveryStatus.choices, default=DeliveryStatus.PENDING)
    attempt_number       = models.PositiveSmallIntegerField(default=1)
    response_status_code = models.IntegerField(null=True, blank=True)
    response_body        = models.TextField(blank=True, default="")
    sent_at              = models.DateTimeField(null=True, blank=True)
    created_at           = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "integrations_webhook_delivery"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.event_type} → {self.endpoint.url} ({self.status})"
