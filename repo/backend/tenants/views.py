"""
tenants/views.py

Tenant-scoped endpoints accessible to all authenticated users.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import serializers as drf_serializers

from core.pagination import paginate_list
from tenants.models import Site


class _SiteSerializer(drf_serializers.ModelSerializer):
    class Meta:
        model = Site
        fields = ["id", "name", "timezone"]


class SiteListView(APIView):
    """
    GET /api/v1/tenants/sites/

    Returns sites scoped to the requesting user:
      - ADMIN / STAFF_ALL: all active sites for the tenant
      - STAFF: only their assigned sites
      - COURIER: only their assigned sites
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from iam.models import UserSiteAssignment

        user = request.user

        if user.role == "ADMIN":
            qs = Site.objects.filter(tenant=user.tenant, is_active=True).order_by("name")
        else:
            assigned_ids = UserSiteAssignment.objects.filter(user=user).values_list("site_id", flat=True)
            qs = Site.objects.filter(pk__in=assigned_ids, is_active=True).order_by("name")

        return paginate_list(request, qs, _SiteSerializer)
