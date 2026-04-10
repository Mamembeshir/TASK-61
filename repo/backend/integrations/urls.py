from django.urls import path

from integrations.views import (
    AlertListView,
    AlertAcknowledgeView,
    AlertAssignView,
    AlertCloseView,
    WebhookEndpointListCreateView,
    WebhookEndpointDetailView,
    WebhookDeliveryListView,
)

urlpatterns = [
    # Alert endpoints
    path("alerts/",                              AlertListView.as_view(),               name="alert-list"),
    path("alerts/<uuid:pk>/acknowledge/",        AlertAcknowledgeView.as_view(),        name="alert-acknowledge"),
    path("alerts/<uuid:pk>/assign/",             AlertAssignView.as_view(),             name="alert-assign"),
    path("alerts/<uuid:pk>/close/",              AlertCloseView.as_view(),              name="alert-close"),

    # Webhook endpoint management
    path("webhooks/",                            WebhookEndpointListCreateView.as_view(), name="webhook-list-create"),
    path("webhooks/<uuid:pk>/",                  WebhookEndpointDetailView.as_view(),     name="webhook-detail"),
    path("webhooks/<uuid:pk>/deliveries/",       WebhookDeliveryListView.as_view(),       name="webhook-deliveries"),
]
