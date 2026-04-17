"""
tests/api/integrations/test_integrations.py

Integration tests for the HarborOps Integrations API.

Endpoints under test:
  GET  /api/v1/integrations/alerts/
  POST /api/v1/integrations/alerts/<pk>/acknowledge/
  POST /api/v1/integrations/alerts/<pk>/assign/
  POST /api/v1/integrations/alerts/<pk>/close/
  GET  /api/v1/integrations/webhooks/
  POST /api/v1/integrations/webhooks/
  GET  /api/v1/integrations/webhooks/<pk>/
  PATCH /api/v1/integrations/webhooks/<pk>/
  DELETE /api/v1/integrations/webhooks/<pk>/
"""
import pytest

from integrations.models import Alert, WebhookEndpoint, WebhookDeliveryAttempt

pytestmark = [pytest.mark.api, pytest.mark.django_db]

ALERTS_BASE   = "/api/v1/integrations/alerts/"
WEBHOOKS_BASE = "/api/v1/integrations/webhooks/"

# Private RFC 1918 URL (always valid)
PRIVATE_URL = "http://10.0.0.1/webhook/"
# Public URL (always rejected)
PUBLIC_URL  = "https://example.com/webhook/"


# ---------------------------------------------------------------------------
# Module-level fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def alert(tenant, admin_user):
    """An OPEN WARNING alert."""
    return Alert.objects.create(
        tenant     = tenant,
        alert_type = Alert.AlertType.IMPORT_FAILURE,
        severity   = Alert.Severity.WARNING,
        message    = "Test alert message",
    )


@pytest.fixture
def critical_alert(tenant):
    """An OPEN CRITICAL alert."""
    return Alert.objects.create(
        tenant     = tenant,
        alert_type = Alert.AlertType.CELERY_FAILURE,
        severity   = Alert.Severity.CRITICAL,
        message    = "Critical failure detected",
    )


@pytest.fixture
def acknowledged_alert(alert, admin_user):
    """An ACKNOWLEDGED alert (transitioned from OPEN)."""
    alert.transition(Alert.Status.ACKNOWLEDGED, admin_user)
    return alert


@pytest.fixture
def assigned_alert(acknowledged_alert, admin_user, staff_user):
    """An ASSIGNED alert (transitioned from ACKNOWLEDGED), assigned to staff_user."""
    acknowledged_alert.transition(
        Alert.Status.ASSIGNED, admin_user, assigned_to=staff_user
    )
    return acknowledged_alert


@pytest.fixture
def webhook_endpoint(tenant):
    """An active WebhookEndpoint subscribed to test.event and alert.created."""
    return WebhookEndpoint.objects.create(
        tenant    = tenant,
        url       = "http://localhost:9000/webhook/",
        secret    = "mysecret123",
        is_active = True,
        events    = ["test.event", "alert.created"],
    )


# ---------------------------------------------------------------------------
# 1. Alert state machine
# ---------------------------------------------------------------------------

