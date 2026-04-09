"""
iam/permissions.py

Custom DRF permission classes for HarborOps.
"""
from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """
    Grants access only to authenticated users whose role is ADMIN
    and whose account status is ACTIVE.

    A suspended or deactivated admin still fails this check —
    AccountStatusMiddleware additionally gates the HTTP layer, but
    keeping the check here makes permissions self-documenting and
    testable in isolation.
    """
    message = "Administrator access required."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and getattr(user, "role", None) == "ADMIN"
            and getattr(user, "status", None) == "ACTIVE"
        )
