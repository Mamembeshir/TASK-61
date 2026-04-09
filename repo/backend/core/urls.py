from django.urls import path
from . import views

urlpatterns = [
    # Placeholder — health check
    path("health/", views.health_check, name="health-check"),
]