class TestAlertStateMachine:

    def test_admin_can_acknowledge_open_alert(
        self, admin_client, alert, assert_status
    ):
        resp = admin_client.post(f"{ALERTS_BASE}{alert.pk}/acknowledge/")
        assert_status(resp, 200)
        assert resp.json()["status"] == Alert.Status.ACKNOWLEDGED

    def test_admin_can_assign_acknowledged_alert(
        self, admin_client, acknowledged_alert, staff_user, assert_status
    ):
        resp = admin_client.post(
            f"{ALERTS_BASE}{acknowledged_alert.pk}/assign/",
            data={"assigned_to": str(staff_user.pk)},
            format="json",
        )
        assert_status(resp, 200)
        assert resp.json()["status"] == Alert.Status.ASSIGNED

    def test_staff_can_close_alert_assigned_to_them(
        self, staff_client, assigned_alert, assert_status
    ):
        resp = staff_client.post(
            f"{ALERTS_BASE}{assigned_alert.pk}/close/",
            data={"resolution_note": "Resolved the import issue by re-running the job."},
            format="json",
        )
        assert_status(resp, 200)
        assert resp.json()["status"] == Alert.Status.CLOSED

    def test_close_requires_resolution_note_at_least_10_chars(
        self, admin_client, assigned_alert, assert_status
    ):
        resp = admin_client.post(
            f"{ALERTS_BASE}{assigned_alert.pk}/close/",
            data={"resolution_note": "Short"},
            format="json",
        )
        assert_status(resp, 422)

        assigned_alert.refresh_from_db()
        assert assigned_alert.status == Alert.Status.ASSIGNED

    def test_open_to_assigned_skipping_acknowledged_returns_422(
        self, admin_client, alert, staff_user, assert_status
    ):
        resp = admin_client.post(
            f"{ALERTS_BASE}{alert.pk}/assign/",
            data={"assigned_to": str(staff_user.pk)},
            format="json",
        )
        assert_status(resp, 422)

        alert.refresh_from_db()
        assert alert.status == Alert.Status.OPEN

    def test_open_to_closed_skipping_states_returns_422(
        self, admin_client, alert, assert_status
    ):
        resp = admin_client.post(
            f"{ALERTS_BASE}{alert.pk}/close/",
            data={"resolution_note": "Skipping all intermediate states."},
            format="json",
        )
        assert_status(resp, 422)

        alert.refresh_from_db()
        assert alert.status == Alert.Status.OPEN

    def test_acknowledged_to_closed_skipping_assigned_returns_422(
        self, admin_client, acknowledged_alert, assert_status
    ):
        resp = admin_client.post(
            f"{ALERTS_BASE}{acknowledged_alert.pk}/close/",
            data={"resolution_note": "Skipping assigned state entirely."},
            format="json",
        )
        assert_status(resp, 422)

        acknowledged_alert.refresh_from_db()
        assert acknowledged_alert.status == Alert.Status.ACKNOWLEDGED


# ---------------------------------------------------------------------------
# 2. Alert permissions
# ---------------------------------------------------------------------------

class TestAlertPermissions:

    def test_courier_cannot_get_alerts(
        self, courier_client, assert_status
    ):
        resp = courier_client.get(ALERTS_BASE)
        assert_status(resp, 403)

    def test_staff_can_only_see_alerts_assigned_to_them(
        self, admin_client, staff_client, tenant, admin_user, staff_user, assert_status
    ):
        # Alert assigned to staff_user
        a1 = Alert.objects.create(
            tenant     = tenant,
            alert_type = Alert.AlertType.IMPORT_FAILURE,
            severity   = Alert.Severity.WARNING,
            message    = "Assigned to staff",
        )
        a1.transition(Alert.Status.ACKNOWLEDGED, admin_user)
        a1.transition(Alert.Status.ASSIGNED, admin_user, assigned_to=staff_user)

        # Alert assigned to admin_user (staff should not see this)
        a2 = Alert.objects.create(
            tenant     = tenant,
            alert_type = Alert.AlertType.CELERY_FAILURE,
            severity   = Alert.Severity.CRITICAL,
            message    = "Assigned to admin",
        )
        a2.transition(Alert.Status.ACKNOWLEDGED, admin_user)
        a2.transition(Alert.Status.ASSIGNED, admin_user, assigned_to=admin_user)

        resp = staff_client.get(ALERTS_BASE)
        assert_status(resp, 200)

        ids = [item["id"] for item in resp.json()["results"]]
        assert str(a1.pk) in ids
        assert str(a2.pk) not in ids

    def test_staff_cannot_acknowledge_alert(
        self, staff_client, alert, assert_status
    ):
        resp = staff_client.post(f"{ALERTS_BASE}{alert.pk}/acknowledge/")
        assert_status(resp, 403)

    def test_staff_cannot_assign_alert(
        self, staff_client, acknowledged_alert, staff_user, assert_status
    ):
        resp = staff_client.post(
            f"{ALERTS_BASE}{acknowledged_alert.pk}/assign/",
            data={"assigned_to": str(staff_user.pk)},
            format="json",
        )
        assert_status(resp, 403)

    def test_staff_can_close_if_assigned_to_them(
        self, staff_client, assigned_alert, assert_status
    ):
        resp = staff_client.post(
            f"{ALERTS_BASE}{assigned_alert.pk}/close/",
            data={"resolution_note": "Issue resolved after detailed investigation."},
            format="json",
        )
        assert_status(resp, 200)
        assert resp.json()["status"] == Alert.Status.CLOSED

    def test_staff_cannot_close_if_not_assigned_to_them(
        self, admin_client, staff_client, tenant, admin_user, staff_user, assert_status
    ):
        # Create alert assigned to admin_user, not staff_user
        other_alert = Alert.objects.create(
            tenant     = tenant,
            alert_type = Alert.AlertType.IMPORT_FAILURE,
            severity   = Alert.Severity.WARNING,
            message    = "Alert for another user",
        )
        other_alert.transition(Alert.Status.ACKNOWLEDGED, admin_user)
        other_alert.transition(Alert.Status.ASSIGNED, admin_user, assigned_to=admin_user)

        resp = staff_client.post(
            f"{ALERTS_BASE}{other_alert.pk}/close/",
            data={"resolution_note": "Staff trying to close another user's alert."},
            format="json",
        )
        assert_status(resp, 403)


