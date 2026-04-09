"""
iam/backends.py

Custom authentication backend.
Looks up iam.User by username (scoped to a tenant when tenant_slug is provided).
Status and lockout checking happens in the login view so failures are recorded
before returning a response; the backend only validates credentials.
"""
from django.contrib.auth.backends import ModelBackend

from iam.models import User


class HarborOpsAuthBackend(ModelBackend):
    """
    Authenticates against iam.User.

    Lookup order:
      1. If tenant_slug is passed via kwargs, scope to that tenant.
      2. Otherwise look up globally (works when usernames happen to be unique
         in the test DB; clients should pass tenant_slug in production).

    Does NOT enforce status or lockout — the login view handles that so it can
    call record_failed_login() and return the right HTTP response.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        if not username or not password:
            return None

        tenant_slug = kwargs.get("tenant_slug")
        qs = User.objects.filter(username=username)
        if tenant_slug:
            qs = qs.filter(tenant__slug=tenant_slug)

        try:
            user = qs.get()
        except User.DoesNotExist:
            # Run hasher to mitigate timing attacks
            User().set_password(password)
            return None
        except User.MultipleObjectsReturned:
            # Ambiguous — caller must provide tenant_slug
            return None

        if user.check_password(password):
            return user

        return None

    def user_can_authenticate(self, user):
        """Allow Django admin login for superusers; status checks are in the view."""
        return getattr(user, "is_active", False)
