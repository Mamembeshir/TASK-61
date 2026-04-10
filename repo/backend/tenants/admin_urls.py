from django.urls import path
from tenants.admin_views import (
    TenantListCreateView,
    TenantDetailView,
    TenantSiteListCreateView,
    TenantSiteDetailView,
)

urlpatterns = [
    path("",                                    TenantListCreateView.as_view(),    name="tenant-list-create"),
    path("<uuid:pk>/",                          TenantDetailView.as_view(),        name="tenant-detail"),
    path("<uuid:pk>/sites/",                    TenantSiteListCreateView.as_view(), name="tenant-site-list-create"),
    path("<uuid:pk>/sites/<uuid:site_pk>/",     TenantSiteDetailView.as_view(),    name="tenant-site-detail"),
]
