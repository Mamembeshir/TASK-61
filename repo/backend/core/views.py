import logging

from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import AuditLog
from core.pagination import paginate_list


class _AuditLogSerializer(serializers.ModelSerializer):
    id        = serializers.UUIDField()
    timestamp = serializers.DateTimeField()

    class Meta:
        model  = AuditLog
        fields = ["id", "entity_type", "entity_id", "action", "actor_username", "timestamp"]

logger = logging.getLogger(__name__)


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    """
    Liveness + readiness probe.

    Returns 200 with status of each subsystem.
    Returns 503 if any required subsystem is down.
    """
    from django.utils import timezone

    checks = {}
    overall_ok = True

    # Database
    try:
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        checks["database"] = "ok"
    except Exception as exc:  # noqa: BLE001
        logger.error("Health check: database probe failed", exc_info=exc)
        checks["database"] = "error"
        overall_ok = False

    # Redis
    try:
        import django.conf as conf
        redis_url = getattr(conf.settings, "REDIS_URL", None)
        if redis_url:
            import redis as redis_lib
            r = redis_lib.from_url(redis_url, socket_connect_timeout=1)
            r.ping()
            checks["redis"] = "ok"
        else:
            checks["redis"] = "not configured"
    except Exception:  # noqa: BLE001
        checks["redis"] = "unavailable"
        # Redis is optional — don't mark overall as failed

    payload = {
        "status": "ok" if overall_ok else "degraded",
        "timestamp": timezone.now().isoformat(),
        **checks,
    }
    status_code = 200 if overall_ok else 503
    return Response(payload, status=status_code)


class AuditLogListView(APIView):
    """
    GET /api/v1/core/audit-log/
    Returns paginated AuditLog entries scoped to the current user's tenant,
    newest first. COURIER role is excluded (403).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from rest_framework.exceptions import PermissionDenied
        if request.user.role == "COURIER":
            raise PermissionDenied("Couriers cannot access audit logs.")

        qs = (
            AuditLog.objects
            .filter(tenant_id=request.user.tenant_id)
            .order_by("-timestamp")
        )
        return paginate_list(request, qs, _AuditLogSerializer, ordering="-timestamp")
