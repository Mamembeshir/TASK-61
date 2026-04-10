"""
integrations/tasks.py

- send_webhook_delivery: fire one delivery attempt, retry up to 3 times.
  On final failure → create WARNING alert.
- renotify_critical_alerts: every 15 min, re-alert on OPEN CRITICAL > 60 min old.
- check_overdue_task_threshold: called by meetings.tasks.check_overdue_tasks;
  if any site has >10 overdue tasks → INFO alert.
"""
import hashlib
import hmac
import json
import logging
import urllib.error
import urllib.request

from celery import shared_task
from django.db import models
from django.utils import timezone

logger = logging.getLogger(__name__)

_RETRY_DELAYS = [60, 180, 360]  # 1 min, 3 min, 6 min


@shared_task(name="integrations.send_webhook_delivery", bind=True, max_retries=3)
def send_webhook_delivery(self, delivery_id: str) -> dict:
    from integrations.models import WebhookDeliveryAttempt

    try:
        delivery = WebhookDeliveryAttempt.objects.select_related("endpoint__tenant").get(pk=delivery_id)
    except WebhookDeliveryAttempt.DoesNotExist:
        return {"error": "delivery not found"}

    endpoint = delivery.endpoint
    payload_json = json.dumps(delivery.payload, sort_keys=True, default=str)

    # HMAC-SHA256 signature
    sig = hmac.new(
        endpoint.secret.encode("utf-8"),
        payload_json.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    try:
        req = urllib.request.Request(
            endpoint.url,
            data=payload_json.encode("utf-8"),
            headers={
                "Content-Type":      "application/json",
                "X-HarborOps-Sig":   f"sha256={sig}",
                "X-Idempotency-Key": str(delivery.idempotency_key),
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                response_status = resp.status
                response_body   = resp.read(2000).decode("utf-8", errors="replace")
        except urllib.error.HTTPError as http_err:
            response_status = http_err.code
            response_body   = http_err.read(2000).decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {response_status}")

        delivery.response_status_code = response_status
        delivery.response_body        = response_body
        delivery.sent_at              = timezone.now()

        if 200 <= response_status < 300:
            delivery.status = WebhookDeliveryAttempt.DeliveryStatus.SUCCESS
            delivery.save()
            return {"status": "success", "http_status": response_status}
        else:
            raise RuntimeError(f"HTTP {response_status}")

    except Exception as exc:
        delivery.attempt_number += 1
        delivery.save(update_fields=["attempt_number", "response_status_code", "response_body"])

        attempt = self.request.retries  # 0-based
        if attempt < 3:
            raise self.retry(exc=exc, countdown=_RETRY_DELAYS[attempt])

        # All retries exhausted → mark FAILED + create alert
        delivery.status = WebhookDeliveryAttempt.DeliveryStatus.FAILED
        delivery.save()

        from integrations.alert_utils import create_alert
        from integrations.models import Alert
        create_alert(
            alert_type = Alert.AlertType.WEBHOOK_FAILURE,
            severity   = Alert.Severity.WARNING,
            message    = (
                f"Webhook delivery to {endpoint.url} failed after 3 attempts "
                f"for event '{delivery.event_type}'."
            ),
            tenant     = endpoint.tenant,
        )
        return {"status": "failed"}


@shared_task(name="integrations.renotify_critical_alerts")
def renotify_critical_alerts() -> dict:
    """
    Every 15 min: for OPEN CRITICAL alerts older than 60 min,
    create a new CRITICAL_RENOTIFY alert referencing the original.
    """
    from integrations.models import Alert
    from integrations.alert_utils import create_alert

    cutoff = timezone.now() - timezone.timedelta(minutes=60)
    stale = Alert.objects.filter(
        status          = Alert.Status.OPEN,
        severity        = Alert.Severity.CRITICAL,
        created_at__lte = cutoff,
    ).select_related("tenant")

    created = 0
    for alert in stale:
        create_alert(
            alert_type     = Alert.AlertType.CRITICAL_RENOTIFY,
            severity       = Alert.Severity.CRITICAL,
            message        = (
                f"[RE-NOTIFICATION] Critical alert still OPEN after >60 min: "
                f"{alert.message[:200]}"
            ),
            tenant         = alert.tenant,
            original_alert = alert,
        )
        created += 1

    return {"renotifications_created": created}


@shared_task(name="integrations.check_overdue_task_threshold")
def check_overdue_task_threshold() -> dict:
    """
    Called after overdue tasks are marked. For each site with >10 OVERDUE tasks,
    create an INFO alert.
    """
    from meetings.models import Task
    from integrations.models import Alert
    from integrations.alert_utils import create_alert
    from django.db.models import Count

    site_counts = (
        Task.objects
        .filter(status=Task.Status.OVERDUE)
        .exclude(resolution__meeting__site__isnull=True)
        .values(
            site_id   = models.F("resolution__meeting__site_id"),
            site_name = models.F("resolution__meeting__site__name"),
            tenant_id = models.F("resolution__meeting__tenant_id"),
        )
        .annotate(cnt=Count("id"))
        .filter(cnt__gt=10)
    )

    # We need actual tenant objects
    from tenants.models import Tenant
    created = 0
    for row in site_counts:
        try:
            tenant = Tenant.objects.get(pk=row["tenant_id"])
        except Tenant.DoesNotExist:
            continue
        create_alert(
            alert_type = Alert.AlertType.OVERDUE_THRESHOLD,
            severity   = Alert.Severity.INFO,
            message    = (
                f"Site '{row['site_name']}' has {row['cnt']} overdue tasks (threshold: 10)."
            ),
            tenant = tenant,
        )
        created += 1

    return {"sites_alerted": created}
