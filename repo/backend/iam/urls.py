from django.urls import path
from iam.views import LoginView, LogoutView, MeView, RegisterView

urlpatterns = [
    path("login/",    LoginView.as_view(),    name="auth-login"),
    path("logout/",   LogoutView.as_view(),   name="auth-logout"),
    path("me/",       MeView.as_view(),       name="auth-me"),
    path("register/", RegisterView.as_view(), name="auth-register"),
]
