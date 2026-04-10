"""
meetings/courier_views.py

Courier-only endpoints.

  GET  /api/v1/courier/tasks/          — list delivery tasks for this courier
  POST /api/v1/courier/tasks/<pk>/confirm/ — one-time confirm of a delivery
"""
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from django.shortcuts import get_object_or_404

from core.exceptions import UnprocessableEntity
from core.models import AuditLog
from core.pagination import paginate_list
from meetings.models import Task
from meetings.serializers import CourierTaskSerializer


def _require_courier(request):
    if request.user.role != "COURIER":
        raise PermissionDenied("Only COURIER users can access this endpoint.")


def _get_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR", "")


# ---------------------------------------------------------------------------
# GET /api/v1/courier/tasks/
# ---------------------------------------------------------------------------

class CourierTaskListView(APIView):
    """
    Return all delivery tasks assigned to the authenticated COURIER.

    Filtered to tasks where:
      - assignee = request.user
      - delivery_type IS NOT NULL / non-empty
      - pickup_location or drop_location is at one of the courier's assigned sites
        (per questions.md 6.3 — we surface all delivery tasks for now; the
        pickup/drop location text already encodes the site context).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _require_courier(request)

        qs = (
            Task.objects
            .filter(assignee=request.user, delivery_type__isnull=False)
            .exclude(delivery_type="")
            .order_by("-created_at")
        )

        return paginate_list(request, qs, CourierTaskSerializer, ordering="-created_at")


# ---------------------------------------------------------------------------
# POST /api/v1/courier/tasks/<pk>/confirm/
# ---------------------------------------------------------------------------

class CourierTaskConfirmView(APIView):
    """
    One-time confirmation of a delivery task.
    Sets confirmed_at = now.  Returns 422 if already confirmed.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        _require_courier(request)

        task = get_object_or_404(
            Task,
            pk=pk,
            assignee=request.user,
        )

        if not task.delivery_type:
            raise UnprocessableEntity("This task is not a delivery task.")

        if task.confirmed_at is not None:
            raise UnprocessableEntity("This delivery has already been confirmed.")

        task.confirmed_at = timezone.now()
        task.save(update_fields=["confirmed_at", "updated_at"])

        AuditLog.objects.create(
            tenant_id=request.user.tenant_id,
            entity_type="Task",
            entity_id=str(task.pk),
            action=AuditLog.Action.UPDATE,
            actor_id=str(request.user.pk),
            actor_username=request.user.username,
            diff_json={"confirmed_at": str(task.confirmed_at)},
            ip_address=_get_ip(request),
        )

        return Response(CourierTaskSerializer(task).data, status=status.HTTP_200_OK)
