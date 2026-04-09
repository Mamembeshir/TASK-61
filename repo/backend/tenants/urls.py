from django.urls import path
from tenants.views import SiteListView

urlpatterns = [
    path("sites/", SiteListView.as_view(), name="site-list"),
]