# ---------------------------------------------------------------------------
# 3. Alert filters
# ---------------------------------------------------------------------------

class TestAlertFilters:

    def test_filter_by_status_open_returns_only_open_alerts(
        self, admin_client, tenant, admin_user, assert_status
    ):
        open_alert = Alert.objects.create(
            tenant     = tenant,
            alert_type = Alert.AlertType.IMPORT_FAILURE,
            severity   = Alert.Severity.WARNING,
            message    = "Open alert",
        )
        ack_alert = Alert.objects.create(
            tenant     = tenant,
            alert_type = Alert.AlertType.CELERY_FAILURE,
            severity   = Alert.Severity.WARNING,
            message    = "Acknowledged alert",
        )
        ack_alert.transition(Alert.Status.ACKNOWLEDGED, admin_user)

        resp = admin_client.get(ALERTS_BASE, {"status": "OPEN"})
        assert_status(resp, 200)

        ids = [item["id"] for item in resp.json()["results"]]
        assert str(open_alert.pk) in ids
        assert str(ack_alert.pk) not in ids

    def test_filter_by_severity_critical_returns_only_critical_alerts(
        self, admin_client, tenant, assert_status
    ):
        critical_alert = Alert.objects.create(
            tenant     = tenant,
            alert_type = Alert.AlertType.CELERY_FAILURE,
            severity   = Alert.Severity.CRITICAL,
            message    = "Critical severity",
        )
        warning_alert = Alert.objects.create(
            tenant     = tenant,
            alert_type = Alert.AlertType.IMPORT_FAILURE,
            severity   = Alert.Severity.WARNING,
            message    = "Warning severity",
        )

        resp = admin_client.get(ALERTS_BASE, {"severity": "CRITICAL"})
        assert_status(resp, 200)

        ids = [item["id"] for item in resp.json()["results"]]
        assert str(critical_alert.pk) in ids
        assert str(warning_alert.pk) not in ids


# ---------------------------------------------------------------------------
# 4. Webhook endpoint CRUD (ADMIN only)
# ---------------------------------------------------------------------------

