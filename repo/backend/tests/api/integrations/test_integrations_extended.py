"""
tests/api/integrations/test_integrations_extended.py

Extended integration tests covering:
  - Alert full lifecycle (OPEN → ACK → ASSIGN → CLOSE)
  - Close without / with short resolution_note → 422
  - Webhook delivery task: mock HTTP success → SUCCESS status
  - Webhook delivery task: mock 3 failures → FAILED + alert created
  - Idempotency-Key header: repeat POST returns cached response
  - Rate limit: 101st request returns 429
  - Re-notification: CRITICAL alert >60 min old → new CRITICAL_RENOTIFY alert
  - Menu publish fires menu.published webhook delivery
"""
import urllib.error
import uuid
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from integrations.models import Alert, WebhookEndpoint, WebhookDeliveryAttempt

pytestmark = [pytest.mark.api, pytest.mark.django_db]

ALERTS_BASE   = "/api/v1/integrations/alerts/"
WEBHOOKS_BASE = "/api/v1/integrations/webhooks/"


# ---------------------------------------------------------------------------
# Shared fixtures (mirrors test_integrations.py so each file is self-contained)
# ---------------------------------------------------------------------------

@pytest.fixture
def alert(tenant, admin_user):
    return Alert.objects.create(
        tenant     = tenant,
        alert_type = Alert.AlertType.IMPORT_FAILURE,
        severity   = Alert.Severity.WARNING,
        message    = "Test alert message for extended tests",
    )


@pytest.fixture
def acknowledged_alert(alert, admin_user):
    alert.transition(Alert.Status.ACKNOWLEDGED, admin_user)
    return alert


@pytest.fixture
def assigned_alert(acknowledged_alert, admin_user, staff_user):
    acknowledged_alert.transition(
        Alert.Status.ASSIGNED, admin_user, assigned_to=staff_user
    )
    return acknowledged_alert


@pytest.fixture
def webhook_endpoint(tenant):
    return WebhookEndpoint.objects.create(
        tenant    = tenant,
        url       = "http://localhost:9000/webhook/",
        secret    = "mysecret123",
        is_active = True,
        events    = ["test.event", "menu.published"],
    )


@pytest.fixture
def delivery(webhook_endpoint):
    """A PENDING WebhookDeliveryAttempt ready to be processed."""
    return WebhookDeliveryAttempt.objects.create(
        endpoint        = webhook_endpoint,
        event_type      = "test.event",
        idempotency_key = uuid.uuid4(),
        payload         = {"event_type": "test.event", "data": {"key": "value"}},
        status          = WebhookDeliveryAttempt.DeliveryStatus.PENDING,
        attempt_number  = 1,
    )


# ---------------------------------------------------------------------------
# 1. Full alert lifecycle
# ---------------------------------------------------------------------------

class TestAlertFullLifecycle:

    def test_open_to_closed_full_lifecycle(
        self, admin_client, staff_client, alert, staff_user, assert_status
    ):
        # Step 1 — Acknowledge
        resp = admin_client.post(f"{ALERTS_BASE}{alert.pk}/acknowledge/")
        assert_status(resp, 200)
        assert resp.json()["status"] == Alert.Status.ACKNOWLEDGED

        # Step 2 — Assign to staff_user
        resp = admin_client.post(
            f"{ALERTS_BASE}{alert.pk}/assign/",
            data={"assigned_to": str(staff_user.pk)},
            format="json",
        )
        assert_status(resp, 200)
        assert resp.json()["status"] == Alert.Status.ASSIGNED

        # Step 3 — Close (STAFF who is assigned can close)
        resp = staff_client.post(
            f"{ALERTS_BASE}{alert.pk}/close/",
            data={"resolution_note": "Issue was resolved after thorough investigation."},
            format="json",
        )
        assert_status(resp, 200)
        assert resp.json()["status"] == Alert.Status.CLOSED

        alert.refresh_from_db()
        assert alert.status == Alert.Status.CLOSED
        assert len(alert.resolution_note) >= 10


# ---------------------------------------------------------------------------
# 2. Close validation
# ---------------------------------------------------------------------------

