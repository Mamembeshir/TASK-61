"""
core/models.py

Shared abstract base models and system-level models used across all apps.
"""
import uuid
from django.db import models
from django.conf import settings


class UUIDModel(models.Model):
    """
    Abstract base model for all HarborOps entities.
    Uses UUID primary key + automatic created_at / updated_at timestamps.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class AuditLog(models.Model):
    """
    Append-only audit trail for every mutating operation.
    No update or delete is permitted on this model — enforced at the
    model level by overriding save() and by having no admin change view.
    """

    class Action(models.TextChoices):
        CREATE = "CREATE"
        UPDATE = "UPDATE"
        DELETE = "DELETE"   # soft delete
        APPROVE = "APPROVE"
        REJECT = "REJECT"
        SUSPEND = "SUSPEND"
        ACTIVATE = "ACTIVATE"
        LOGIN = "LOGIN"
        LOGIN_FAILED = "LOGIN_FAILED"
        LOGOUT = "LOGOUT"
        EXPORT = "EXPORT"
        IMPORT = "IMPORT"
        PUBLISH = "PUBLISH"
        UNPUBLISH = "UNPUBLISH"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.UUIDField(null=True, blank=True, db_index=True)
    entity_type = models.CharField(max_length=100, db_index=True)
    entity_id = models.CharField(max_length=100, db_index=True)
    action = models.CharField(max_length=30, choices=Action.choices, db_index=True)
    actor_id = models.CharField(max_length=100, null=True, blank=True)
    actor_username = models.CharField(max_length=150, null=True, blank=True)
    diff_json = models.JSONField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "core_audit_log"
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["entity_type", "entity_id"]),
            models.Index(fields=["tenant_id", "timestamp"]),
        ]

    def save(self, *args, **kwargs):
        if self.pk and AuditLog.objects.filter(pk=self.pk).exists():
            raise PermissionError("AuditLog records are immutable.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("AuditLog records cannot be deleted.")


class IdempotencyRecord(models.Model):
    """
    Stores results of non-idempotent API calls so repeated requests
    with the same key return the cached response without re-processing.
    Records older than 24 hours may be hard-deleted by a scheduled task.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.CharField(max_length=255, db_index=True)
    endpoint = models.CharField(max_length=500)
    actor_id = models.CharField(max_length=100, blank=True, default="anonymous")
    response_status = models.PositiveSmallIntegerField()
    response_body = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "core_idempotency_record"
        unique_together = [("key", "endpoint", "actor_id")]


class RequestLog(models.Model):
    """
    Per-request log written by RequestLoggingMiddleware.
    Used by the analytics app to compute API health metrics (p95 latency, error rate).
    """
    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    method           = models.CharField(max_length=10)
    path             = models.CharField(max_length=500)
    status_code      = models.SmallIntegerField()
    response_time_ms = models.IntegerField()
    user_id          = models.CharField(max_length=100, blank=True, default="anonymous")
    timestamp        = models.DateTimeField(db_index=True)

    class Meta:
        db_table = "core_request_log"
        indexes = [
            models.Index(fields=["timestamp"]),
            models.Index(fields=["status_code", "timestamp"]),
        ]