class TestWebhookEndpointCRUD:

    def test_admin_can_create_webhook_with_private_url(
        self, admin_client, assert_status
    ):
        resp = admin_client.post(
            WEBHOOKS_BASE,
            data={
                "url":       PRIVATE_URL,
                "secret":    "supersecret",
                "is_active": True,
                "events":    ["alert.created"],
            },
            format="json",
        )
        assert_status(resp, 201)
        data = resp.json()
        assert data["url"] == PRIVATE_URL
        assert data["is_active"] is True

    def test_create_webhook_with_public_url_returns_422(
        self, admin_client, assert_status
    ):
        resp = admin_client.post(
            WEBHOOKS_BASE,
            data={
                "url":    PUBLIC_URL,
                "secret": "supersecret",
                "events": ["alert.created"],
            },
            format="json",
        )
        assert_status(resp, 422)

    def test_admin_can_patch_webhook(
        self, admin_client, webhook_endpoint, assert_status
    ):
        resp = admin_client.patch(
            f"{WEBHOOKS_BASE}{webhook_endpoint.pk}/",
            data={"is_active": False},
            format="json",
        )
        assert_status(resp, 200)
        assert resp.json()["is_active"] is False

        webhook_endpoint.refresh_from_db()
        assert webhook_endpoint.is_active is False

    def test_admin_can_delete_webhook(
        self, admin_client, webhook_endpoint, assert_status
    ):
        pk = webhook_endpoint.pk
        resp = admin_client.delete(f"{WEBHOOKS_BASE}{pk}/")
        assert_status(resp, 204)

        assert not WebhookEndpoint.objects.filter(pk=pk).exists()

    def test_staff_cannot_create_webhook(
        self, staff_client, assert_status
    ):
        resp = staff_client.post(
            WEBHOOKS_BASE,
            data={
                "url":    PRIVATE_URL,
                "secret": "supersecret",
                "events": ["alert.created"],
            },
            format="json",
        )
        assert_status(resp, 403)


# ---------------------------------------------------------------------------
# 5. create_alert utility
# ---------------------------------------------------------------------------

class TestCreateAlertUtility:

    def test_create_alert_produces_correct_record(self, tenant):
        from integrations.alert_utils import create_alert

        alert = create_alert(
            alert_type = Alert.AlertType.IMPORT_FAILURE,
            severity   = Alert.Severity.WARNING,
            message    = "Bulk import failed for site X.",
            tenant     = tenant,
        )

        assert alert.pk is not None
        assert alert.tenant_id == tenant.pk
        assert alert.alert_type == Alert.AlertType.IMPORT_FAILURE
        assert alert.severity   == Alert.Severity.WARNING
        assert alert.message    == "Bulk import failed for site X."

    def test_create_alert_has_open_status_by_default(self, tenant):
        from integrations.alert_utils import create_alert

        alert = create_alert(
            alert_type = Alert.AlertType.CELERY_FAILURE,
            severity   = Alert.Severity.CRITICAL,
            message    = "Celery worker died unexpectedly.",
            tenant     = tenant,
        )

        assert alert.status == Alert.Status.OPEN


# ---------------------------------------------------------------------------
# 6. Webhook dispatch
# ---------------------------------------------------------------------------

class TestWebhookDispatch:

    def test_dispatch_creates_delivery_attempt_for_subscribed_event(
        self, tenant, webhook_endpoint
    ):
        from integrations.webhook_utils import dispatch_webhook

        # webhook_endpoint is subscribed to 'test.event'
        dispatch_webhook(
            event_type = "test.event",
            payload    = {"key": "value"},
            tenant     = tenant,
        )

        delivery = WebhookDeliveryAttempt.objects.filter(
            endpoint   = webhook_endpoint,
            event_type = "test.event",
        ).first()
        assert delivery is not None
        assert delivery.status == WebhookDeliveryAttempt.DeliveryStatus.PENDING

    def test_dispatch_does_not_create_delivery_for_unsubscribed_event(
        self, tenant, webhook_endpoint
    ):
        from integrations.webhook_utils import dispatch_webhook

        # webhook_endpoint is NOT subscribed to 'other.event'
        before_count = WebhookDeliveryAttempt.objects.count()

        dispatch_webhook(
            event_type = "other.event",
            payload    = {"key": "value"},
            tenant     = tenant,
        )

        after_count = WebhookDeliveryAttempt.objects.count()
        assert after_count == before_count


# ---------------------------------------------------------------------------
# 7. Alert detail (GET /api/v1/integrations/alerts/:pk/)
# ---------------------------------------------------------------------------

