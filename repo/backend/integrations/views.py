"""
integrations/views.py

HarborOps integrations API — Alerts and Webhook endpoints.

Access control:
  - COURIER → 403 on all endpoints
  - Alert list: ADMIN sees all in tenant; STAFF sees only alerts assigned to them
  - Alert transitions: ADMIN always; STAFF can close only if assigned to them
  - Webhook endpoints: ADMIN only
"""
import ipaddress
import socket
from urllib.parse import urlparse

from django.core.exceptions import ValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404

from rest_framework.views    import APIView
from rest_framework.response import Response
from rest_framework          import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated

from core.exceptions import UnprocessableEntity
from core.models     import AuditLog
from integrations.models import Alert, WebhookEndpoint, WebhookDeliveryAttempt
from integrations.serializers import (
    AlertSerializer,
    AlertListSerializer,
    WebhookEndpointSerializer,
    WebhookDeliverySerializer,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR", "")


def _log(request, action, entity_type, entity_id, diff=None):
    AuditLog.objects.create(
        tenant_id      = request.user.tenant_id,
        entity_type    = entity_type,
        entity_id      = str(entity_id),
        action         = action,
        actor_id       = str(request.user.pk),
        actor_username = request.user.username,
        diff_json      = diff or {},
        ip_address     = _get_ip(request),
    )


def _require_not_courier(request):
    if getattr(request.user, "role", None) == "COURIER":
        raise PermissionDenied("COURIER users do not have access to this resource.")


def _require_admin(request):
    _require_not_courier(request)
    if getattr(request.user, "role", None) != "ADMIN":
        raise PermissionDenied("Only ADMIN users can perform this action.")


def _validate_webhook_url(url: str) -> None:
    """Reject URLs that don't resolve to a private (RFC 1918) IP or localhost."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise UnprocessableEntity("Webhook URL must use http or https.")
    hostname = parsed.hostname
    if hostname in ("localhost", "127.0.0.1", "::1"):
        return
    try:
        ip = socket.gethostbyname(hostname)
        addr = ipaddress.ip_address(ip)
        if not addr.is_private:
            raise UnprocessableEntity(
                "Webhook URL must resolve to a private (RFC 1918) IP or localhost."
            )
    except socket.gaierror:
        raise UnprocessableEntity(
            f"Webhook URL hostname could not be resolved: {hostname}"
        )


# ---------------------------------------------------------------------------
# Alert views
# ---------------------------------------------------------------------------

class AlertListView(APIView):
    """
    GET /api/v1/integrations/alerts/
    ADMIN: all alerts in tenant.
    STAFF: only alerts assigned to them.
    Filters: ?status=, ?severity=
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _require_not_courier(request)

        qs = Alert.objects.filter(tenant=request.user.tenant)

        if request.user.role == "STAFF":
            qs = qs.filter(assigned_to=request.user)

        status_filter = request.query_params.get("status", "").strip().upper()
        if status_filter:
            qs = qs.filter(status=status_filter)

        severity_filter = request.query_params.get("severity", "").strip().upper()
        if severity_filter:
            qs = qs.filter(severity=severity_filter)

        qs = qs.select_related("assigned_to", "acknowledged_by", "closed_by")
        serializer = AlertListSerializer(qs, many=True)
        return Response(serializer.data)


class AlertAcknowledgeView(APIView):
    """
    POST /api/v1/integrations/alerts/<pk>/acknowledge/
    ADMIN only.
    """
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        _require_admin(request)
        alert = get_object_or_404(Alert, pk=pk, tenant=request.user.tenant)
        try:
            alert.transition(Alert.Status.ACKNOWLEDGED, request.user)
        except ValidationError as exc:
            raise UnprocessableEntity("; ".join(exc.messages))
        _log(request, AuditLog.Action.UPDATE, "Alert", alert.pk,
             {"status": Alert.Status.ACKNOWLEDGED})
        return Response(AlertSerializer(alert).data)


class AlertAssignView(APIView):
    """
    POST /api/v1/integrations/alerts/<pk>/assign/
    ADMIN only. Body: {assigned_to: user_id}
    """
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        _require_admin(request)
        alert = get_object_or_404(Alert, pk=pk, tenant=request.user.tenant)

        user_id = request.data.get("assigned_to")
        if not user_id:
            raise UnprocessableEntity("assigned_to (user_id) is required.")

        from iam.models import User
        assignee = get_object_or_404(User, pk=user_id, tenant=request.user.tenant)

        try:
            alert.transition(Alert.Status.ASSIGNED, request.user, assigned_to=assignee)
        except ValidationError as exc:
            raise UnprocessableEntity("; ".join(exc.messages))

        _log(request, AuditLog.Action.UPDATE, "Alert", alert.pk,
             {"status": Alert.Status.ASSIGNED, "assigned_to_id": str(assignee.pk)})
        return Response(AlertSerializer(alert).data)


class AlertCloseView(APIView):
    """
    POST /api/v1/integrations/alerts/<pk>/close/
    ADMIN always; STAFF only if the alert is assigned to them.
    Body: {resolution_note: str}
    """
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        _require_not_courier(request)
        alert = get_object_or_404(Alert, pk=pk, tenant=request.user.tenant)

        if request.user.role == "STAFF":
            if alert.assigned_to_id != request.user.pk:
                raise PermissionDenied(
                    "STAFF users can only close alerts that are assigned to them."
                )

        resolution_note = request.data.get("resolution_note", "").strip()
        try:
            alert.transition(
                Alert.Status.CLOSED,
                request.user,
                resolution_note=resolution_note,
            )
        except ValidationError as exc:
            raise UnprocessableEntity("; ".join(exc.messages))

        _log(request, AuditLog.Action.UPDATE, "Alert", alert.pk,
             {"status": Alert.Status.CLOSED, "resolution_note": resolution_note[:100]})
        return Response(AlertSerializer(alert).data)


# ---------------------------------------------------------------------------
# Webhook views (ADMIN only)
# ---------------------------------------------------------------------------

class WebhookEndpointListCreateView(APIView):
    """
    GET  /api/v1/integrations/webhooks/  — list all endpoints for tenant
    POST /api/v1/integrations/webhooks/  — create a new endpoint
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _require_admin(request)
        endpoints = WebhookEndpoint.objects.filter(tenant=request.user.tenant)
        return Response(WebhookEndpointSerializer(endpoints, many=True).data)

    @transaction.atomic
    def post(self, request):
        _require_admin(request)

        url = request.data.get("url", "").strip()
        _validate_webhook_url(url)

        ser = WebhookEndpointSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        endpoint = WebhookEndpoint.objects.create(
            tenant    = request.user.tenant,
            url       = ser.validated_data["url"],
            secret    = ser.validated_data["secret"],
            is_active = ser.validated_data.get("is_active", True),
            events    = ser.validated_data.get("events", []),
        )
        _log(request, AuditLog.Action.CREATE, "WebhookEndpoint", endpoint.pk,
             {"url": endpoint.url})
        return Response(WebhookEndpointSerializer(endpoint).data, status=status.HTTP_201_CREATED)


class WebhookDeliveryListView(APIView):
    """
    GET /api/v1/integrations/webhooks/<pk>/deliveries/
    ADMIN only. Returns the 50 most recent delivery attempts for an endpoint.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        _require_admin(request)
        endpoint = get_object_or_404(WebhookEndpoint, pk=pk, tenant=request.user.tenant)
        deliveries = (
            WebhookDeliveryAttempt.objects
            .filter(endpoint=endpoint)
            .order_by("-created_at")[:50]
        )
        return Response(WebhookDeliverySerializer(deliveries, many=True).data)


class WebhookEndpointDetailView(APIView):
    """
    GET    /api/v1/integrations/webhooks/<pk>/  — retrieve
    PATCH  /api/v1/integrations/webhooks/<pk>/  — update
    DELETE /api/v1/integrations/webhooks/<pk>/  — delete
    """
    permission_classes = [IsAuthenticated]

    def _get_endpoint(self, request, pk):
        _require_admin(request)
        return get_object_or_404(WebhookEndpoint, pk=pk, tenant=request.user.tenant)

    def get(self, request, pk):
        endpoint = self._get_endpoint(request, pk)
        return Response(WebhookEndpointSerializer(endpoint).data)

    @transaction.atomic
    def patch(self, request, pk):
        endpoint = self._get_endpoint(request, pk)

        # If url is being changed, validate it first
        new_url = request.data.get("url", "").strip()
        if new_url and new_url != endpoint.url:
            _validate_webhook_url(new_url)

        ser = WebhookEndpointSerializer(endpoint, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)

        diff = {}
        update_fields = ["updated_at"]

        if "url" in ser.validated_data and ser.validated_data["url"] != endpoint.url:
            endpoint.url = ser.validated_data["url"]
            update_fields.append("url")
            diff["url"] = endpoint.url

        if "secret" in ser.validated_data:
            endpoint.secret = ser.validated_data["secret"]
            update_fields.append("secret")
            diff["secret"] = "***"

        if "is_active" in ser.validated_data:
            endpoint.is_active = ser.validated_data["is_active"]
            update_fields.append("is_active")
            diff["is_active"] = endpoint.is_active

        if "events" in ser.validated_data:
            endpoint.events = ser.validated_data["events"]
            update_fields.append("events")
            diff["events"] = endpoint.events

        endpoint.save(update_fields=update_fields)
        if diff:
            _log(request, AuditLog.Action.UPDATE, "WebhookEndpoint", endpoint.pk, diff)
        return Response(WebhookEndpointSerializer(endpoint).data)

    def delete(self, request, pk):
        endpoint = self._get_endpoint(request, pk)
        _log(request, AuditLog.Action.DELETE, "WebhookEndpoint", endpoint.pk,
             {"url": endpoint.url})
        endpoint.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
