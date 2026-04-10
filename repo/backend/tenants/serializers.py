from rest_framework import serializers
from tenants.models import Tenant, Site


class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ["id", "name", "slug", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class SiteAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Site
        fields = ["id", "tenant", "name", "address", "timezone", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
