from django.urls import path
from assets.views import ClassificationListCreateView

urlpatterns = [
    path("", ClassificationListCreateView.as_view(), name="asset-classification-list"),
]
