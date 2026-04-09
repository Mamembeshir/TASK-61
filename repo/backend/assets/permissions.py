from rest_framework.permissions import BasePermission


class IsNotCourier(BasePermission):
    """Deny access to users with the COURIER role on all asset endpoints."""

    message = "Couriers do not have access to asset endpoints."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and getattr(user, "role", None) != "COURIER"
        )
