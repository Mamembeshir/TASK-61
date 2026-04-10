from django.urls import path

from meetings.views import (
    MeetingListCreateView,
    MeetingDetailView,
    MeetingScheduleView,
    MeetingStartView,
    MeetingCompleteView,
    MeetingCancelView,
    AgendaItemListCreateView,
    AgendaItemDetailView,
    AttendanceListCreateView,
    MinuteRetrieveUpdateView,
    ResolutionListCreateView,
    ResolutionDetailView,
    TaskCreateView,
    MyTasksView,
    TaskUpdateView,
)

urlpatterns = [
    # Meeting CRUD
    path("meetings/",                                       MeetingListCreateView.as_view(),     name="meeting-list-create"),
    path("meetings/<uuid:pk>/",                             MeetingDetailView.as_view(),         name="meeting-detail"),

    # Meeting state transitions
    path("meetings/<uuid:pk>/schedule/",                    MeetingScheduleView.as_view(),       name="meeting-schedule"),
    path("meetings/<uuid:pk>/start/",                       MeetingStartView.as_view(),          name="meeting-start"),
    path("meetings/<uuid:pk>/complete/",                    MeetingCompleteView.as_view(),       name="meeting-complete"),
    path("meetings/<uuid:pk>/cancel/",                      MeetingCancelView.as_view(),         name="meeting-cancel"),

    # Agenda items
    path("meetings/<uuid:pk>/agenda/",                      AgendaItemListCreateView.as_view(),  name="agenda-list-create"),
    path("meetings/<uuid:pk>/agenda/<uuid:item_pk>/",       AgendaItemDetailView.as_view(),      name="agenda-detail"),

    # Attendance
    path("meetings/<uuid:pk>/attendance/",                  AttendanceListCreateView.as_view(),  name="attendance-list-create"),

    # Minutes
    path("meetings/<uuid:pk>/minutes/",                     MinuteRetrieveUpdateView.as_view(),  name="minutes-retrieve-update"),

    # Resolutions
    path("meetings/<uuid:pk>/resolutions/",                 ResolutionListCreateView.as_view(),  name="resolution-list-create"),
    path("resolutions/<uuid:pk>/",                          ResolutionDetailView.as_view(),      name="resolution-detail"),
    path("resolutions/<uuid:pk>/create-task/",              TaskCreateView.as_view(),            name="task-create"),

    # Tasks
    path("tasks/mine/",                                     MyTasksView.as_view(),               name="tasks-mine"),
    path("tasks/<uuid:pk>/",                                TaskUpdateView.as_view(),            name="task-update"),
]
