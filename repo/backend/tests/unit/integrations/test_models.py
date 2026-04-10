"""
tests/unit/integrations/test_models.py

Unit tests for:
  - Alert: state machine (OPEN→ACK→ASSIGNED→CLOSED), invalid transitions,
    resolution_note ≥10 chars required to close, timestamps set correctly,
    actor fields populated
  - WebhookEndpoint: URL required, is_active flag, events_filter JSON
  - WebhookDeliveryAttempt: attempt tracking fields
"""
import pytest
from django.core.exceptions import ValidationError

from integrations.models import Alert, WebhookEndpoint, WebhookDeliveryAttempt
from iam.factories import TenantFactory, UserFactory


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_alert(tenant, severity=Alert.Severity.WARNING, status=Alert.Status.OPEN):
    return Alert.objects.create(
        tenant=tenant,
        alert_type=Alert.AlertType.OVERDUE_THRESHOLD,
        severity=severity,
        message="Test alert message",
        status=status,
    )


# ===========================================================================
# 1. Alert state machine
# ===========================================================================

@pytest.mark.django_db
class TestAlertStateMachine:

    def setup_method(self):
        self.tenant = TenantFactory()
        self.user = UserFactory(tenant=self.tenant)

    # ---- valid transitions --------------------------------------------------

    def test_open_to_acknowledged(self):
        alert = make_alert(self.tenant)
        alert.transition(Alert.Status.ACKNOWLEDGED, actor=self.user)
        alert.refresh_from_db()
        assert alert.status == Alert.Status.ACKNOWLEDGED

    def test_acknowledged_to_assigned(self):
        alert = make_alert(self.tenant, status=Alert.Status.ACKNOWLEDGED)
        alert.transition(Alert.Status.ASSIGNED, actor=self.user, assigned_to=self.user)
        alert.refresh_from_db()
        assert alert.status == Alert.Status.ASSIGNED

    def test_assigned_to_closed(self):
        alert = make_alert(self.tenant, status=Alert.Status.ASSIGNED)
        note = "Resolved by replacing the faulty component."
        alert.transition(Alert.Status.CLOSED, actor=self.user, resolution_note=note)
        alert.refresh_from_db()
        assert alert.status == Alert.Status.CLOSED

    # ---- invalid transitions ------------------------------------------------

    def test_open_cannot_skip_to_assigned(self):
        alert = make_alert(self.tenant)
        with pytest.raises(ValidationError):
            alert.transition(Alert.Status.ASSIGNED, actor=self.user)

    def test_open_cannot_skip_to_closed(self):
        alert = make_alert(self.tenant)
        with pytest.raises(ValidationError):
            alert.transition(Alert.Status.CLOSED, actor=self.user,
                             resolution_note="A long enough note here.")

    def test_acknowledged_cannot_skip_to_closed(self):
        alert = make_alert(self.tenant, status=Alert.Status.ACKNOWLEDGED)
        with pytest.raises(ValidationError):
            alert.transition(Alert.Status.CLOSED, actor=self.user,
                             resolution_note="A long enough note here.")

    def test_closed_is_terminal(self):
        alert = make_alert(self.tenant, status=Alert.Status.CLOSED)
        with pytest.raises(ValidationError):
            alert.transition(Alert.Status.OPEN, actor=self.user)

    # ---- resolution_note validation -----------------------------------------

    def test_close_requires_resolution_note_at_least_10_chars(self):
        alert = make_alert(self.tenant, status=Alert.Status.ASSIGNED)
        with pytest.raises(ValidationError, match="10 characters"):
            alert.transition(Alert.Status.CLOSED, actor=self.user,
                             resolution_note="Short")

    def test_close_with_empty_note_raises(self):
        alert = make_alert(self.tenant, status=Alert.Status.ASSIGNED)
        with pytest.raises(ValidationError):
            alert.transition(Alert.Status.CLOSED, actor=self.user, resolution_note="")

    def test_close_with_exactly_10_chars_succeeds(self):
        alert = make_alert(self.tenant, status=Alert.Status.ASSIGNED)
        alert.transition(Alert.Status.CLOSED, actor=self.user,
                         resolution_note="1234567890")
        alert.refresh_from_db()
        assert alert.status == Alert.Status.CLOSED

    # ---- timestamp fields ---------------------------------------------------

    def test_acknowledged_at_set_on_acknowledge(self):
        alert = make_alert(self.tenant)
        alert.transition(Alert.Status.ACKNOWLEDGED, actor=self.user)
        alert.refresh_from_db()
        assert alert.acknowledged_at is not None
        assert alert.acknowledged_by == self.user

    def test_closed_at_set_on_close(self):
        alert = make_alert(self.tenant, status=Alert.Status.ASSIGNED)
        alert.transition(Alert.Status.CLOSED, actor=self.user,
                         resolution_note="Fixed the root cause completely.")
        alert.refresh_from_db()
        assert alert.closed_at is not None
        assert alert.closed_by == self.user

    # ---- severity choices ---------------------------------------------------

    def test_critical_severity_stored(self):
        alert = make_alert(self.tenant, severity=Alert.Severity.CRITICAL)
        assert alert.severity == Alert.Severity.CRITICAL

    def test_info_severity_stored(self):
        alert = make_alert(self.tenant, severity=Alert.Severity.INFO)
        assert alert.severity == Alert.Severity.INFO

    # ---- ordering -----------------------------------------------------------

    def test_ordering_is_newest_first(self):
        a1 = make_alert(self.tenant)
        a2 = make_alert(self.tenant)
        alerts = list(Alert.objects.filter(tenant=self.tenant))
        assert alerts[0].pk == a2.pk


