"""
tenants/admin_views.py

Platform-level tenant management APIs.
All endpoints require superuser access (is_superuser=True, tenant=None).
All mutating operations are recorded in the audit log.
"""
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.audit import log_audit
from core.models import AuditLog
from core.pagination import paginate_list
from iam.permissions import IsSuperuser
from tenants.models import Site, Tenant
from tenants.serializers import SiteAdminSerializer, TenantSerializer


class TenantListCreateView(APIView):
    """
    GET  /api/v1/admin/tenants/   — list all tenants
    POST /api/v1/admin/tenants/   — create a tenant
    """
    permission_classes = [IsSuperuser]

    def get(self, request):
        tenants = Tenant.objects.all().order_by("name")
        return paginate_list(request, tenants, TenantSerializer, ordering="name")

    def post(self, request):
        ser = TenantSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        tenant = ser.save()
        log_audit(actor=request.user, action=AuditLog.Action.CREATE,
                  entity=tenant, request=request)
        return Response(TenantSerializer(tenant).data, status=status.HTTP_201_CREATED)


class TenantDetailView(APIView):
    """
    GET    /api/v1/admin/tenants/<id>/   — retrieve a tenant
    PATCH  /api/v1/admin/tenants/<id>/   — update name / slug / is_active
    DELETE /api/v1/admin/tenants/<id>/   — deactivate a tenant (soft delete)
    """
    permission_classes = [IsSuperuser]

    def get(self, request, pk):
        tenant = get_object_or_404(Tenant, pk=pk)
        return Response(TenantSerializer(tenant).data)

    def patch(self, request, pk):
        tenant = get_object_or_404(Tenant, pk=pk)
        before = {f: getattr(tenant, f) for f in ("name", "slug", "is_active")}
        ser = TenantSerializer(tenant, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        tenant = ser.save()
        after = {f: getattr(tenant, f) for f in ("name", "slug", "is_active")}
        diff = {f: [str(before[f]), str(after[f])] for f in before if before[f] != after[f]}
        log_audit(actor=request.user, action=AuditLog.Action.UPDATE,
                  entity=tenant, diff=diff, request=request)
        return Response(TenantSerializer(tenant).data)

    def delete(self, request, pk):
        tenant = get_object_or_404(Tenant, pk=pk)
        tenant.is_active = False
        tenant.save(update_fields=["is_active", "updated_at"])
        log_audit(actor=request.user, action=AuditLog.Action.DELETE,
                  entity=tenant, diff={"is_active": [True, False]}, request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TenantSiteListCreateView(APIView):
    """
    GET  /api/v1/admin/tenants/<id>/sites/   — list all sites for a tenant
    POST /api/v1/admin/tenants/<id>/sites/   — create a site under a tenant
    """
    permission_classes = [IsSuperuser]

    def get(self, request, pk):
        tenant = get_object_or_404(Tenant, pk=pk)
        sites = Site.objects.filter(tenant=tenant).order_by("name")
        return paginate_list(request, sites, SiteAdminSerializer, ordering="name")

    def post(self, request, pk):
        tenant = get_object_or_404(Tenant, pk=pk)
        data = {**request.data, "tenant": str(tenant.pk)}
        ser = SiteAdminSerializer(data=data)
        ser.is_valid(raise_exception=True)
        site = ser.save()
        log_audit(actor=request.user, action=AuditLog.Action.CREATE,
                  entity=site, request=request)
        return Response(SiteAdminSerializer(site).data, status=status.HTTP_201_CREATED)


class TenantSiteDetailView(APIView):
    """
    PATCH  /api/v1/admin/tenants/<id>/sites/<site_id>/   — update a site
    DELETE /api/v1/admin/tenants/<id>/sites/<site_id>/   — deactivate a site (soft delete)
    """
    permission_classes = [IsSuperuser]

    def patch(self, request, pk, site_pk):
        tenant = get_object_or_404(Tenant, pk=pk)
        site = get_object_or_404(Site, pk=site_pk, tenant=tenant)
        before = {f: getattr(site, f) for f in ("name", "address", "timezone", "is_active")}
        ser = SiteAdminSerializer(site, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        site = ser.save()
        after = {f: getattr(site, f) for f in ("name", "address", "timezone", "is_active")}
        diff = {f: [str(before[f]), str(after[f])] for f in before if before[f] != after[f]}
        log_audit(actor=request.user, action=AuditLog.Action.UPDATE,
                  entity=site, diff=diff, request=request)
        return Response(SiteAdminSerializer(site).data)

    def delete(self, request, pk, site_pk):
        tenant = get_object_or_404(Tenant, pk=pk)
        site = get_object_or_404(Site, pk=site_pk, tenant=tenant)
        site.is_active = False
        site.save(update_fields=["is_active", "updated_at"])
        log_audit(actor=request.user, action=AuditLog.Action.DELETE,
                  entity=site, diff={"is_active": [True, False]}, request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)
