from django.urls import path
from meetings.courier_views import CourierTaskListView, CourierTaskConfirmView

urlpatterns = [
    path("tasks/",                   CourierTaskListView.as_view(),   name="courier-tasks"),
    path("tasks/<uuid:pk>/confirm/", CourierTaskConfirmView.as_view(), name="courier-task-confirm"),
]
