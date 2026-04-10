"""
API v1 URL aggregator — each app registers its own router here.
"""
from django.urls import path, include

urlpatterns = [
    path("auth/",         include("iam.urls")),
    path("admin/users/",  include("iam.admin_urls")),
    path("admin/sites/",  include("iam.admin_urls_sites")),
    path("tenants/",      include("tenants.urls")),
    path("assets/",              include("assets.urls")),
    path("asset-classifications/", include("assets.classification_urls")),
    path("foodservice/",  include("foodservice.urls")),
    path("meetings/",     include("meetings.urls")),
    path("courier/",      include("meetings.courier_urls")),
    path("analytics/",    include("analytics.urls")),
    path("integrations/", include("integrations.urls")),
    path("core/",         include("core.urls")),
]
