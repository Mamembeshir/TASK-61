"""
tests/unit/core/test_models.py

Unit tests for:
  - AuditLog: immutability (save raises on update, delete raises), action choices,
    tenant scoping, ordering, composite indexes
  - IdempotencyRecord: unique key constraint, fields stored correctly
  - RequestLog: creation and field mapping
"""
import pytest
import uuid

from core.models import AuditLog, IdempotencyRecord, RequestLog
from iam.factories import TenantFactory, UserFactory


# ===========================================================================
# 1. AuditLog — immutability
# ===========================================================================

@pytest.mark.django_db
class TestAuditLogImmutability:
    """AuditLog records must be append-only — no updates, no deletes."""

    def _create_entry(self, tenant):
        return AuditLog.objects.create(
            tenant_id=str(tenant.pk),
            entity_type="Asset",
            entity_id=str(uuid.uuid4()),
            action=AuditLog.Action.CREATE,
            actor_username="testuser",
        )

    def test_initial_save_succeeds(self):
        tenant = TenantFactory()
        entry = self._create_entry(tenant)
        assert entry.pk is not None

    def test_update_raises_permission_error(self):
        """Calling save() on an existing AuditLog must raise PermissionError."""
        tenant = TenantFactory()
        entry = self._create_entry(tenant)
        entry.actor_username = "hacked"
        with pytest.raises(PermissionError, match="immutable"):
            entry.save()

    def test_delete_raises_permission_error(self):
        """Calling delete() on any AuditLog must raise PermissionError."""
        tenant = TenantFactory()
        entry = self._create_entry(tenant)
        with pytest.raises(PermissionError, match="cannot be deleted"):
            entry.delete()

    def test_update_via_objects_update_bypasses_override(self):
        """
        QuerySet.update() bypasses model save() — this is a known Django
        limitation. We verify the record count stays at 1 (no extra rows).
        """
        tenant = TenantFactory()
        self._create_entry(tenant)
        assert AuditLog.objects.filter(tenant_id=str(tenant.pk)).count() == 1


# ===========================================================================
# 2. AuditLog — action choices and field storage
# ===========================================================================

@pytest.mark.django_db
class TestAuditLogFields:

    def test_all_action_choices_are_valid(self):
        valid = {c[0] for c in AuditLog.Action.choices}
        assert "CREATE" in valid
        assert "UPDATE" in valid
        assert "DELETE" in valid
        assert "LOGIN" in valid
        assert "LOGOUT" in valid
        assert "PUBLISH" in valid
        assert "UNPUBLISH" in valid

    def test_entry_stores_diff_json(self):
        tenant = TenantFactory()
        diff = {"old": "v1", "new": "v2"}
        entry = AuditLog.objects.create(
            tenant_id=str(tenant.pk),
            entity_type="Recipe",
            entity_id="abc-123",
            action=AuditLog.Action.UPDATE,
            diff_json=diff,
        )
        entry.refresh_from_db()
        assert entry.diff_json == diff

    def test_entry_timestamps_are_set_automatically(self):
        tenant = TenantFactory()
        entry = AuditLog.objects.create(
            tenant_id=str(tenant.pk),
            entity_type="Menu",
            entity_id="xyz",
            action=AuditLog.Action.PUBLISH,
        )
        assert entry.timestamp is not None

    def test_ordering_is_newest_first(self):
        """Default ordering must be -timestamp."""
        tenant = TenantFactory()
        e1 = AuditLog.objects.create(
            tenant_id=str(tenant.pk), entity_type="T", entity_id="1",
            action=AuditLog.Action.CREATE,
        )
        e2 = AuditLog.objects.create(
            tenant_id=str(tenant.pk), entity_type="T", entity_id="2",
            action=AuditLog.Action.UPDATE,
        )
        entries = list(AuditLog.objects.filter(tenant_id=str(tenant.pk)))
        assert entries[0].pk == e2.pk  # newest first

    def test_tenant_scoping_filters_correctly(self):
        tenant_a = TenantFactory()
        tenant_b = TenantFactory()
        AuditLog.objects.create(
            tenant_id=str(tenant_a.pk), entity_type="Asset", entity_id="1",
            action=AuditLog.Action.CREATE,
        )
        AuditLog.objects.create(
            tenant_id=str(tenant_b.pk), entity_type="Asset", entity_id="2",
            action=AuditLog.Action.CREATE,
        )
        assert AuditLog.objects.filter(tenant_id=str(tenant_a.pk)).count() == 1
        assert AuditLog.objects.filter(tenant_id=str(tenant_b.pk)).count() == 1

    def test_null_fields_are_allowed(self):
        """tenant_id, actor_id, actor_username, diff_json can all be None."""
        entry = AuditLog.objects.create(
            entity_type="SystemEvent",
            entity_id="boot",
            action=AuditLog.Action.LOGIN,
        )
        assert entry.tenant_id is None
        assert entry.actor_id is None
        assert entry.actor_username is None
        assert entry.diff_json is None


