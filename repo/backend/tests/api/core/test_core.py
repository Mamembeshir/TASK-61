"""
tests/api/core/test_core.py

API tests for:
  - GET /api/v1/core/health/       — always 200, no auth required
  - GET /api/v1/core/audit-log/    — auth required, COURIER excluded,
    returns ≤20 entries scoped to tenant, newest first
"""
import pytest
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token

from core.models import AuditLog
from iam.factories import TenantFactory, SiteFactory, UserFactory, AdminUserFactory


pytestmark = [pytest.mark.api, pytest.mark.django_db]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_client(user):
    token, _ = Token.objects.get_or_create(user=user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
    return client


def create_audit_entries(tenant, count, entity_type="Asset"):
    for i in range(count):
        AuditLog.objects.create(
            tenant_id=str(tenant.pk),
            entity_type=entity_type,
            entity_id=str(i),
            action=AuditLog.Action.CREATE,
            actor_username="testactor",
        )


# ===========================================================================
# 1. Health check
# ===========================================================================

class TestHealthCheck:

    def test_health_check_returns_200(self):
        client = APIClient()
        resp = client.get("/api/v1/core/health/")
        assert resp.status_code == 200

    def test_health_check_returns_ok_status(self):
        client = APIClient()
        resp = client.get("/api/v1/core/health/")
        assert resp.data["status"] == "ok"

    def test_health_check_requires_no_auth(self):
        """Must be reachable without any credentials."""
        client = APIClient()
        resp = client.get("/api/v1/core/health/")
        assert resp.status_code == 200

    def test_health_check_get_only(self):
        """POST to health check should return 405."""
        client = APIClient()
        resp = client.post("/api/v1/core/health/", {})
        assert resp.status_code == 405


# ===========================================================================
# 2. Audit Log view
# ===========================================================================

class TestAuditLogView:

    # ---- authentication & authorisation ------------------------------------

    def test_unauthenticated_returns_401(self):
        client = APIClient()
        resp = client.get("/api/v1/core/audit-log/")
        assert resp.status_code == 401

    def test_admin_can_access(self):
        tenant = TenantFactory()
        user = AdminUserFactory(tenant=tenant)
        resp = make_client(user).get("/api/v1/core/audit-log/")
        assert resp.status_code == 200

    def test_staff_can_access(self):
        tenant = TenantFactory()
        user = UserFactory(tenant=tenant, role="STAFF")
        resp = make_client(user).get("/api/v1/core/audit-log/")
        assert resp.status_code == 200

    def test_courier_is_excluded(self):
        tenant = TenantFactory()
        user = UserFactory(tenant=tenant, role="COURIER")
        resp = make_client(user).get("/api/v1/core/audit-log/")
        assert resp.status_code == 403

    # ---- response shape ----------------------------------------------------

    def test_returns_list(self):
        tenant = TenantFactory()
        user = AdminUserFactory(tenant=tenant)
        resp = make_client(user).get("/api/v1/core/audit-log/")
        assert isinstance(resp.data, list)

    def test_entry_has_expected_keys(self):
        tenant = TenantFactory()
        create_audit_entries(tenant, count=1)
        user = AdminUserFactory(tenant=tenant)
        resp = make_client(user).get("/api/v1/core/audit-log/")
        assert resp.status_code == 200
        assert len(resp.data) >= 1
        entry = resp.data[0]
        for key in ("id", "entity_type", "entity_id", "action", "actor_username", "timestamp"):
            assert key in entry, f"Missing key: {key}"

    # ---- capped at 20 entries ----------------------------------------------

    def test_returns_at_most_20_entries(self):
        tenant = TenantFactory()
        create_audit_entries(tenant, count=25)
        user = AdminUserFactory(tenant=tenant)
        resp = make_client(user).get("/api/v1/core/audit-log/")
        assert len(resp.data) <= 20

    def test_entries_ordered_newest_first(self):
        tenant = TenantFactory()
        create_audit_entries(tenant, count=3)
        user = AdminUserFactory(tenant=tenant)
        resp = make_client(user).get("/api/v1/core/audit-log/")
        timestamps = [e["timestamp"] for e in resp.data]
        assert timestamps == sorted(timestamps, reverse=True)

    # ---- tenant isolation --------------------------------------------------

    def test_entries_scoped_to_user_tenant(self):
        tenant_a = TenantFactory()
        tenant_b = TenantFactory()
        create_audit_entries(tenant_a, count=3, entity_type="AssetA")
        create_audit_entries(tenant_b, count=3, entity_type="AssetB")

        user_a = AdminUserFactory(tenant=tenant_a)
        resp = make_client(user_a).get("/api/v1/core/audit-log/")
        entity_types = {e["entity_type"] for e in resp.data}
        assert "AssetA" in entity_types
        assert "AssetB" not in entity_types

    def test_empty_audit_log_returns_empty_list(self):
        tenant = TenantFactory()
        user = AdminUserFactory(tenant=tenant)
        resp = make_client(user).get("/api/v1/core/audit-log/")
        assert resp.status_code == 200
        assert resp.data == []

    # ---- multiple entity types in one response ------------------------------

    def test_multiple_entity_types_returned(self):
        tenant = TenantFactory()
        for entity_type, action in [
            ("Asset", AuditLog.Action.CREATE),
            ("Meeting", AuditLog.Action.UPDATE),
            ("Menu", AuditLog.Action.PUBLISH),
        ]:
            AuditLog.objects.create(
                tenant_id=str(tenant.pk),
                entity_type=entity_type,
                entity_id="1",
                action=action,
            )
        user = AdminUserFactory(tenant=tenant)
        resp = make_client(user).get("/api/v1/core/audit-log/")
        entity_types = {e["entity_type"] for e in resp.data}
        assert {"Asset", "Meeting", "Menu"} <= entity_types
