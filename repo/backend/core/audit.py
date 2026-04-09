"""
core/audit.py

Utility for creating AuditLog entries from anywhere in the application.

Usage:
    from core.audit import log_audit

    log_audit(
        actor=request.user,
        action=AuditLog.Action.UPDATE,
        entity=asset_instance,
        diff={"name": ["old name", "new name"]},
        request=request,           # optional — extracts IP + user-agent
    )
"""
from __future__ import annotations
from typing import Any, Optional


def log_audit(
    actor,
    action: str,
    entity,
    diff: Optional[dict] = None,
    request=None,
    tenant_id=None,
) -> None:
    """
    Create an immutable AuditLog record.

    Parameters
    ----------
    actor   : User instance or None (for system-initiated actions)
    action  : AuditLog.Action choice string
    entity  : Any Django model instance  (uses type name + str(pk))
    diff    : Dict describing what changed, e.g. {"field": [old, new]}
    request : HttpRequest — used to extract IP address and user-agent
    tenant_id : UUID — overrides actor.tenant_id when actor is None
    """
    from core.models import AuditLog  # local import to avoid circular deps

    ip_address = None
    user_agent = None
    if request is not None:
        ip_address = _get_client_ip(request)
        user_agent = request.META.get("HTTP_USER_AGENT", "")[:500]

    actor_id = None
    actor_username = None
    resolved_tenant_id = tenant_id
    if actor is not None and hasattr(actor, "pk"):
        actor_id = str(actor.pk)
        actor_username = getattr(actor, "username", None)
        if resolved_tenant_id is None:
            resolved_tenant_id = getattr(actor, "tenant_id", None)

    entity_type = type(entity).__name__
    entity_id = str(entity.pk) if hasattr(entity, "pk") else str(entity)

    AuditLog.objects.create(
        tenant_id=resolved_tenant_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        actor_id=actor_id,
        actor_username=actor_username,
        diff_json=diff,
        ip_address=ip_address,
        user_agent=user_agent,
    )


def _get_client_ip(request) -> Optional[str]:
    """Extract the real client IP, respecting X-Forwarded-For."""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")
