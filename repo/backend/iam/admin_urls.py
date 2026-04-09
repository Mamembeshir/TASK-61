from django.urls import path
from iam.admin_views import (
    UserListView,
    UserDetailView,
    TransitionView,
    ReviewPhotoView,
    AssignRoleView,
    UnlockView,
    CreateCourierView,
    SiteListView,
)

urlpatterns = [
    # Collection
    path("",                       UserListView.as_view(),    name="admin-user-list"),
    path("create-courier/",        CreateCourierView.as_view(), name="admin-create-courier"),

    # Member
    path("<uuid:user_id>/",            UserDetailView.as_view(),  name="admin-user-detail"),
    path("<uuid:user_id>/transition/", TransitionView.as_view(),  name="admin-transition"),
    path("<uuid:user_id>/review-photo/", ReviewPhotoView.as_view(), name="admin-review-photo"),
    path("<uuid:user_id>/assign-role/", AssignRoleView.as_view(),  name="admin-assign-role"),
    path("<uuid:user_id>/unlock/",      UnlockView.as_view(),      name="admin-unlock"),
]
