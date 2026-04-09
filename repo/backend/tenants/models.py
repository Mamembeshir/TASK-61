"""
tenants/models.py

Multi-tenant isolation layer.  Every operational table carries a tenant_id FK
so data never leaks across organizational boundaries.
"""
import uuid
from django.db import models


class Tenant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tenants_tenant"

    def __str__(self):
        return self.name


class Site(models.Model):
    """A physical location (campus, building) that belongs to a Tenant."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="sites"
    )
    name = models.CharField(max_length=255)
    address = models.TextField(blank=True, default="")
    # IANA timezone string, e.g. "America/New_York"
    timezone = models.CharField(max_length=64, default="America/New_York")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tenants_site"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "name"], name="uq_site_tenant_name"
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.tenant.slug})"