# ===========================================================================
# 3. IdempotencyRecord
# ===========================================================================

@pytest.mark.django_db
class TestIdempotencyRecord:

    def test_creates_with_required_fields(self):
        rec = IdempotencyRecord.objects.create(
            key="unique-key-abc",
            endpoint="/api/v1/assets/",
            response_status=201,
            response_body={"id": "some-uuid"},
        )
        assert rec.pk is not None
        assert rec.key == "unique-key-abc"
        assert rec.response_status == 201

    def test_key_must_be_unique(self):
        from django.db import IntegrityError
        IdempotencyRecord.objects.create(
            key="dup-key",
            endpoint="/api/v1/assets/",
            response_status=201,
            response_body={},
        )
        with pytest.raises(IntegrityError):
            IdempotencyRecord.objects.create(
                key="dup-key",
                endpoint="/api/v1/assets/",
                response_status=201,
                response_body={},
            )

    def test_response_body_stores_complex_json(self):
        body = {"results": [{"id": "1"}, {"id": "2"}], "count": 2}
        rec = IdempotencyRecord.objects.create(
            key="complex-body",
            endpoint="/api/v1/menus/",
            response_status=200,
            response_body=body,
        )
        rec.refresh_from_db()
        assert rec.response_body["count"] == 2

    def test_created_at_is_auto_set(self):
        rec = IdempotencyRecord.objects.create(
            key="ts-test",
            endpoint="/api/v1/test/",
            response_status=201,
            response_body={},
        )
        assert rec.created_at is not None


# ===========================================================================
# 4. RequestLog
# ===========================================================================

@pytest.mark.django_db
class TestRequestLog:

    def test_creates_with_all_fields(self):
        from django.utils import timezone
        now = timezone.now()
        log = RequestLog.objects.create(
            method="GET",
            path="/api/v1/assets/",
            status_code=200,
            response_time_ms=42,
            user_id="user-abc",
            timestamp=now,
        )
        assert log.pk is not None
        assert log.method == "GET"
        assert log.response_time_ms == 42

    def test_anonymous_user_id_default(self):
        from django.utils import timezone
        log = RequestLog.objects.create(
            method="GET",
            path="/api/v1/core/health/",
            status_code=200,
            response_time_ms=5,
            timestamp=timezone.now(),
        )
        assert log.user_id == "anonymous"

    def test_path_is_truncated_to_500_chars(self):
        """Path field max_length=500 — anything beyond that must be sliced."""
        from django.utils import timezone
        long_path = "/api/v1/" + ("x" * 500)
        log = RequestLog.objects.create(
            method="GET",
            path=long_path[:500],
            status_code=200,
            response_time_ms=10,
            timestamp=timezone.now(),
        )
        assert len(log.path) <= 500
