"""
tenants/admin_views.py

Platform-level tenant management APIs.
All endpoints require superuser access (is_superuser=True, tenant=None).
"""
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

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
        return Response(TenantSerializer(tenants, many=True).data)

    def post(self, request):
        ser = TenantSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        tenant = ser.save()
        return Response(TenantSerializer(tenant).data, status=status.HTTP_201_CREATED)


class TenantDetailView(APIView):
    """
    GET   /api/v1/admin/tenants/<id>/   — retrieve a tenant
    PATCH /api/v1/admin/tenants/<id>/   — update name / slug / is_active
    """
    permission_classes = [IsSuperuser]

    def get(self, request, pk):
        tenant = get_object_or_404(Tenant, pk=pk)
        return Response(TenantSerializer(tenant).data)

    def patch(self, request, pk):
        tenant = get_object_or_404(Tenant, pk=pk)
        ser = TenantSerializer(tenant, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        tenant = ser.save()
        return Response(TenantSerializer(tenant).data)


class TenantSiteListCreateView(APIView):
    """
    GET  /api/v1/admin/tenants/<id>/sites/   — list all sites for a tenant
    POST /api/v1/admin/tenants/<id>/sites/   — create a site under a tenant
    """
    permission_classes = [IsSuperuser]

    def get(self, request, pk):
        tenant = get_object_or_404(Tenant, pk=pk)
        sites = Site.objects.filter(tenant=tenant).order_by("name")
        return Response(SiteAdminSerializer(sites, many=True).data)

    def post(self, request, pk):
        tenant = get_object_or_404(Tenant, pk=pk)
        data = {**request.data, "tenant": str(tenant.pk)}
        ser = SiteAdminSerializer(data=data)
        ser.is_valid(raise_exception=True)
        site = ser.save()
        return Response(SiteAdminSerializer(site).data, status=status.HTTP_201_CREATED)


class TenantSiteDetailView(APIView):
    """
    PATCH /api/v1/admin/tenants/<id>/sites/<site_id>/   — update a site
    """
    permission_classes = [IsSuperuser]

    def patch(self, request, pk, site_pk):
        tenant = get_object_or_404(Tenant, pk=pk)
        site = get_object_or_404(Site, pk=site_pk, tenant=tenant)
        ser = SiteAdminSerializer(site, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        site = ser.save()
        return Response(SiteAdminSerializer(site).data)
