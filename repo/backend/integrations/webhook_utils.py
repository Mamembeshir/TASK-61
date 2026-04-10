"""
integrations/webhook_utils.py

dispatch_webhook(event_type, payload, tenant):
  1. Find active endpoints subscribed to event_type (for this tenant)
  2. Build signed payload envelope
  3. Queue a Celery delivery task per endpoint
"""
import uuid
from django.utils import timezone


def _build_envelope(event_type: str, idempotency_key: str, tenant_id: str, data: dict) -> dict:
    return {
        "event_type":      event_type,
        "idempotency_key": idempotency_key,
        "timestamp":       timezone.now().isoformat(),
        "tenant_id":       str(tenant_id),
        "data":            data,
    }


def dispatch_webhook(event_type: str, payload: dict, tenant) -> None:
    """
    Fire-and-forget: find subscribed endpoints and enqueue a delivery task for each.
    Silently no-ops if no active endpoints exist for the event.
    """
    from integrations.models import WebhookEndpoint, WebhookDeliveryAttempt

    endpoints = WebhookEndpoint.objects.filter(
        tenant=tenant,
        is_active=True,
    )
    # Filter to those subscribed to this event_type
    endpoints = [ep for ep in endpoints if event_type in (ep.events or [])]
    if not endpoints:
        return

    idempotency_key = str(uuid.uuid4())
    envelope = _build_envelope(event_type, idempotency_key, tenant.pk, payload)

    for endpoint in endpoints:
        delivery = WebhookDeliveryAttempt.objects.create(
            endpoint        = endpoint,
            event_type      = event_type,
            idempotency_key = idempotency_key,
            payload         = envelope,
            status          = WebhookDeliveryAttempt.DeliveryStatus.PENDING,
            attempt_number  = 1,
        )
        from integrations.tasks import send_webhook_delivery
        send_webhook_delivery.apply_async(args=[str(delivery.pk)], countdown=0)
