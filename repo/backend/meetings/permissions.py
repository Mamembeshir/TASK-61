from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied


class IsNotCourier(IsAuthenticated):
    """Block COURIER role from all meeting endpoints."""
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        if request.user.role == "COURIER":
            raise PermissionDenied("Couriers do not have access to meetings.")
        return True