class TestAlertCloseValidation:

    def test_close_without_resolution_note_returns_422(
        self, admin_client, assigned_alert, assert_status
    ):
        resp = admin_client.post(
            f"{ALERTS_BASE}{assigned_alert.pk}/close/",
            data={"resolution_note": ""},
            format="json",
        )
        assert_status(resp, 422)
        assigned_alert.refresh_from_db()
        assert assigned_alert.status == Alert.Status.ASSIGNED

    def test_close_with_5_char_note_returns_422(
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

    def test_close_with_10_char_note_succeeds(
        self, admin_client, assigned_alert, assert_status
    ):
        resp = admin_client.post(
            f"{ALERTS_BASE}{assigned_alert.pk}/close/",
            data={"resolution_note": "1234567890"},
            format="json",
        )
        assert_status(resp, 200)
        assert resp.json()["status"] == Alert.Status.CLOSED


# ---------------------------------------------------------------------------
# 3. Webhook delivery task — mocked HTTP
# ---------------------------------------------------------------------------

class _MockHTTPSuccess:
    """Context-manager mock for urllib.request.urlopen that returns 200."""
    status = 200

    def read(self, size=-1):
        return b'{"ok": true}'

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class TestWebhookDeliveryTask:

    def test_successful_http_marks_delivery_success(self, delivery):
        from integrations.tasks import send_webhook_delivery

        with patch("urllib.request.urlopen", return_value=_MockHTTPSuccess()):
            send_webhook_delivery.apply(args=[str(delivery.pk)])

        delivery.refresh_from_db()
        assert delivery.status == WebhookDeliveryAttempt.DeliveryStatus.SUCCESS
        assert delivery.response_status_code == 200
        assert delivery.sent_at is not None

    def test_exhausted_retries_marks_failed_and_creates_alert(
        self, delivery, tenant
    ):
        from integrations.tasks import send_webhook_delivery

        # Simulate: task has already retried 3 times (retries=3 → skips retry, goes FAILED)
        with patch("urllib.request.urlopen", side_effect=IOError("connection refused")):
            send_webhook_delivery.apply(args=[str(delivery.pk)], retries=3)

        delivery.refresh_from_db()
        assert delivery.status == WebhookDeliveryAttempt.DeliveryStatus.FAILED

        # A WEBHOOK_FAILURE alert must be created
        alert = Alert.objects.filter(
            tenant     = tenant,
            alert_type = Alert.AlertType.WEBHOOK_FAILURE,
        ).first()
        assert alert is not None
        assert alert.severity == Alert.Severity.WARNING

    def test_http_500_response_marks_delivery_failed(self, delivery, tenant):
        from integrations.tasks import send_webhook_delivery

        err = urllib.error.HTTPError(
            url=delivery.endpoint.url,
            code=500,
            msg="Internal Server Error",
            hdrs=None,  # type: ignore[arg-type]
            fp=None,
        )
        err.read = lambda size=-1: b"server error"

        with patch("urllib.request.urlopen", side_effect=err):
            send_webhook_delivery.apply(args=[str(delivery.pk)], retries=3)

        delivery.refresh_from_db()
        assert delivery.status == WebhookDeliveryAttempt.DeliveryStatus.FAILED

    def test_delivery_log_endpoint_returns_deliveries(
        self, admin_client, webhook_endpoint, delivery, assert_status
    ):
        url = f"{WEBHOOKS_BASE}{webhook_endpoint.pk}/deliveries/"
        resp = admin_client.get(url)
        assert_status(resp, 200)
        ids = [d["id"] for d in resp.json()["results"]]
        assert str(delivery.pk) in ids


# ---------------------------------------------------------------------------
# 4. HTTP-level idempotency key
# ---------------------------------------------------------------------------

class TestIdempotencyKey:

    def test_same_key_returns_cached_response_without_reprocessing(
        self, admin_client, alert, assert_status
    ):
        url = f"{ALERTS_BASE}{alert.pk}/acknowledge/"
        key = f"idem-test-{uuid.uuid4().hex}"

        # First call — processes the transition
        resp1 = admin_client.post(url, HTTP_IDEMPOTENCY_KEY=key)
        assert_status(resp1, 200)
        assert resp1.json()["status"] == Alert.Status.ACKNOWLEDGED

        # Second call with same key — served from cache
        resp2 = admin_client.post(url, HTTP_IDEMPOTENCY_KEY=key)
        assert_status(resp2, 200)
        assert resp2.headers.get("X-Idempotency-Replayed") == "true"

        # Alert state unchanged (still ACKNOWLEDGED, not re-transitioned)
        alert.refresh_from_db()
        assert alert.status == Alert.Status.ACKNOWLEDGED


# ---------------------------------------------------------------------------
# 5. Rate limiting
# ---------------------------------------------------------------------------

class TestRateLimit:

    def test_101st_request_returns_429(self, auth_client, tenant, assert_status):
        from iam.models import User

        # Unique user per test run so Redis key doesn't bleed across runs
        user = User.objects.create_user(
            username = f"ratelimit_{uuid.uuid4().hex[:10]}",
            tenant   = tenant,
            password = "testpass123",
            role     = User.Role.STAFF,
            status   = User.AccountStatus.ACTIVE,
        )
        client = auth_client(user)
        url    = ALERTS_BASE

        statuses = [client.get(url).status_code for _ in range(101)]

        # First 100 must not be rate-limited (200 or 403 depending on role)
        for i, sc in enumerate(statuses[:100]):
            assert sc != 429, f"Request {i+1} was unexpectedly rate-limited"

        # 101st must be rate-limited
        assert statuses[100] == 429, "Expected 429 on request 101"

        last_resp = client.get(url)
        assert last_resp.json()["error"]["code"] == "rate_limited"


# ---------------------------------------------------------------------------
# 6. Re-notification of stale CRITICAL alerts
# ---------------------------------------------------------------------------

class TestRenotification:

    def test_renotify_critical_alert_older_than_60_min(self, tenant):
        from django.utils import timezone
        from integrations.tasks import renotify_critical_alerts

        alert = Alert.objects.create(
            tenant     = tenant,
            alert_type = Alert.AlertType.CELERY_FAILURE,
            severity   = Alert.Severity.CRITICAL,
            message    = "Critical failure requiring re-notification.",
        )
        # Backdate to 61 minutes ago so the task picks it up
        Alert.objects.filter(pk=alert.pk).update(
            created_at = timezone.now() - timezone.timedelta(minutes=61)
        )

        renotify_critical_alerts()

        renotify = Alert.objects.filter(
            alert_type = Alert.AlertType.CRITICAL_RENOTIFY,
            tenant     = tenant,
        ).first()
        assert renotify is not None, "Expected a CRITICAL_RENOTIFY alert to be created"
        assert renotify.severity == Alert.Severity.CRITICAL

    def test_recent_critical_alert_is_not_renotified(self, tenant):
        from integrations.tasks import renotify_critical_alerts

        Alert.objects.create(
            tenant     = tenant,
            alert_type = Alert.AlertType.CELERY_FAILURE,
            severity   = Alert.Severity.CRITICAL,
            message    = "Brand-new critical alert.",
        )

        renotify_critical_alerts()

        count = Alert.objects.filter(
            alert_type = Alert.AlertType.CRITICAL_RENOTIFY,
            tenant     = tenant,
        ).count()
        assert count == 0


# ---------------------------------------------------------------------------
# 7. Menu publish fires menu.published webhook
# ---------------------------------------------------------------------------

class TestMenuPublishWebhook:

    def test_publish_menu_version_creates_delivery_attempt(
        self, admin_client, admin_user, tenant, site, webhook_endpoint, assert_status
    ):
        """
        End-to-end: publishing a menu version via the API must create a
        WebhookDeliveryAttempt for every active endpoint subscribed to
        'menu.published'.
        """
        from foodservice.models import (
            Recipe, Dish, DishVersion,
            Menu, MenuVersion, MenuGroup, MenuGroupItem,
        )

        # Build minimal food-service hierarchy --------------------------------
        # (publish() only checks DishVersion.status — no RecipeVersion needed)
        recipe = Recipe.objects.create(
            tenant     = tenant,
            name       = "Ext-Test Recipe",
            created_by = admin_user,
        )

        dish = Dish.objects.create(
            tenant     = tenant,
            recipe     = recipe,
            created_by = admin_user,
        )
        import datetime
        dv = DishVersion.objects.create(
            dish             = dish,
            version_number   = 1,
            name             = "Ext-Test Dish v1",
            effective_from   = datetime.date.today(),
            per_serving_cost = Decimal("4.50"),
            status           = "ACTIVE",
            created_by       = admin_user,
        )

        menu = Menu.objects.create(tenant=tenant, name="Ext-Test Menu")
        mv   = MenuVersion.objects.create(
            menu           = menu,
            version_number = 1,
            status         = "DRAFT",
        )
        grp = MenuGroup.objects.create(
            menu_version = mv,
            name         = "Main",
            sort_order   = 1,
        )
        MenuGroupItem.objects.create(menu_group=grp, dish_version=dv, sort_order=1)

        # Publish the version -------------------------------------------------
        resp = admin_client.post(
            f"/api/v1/foodservice/menus/{menu.pk}/versions/{mv.pk}/publish/",
            data    = {"site_ids": [str(site.pk)]},
            format  = "json",
        )
        assert_status(resp, 200)

        # Verify a delivery attempt was queued for menu.published --------------
        delivery = WebhookDeliveryAttempt.objects.filter(
            endpoint   = webhook_endpoint,
            event_type = "menu.published",
        ).first()
        assert delivery is not None, "Expected a WebhookDeliveryAttempt for menu.published"
        assert delivery.payload["data"]["menu_id"] == str(menu.pk)
        assert delivery.payload["data"]["version_id"] == str(mv.pk)