# ===========================================================================
# 2. WebhookEndpoint
# ===========================================================================

@pytest.mark.django_db
class TestWebhookEndpoint:

    def _make_endpoint(self, tenant, url="https://example.com/hook"):
        return WebhookEndpoint.objects.create(
            tenant=tenant,
            url=url,
            secret="test-secret",           # required field
            events=["MENU_PUBLISHED"],       # field is `events`, not `events_filter`
            is_active=True,
        )

    def test_create_webhook_endpoint(self):
        tenant = TenantFactory()
        ep = self._make_endpoint(tenant)
        assert ep.pk is not None
        assert ep.url == "https://example.com/hook"
        assert ep.is_active is True

    def test_events_stored_as_json(self):
        tenant = TenantFactory()
        events = ["MENU_PUBLISHED", "ALERT_CREATED"]
        ep = WebhookEndpoint.objects.create(
            tenant=tenant,
            url="https://example.com/hook2",
            secret="test-secret",
            events=events,
        )
        ep.refresh_from_db()
        assert "MENU_PUBLISHED" in ep.events

    def test_is_active_defaults_to_true(self):
        tenant = TenantFactory()
        ep = WebhookEndpoint.objects.create(
            tenant=tenant,
            url="https://example.com/hook3",
            secret="test-secret",
        )
        assert ep.is_active is True

    def test_multiple_endpoints_per_tenant(self):
        tenant = TenantFactory()
        WebhookEndpoint.objects.create(tenant=tenant, url="https://a.com/1", secret="s1")
        WebhookEndpoint.objects.create(tenant=tenant, url="https://a.com/2", secret="s2")
        assert WebhookEndpoint.objects.filter(tenant=tenant).count() == 2

    def test_tenant_isolation(self):
        t1 = TenantFactory()
        t2 = TenantFactory()
        WebhookEndpoint.objects.create(tenant=t1, url="https://t1.com/hook", secret="s1")
        WebhookEndpoint.objects.create(tenant=t2, url="https://t2.com/hook", secret="s2")
        assert WebhookEndpoint.objects.filter(tenant=t1).count() == 1
        assert WebhookEndpoint.objects.filter(tenant=t2).count() == 1


# ===========================================================================
# 3. WebhookDeliveryAttempt
# ===========================================================================

@pytest.mark.django_db
class TestWebhookDeliveryAttempt:

    def _make_endpoint(self, tenant):
        return WebhookEndpoint.objects.create(
            tenant=tenant, url="https://example.com/hook", secret="test-secret"
        )

    def test_create_delivery_attempt(self):
        tenant = TenantFactory()
        ep = self._make_endpoint(tenant)
        attempt = WebhookDeliveryAttempt.objects.create(
            endpoint=ep,
            event_type="MENU_PUBLISHED",
            payload={"menu_id": "abc"},
            status=WebhookDeliveryAttempt.DeliveryStatus.SUCCESS,
            response_status_code=200,
            attempt_number=1,
        )
        assert attempt.pk is not None
        assert attempt.status == WebhookDeliveryAttempt.DeliveryStatus.SUCCESS

    def test_failed_attempt_stored(self):
        tenant = TenantFactory()
        ep = self._make_endpoint(tenant)
        attempt = WebhookDeliveryAttempt.objects.create(
            endpoint=ep,
            event_type="ALERT_CREATED",
            payload={"alert_id": "xyz"},
            status=WebhookDeliveryAttempt.DeliveryStatus.FAILED,
            response_status_code=500,
            response_body="Connection refused",
            attempt_number=1,
        )
        assert attempt.status == WebhookDeliveryAttempt.DeliveryStatus.FAILED
        assert attempt.response_status_code == 500

    def test_default_status_is_pending(self):
        tenant = TenantFactory()
        ep = self._make_endpoint(tenant)
        attempt = WebhookDeliveryAttempt.objects.create(
            endpoint=ep,
            event_type="TEST",
            payload={},
        )
        assert attempt.status == WebhookDeliveryAttempt.DeliveryStatus.PENDING

    def test_multiple_attempts_per_endpoint(self):
        tenant = TenantFactory()
        ep = self._make_endpoint(tenant)
        for i in range(3):
            WebhookDeliveryAttempt.objects.create(
                endpoint=ep,
                event_type="TEST",
                payload={},
                attempt_number=i + 1,
                status=WebhookDeliveryAttempt.DeliveryStatus.SUCCESS if i == 2
                       else WebhookDeliveryAttempt.DeliveryStatus.FAILED,
            )
        assert WebhookDeliveryAttempt.objects.filter(endpoint=ep).count() == 3
