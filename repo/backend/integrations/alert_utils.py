"""
integrations/alert_utils.py

Utility: create_alert(alert_type, severity, message, tenant, original_alert=None)
Called from tasks, views, and signal handlers throughout the codebase.
"""


def create_alert(alert_type: str, severity: str, message: str, tenant, original_alert=None):
    """
    Create an Alert record and fire alert.created webhook.
    Safe to call from Celery tasks (uses lazy import to avoid circular deps).
    """
    from integrations.models import Alert
    alert = Alert.objects.create(
        tenant         = tenant,
        alert_type     = alert_type,
        severity       = severity,
        message        = message,
        original_alert = original_alert,
    )
    # Fire webhook (import lazily to avoid circular)
    try:
        from integrations.webhook_utils import dispatch_webhook
        dispatch_webhook(
            event_type = "alert.created",
            payload    = {
                "id":         str(alert.pk),
                "alert_type": alert.alert_type,
                "severity":   alert.severity,
                "message":    alert.message,
                "status":     alert.status,
            },
            tenant = tenant,
        )
    except Exception:
        pass  # never block alert creation on webhook failure
    return alert
