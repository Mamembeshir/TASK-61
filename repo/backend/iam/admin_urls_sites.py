from django.urls import path
from iam.admin_views import SiteListView

urlpatterns = [
    path("", SiteListView.as_view(), name="admin-site-list"),
]