class TestAlertDetail:

    def test_admin_can_get_alert_detail(
        self, admin_client, alert, assert_status
    ):
        resp = admin_client.get(f"{ALERTS_BASE}{alert.pk}/")
        assert_status(resp, 200)
        data = resp.json()
        assert data["id"] == str(alert.pk)
        assert data["status"] == Alert.Status.OPEN

    def test_alert_detail_response_shape(
        self, admin_client, alert, assert_status
    ):
        resp = admin_client.get(f"{ALERTS_BASE}{alert.pk}/")
        assert_status(resp, 200)
        data = resp.json()
        for field in ("id", "alert_type", "severity", "message", "status"):
            assert field in data

    def test_nonexistent_alert_returns_404(
        self, admin_client, assert_status
    ):
        import uuid
        resp = admin_client.get(f"{ALERTS_BASE}{uuid.uuid4()}/")
        assert_status(resp, 404)

    def test_courier_cannot_get_alert_detail(
        self, courier_client, alert, assert_status
    ):
        resp = courier_client.get(f"{ALERTS_BASE}{alert.pk}/")
        assert_status(resp, 403)

    def test_staff_can_get_alert_assigned_to_them(
        self, admin_client, staff_client, tenant, admin_user, staff_user, assert_status
    ):
        a = Alert.objects.create(
            tenant=tenant,
            alert_type=Alert.AlertType.IMPORT_FAILURE,
            severity=Alert.Severity.WARNING,
            message="Assigned to staff",
        )
        a.transition(Alert.Status.ACKNOWLEDGED, admin_user)
        a.transition(Alert.Status.ASSIGNED, admin_user, assigned_to=staff_user)

        resp = staff_client.get(f"{ALERTS_BASE}{a.pk}/")
        assert_status(resp, 200)
        assert resp.json()["id"] == str(a.pk)


# ---------------------------------------------------------------------------
# 8. Webhook list (GET /api/v1/integrations/webhooks/)
# ---------------------------------------------------------------------------

class TestWebhookList:

    def test_admin_can_list_webhooks(
        self, admin_client, webhook_endpoint, assert_status
    ):
        resp = admin_client.get(WEBHOOKS_BASE)
        assert_status(resp, 200)
        assert "results" in resp.json()

    def test_list_includes_created_webhook(
        self, admin_client, webhook_endpoint, assert_status
    ):
        resp = admin_client.get(WEBHOOKS_BASE)
        assert_status(resp, 200)
        ids = [w["id"] for w in resp.json()["results"]]
        assert str(webhook_endpoint.pk) in ids

    def test_list_empty_when_no_webhooks(self, admin_client, assert_status):
        resp = admin_client.get(WEBHOOKS_BASE)
        assert_status(resp, 200)
        assert resp.json()["results"] == []

    def test_staff_cannot_list_webhooks(
        self, staff_client, assert_status
    ):
        resp = staff_client.get(WEBHOOKS_BASE)
        assert_status(resp, 403)


# ---------------------------------------------------------------------------
# 9. Webhook detail (GET /api/v1/integrations/webhooks/:pk/)
# ---------------------------------------------------------------------------

class TestWebhookDetail:

    def test_admin_can_get_webhook_detail(
        self, admin_client, webhook_endpoint, assert_status
    ):
        resp = admin_client.get(f"{WEBHOOKS_BASE}{webhook_endpoint.pk}/")
        assert_status(resp, 200)
        data = resp.json()
        assert data["id"] == str(webhook_endpoint.pk)
        assert data["url"] == webhook_endpoint.url

    def test_webhook_detail_response_shape(
        self, admin_client, webhook_endpoint, assert_status
    ):
        resp = admin_client.get(f"{WEBHOOKS_BASE}{webhook_endpoint.pk}/")
        assert_status(resp, 200)
        data = resp.json()
        for field in ("id", "url", "is_active", "events"):
            assert field in data

    def test_nonexistent_webhook_returns_404(
        self, admin_client, assert_status
    ):
        import uuid
        resp = admin_client.get(f"{WEBHOOKS_BASE}{uuid.uuid4()}/")
        assert_status(resp, 404)

    def test_staff_cannot_get_webhook_detail(
        self, staff_client, webhook_endpoint, assert_status
    ):
        resp = staff_client.get(f"{WEBHOOKS_BASE}{webhook_endpoint.pk}/")
        assert_status(resp, 403)
