"""
iam/admin_views.py

Admin user-management API views.
All endpoints require IsAdmin permission (role=ADMIN, status=ACTIVE).
"""
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.generics import get_object_or_404

from core.exceptions import ConflictError, UnprocessableEntity
from core.models import AuditLog
from core.pagination import CursorPagination
from iam.models import User, UserProfile, UserSiteAssignment
from iam.permissions import IsAdmin
from iam.admin_serializers import (
    AdminUserListSerializer,
    AdminUserDetailSerializer,
    StatusTransitionSerializer,
    RoleAssignmentSerializer,
    ReviewPhotoSerializer,
    CreateCourierSerializer,
)
from tenants.models import Site


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_tenant_user(user_id, admin):
    """Return User scoped to admin's tenant, or 404."""
    return get_object_or_404(
        User.objects.select_related("profile", "tenant")
            .prefetch_related("site_assignments__site", "status_history"),
        pk=user_id,
        tenant=admin.tenant,
    )


def _audit(*, action, user, actor, request):
    AuditLog.objects.create(
        action=action,
        entity_type="User",
        entity_id=str(user.pk),
        actor_id=str(actor.pk),
        actor_username=actor.username,
        tenant_id=actor.tenant_id,
        ip_address=_client_ip(request),
        user_agent=request.META.get("HTTP_USER_AGENT", ""),
    )


def _client_ip(request):
    x_fwd = request.META.get("HTTP_X_FORWARDED_FOR")
    return x_fwd.split(",")[0].strip() if x_fwd else request.META.get("REMOTE_ADDR", "")


# ---------------------------------------------------------------------------
# GET /api/v1/admin/users/
# ---------------------------------------------------------------------------

class UserListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        qs = (
            User.objects
            .filter(tenant=request.user.tenant)
            .select_related("profile", "tenant")
            .prefetch_related("site_assignments__site")
            .order_by("created_at")
        )

        status_filter = request.query_params.get("status")
        role_filter   = request.query_params.get("role")
        search        = request.query_params.get("search", "").strip()

        if status_filter:
            qs = qs.filter(status=status_filter)
        if role_filter:
            qs = qs.filter(role=role_filter)
        if search:
            qs = qs.filter(username__icontains=search)

        paginator = CursorPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = AdminUserListSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


# ---------------------------------------------------------------------------
# GET /api/v1/admin/users/{id}/
# ---------------------------------------------------------------------------

class UserDetailView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, user_id):
        user = _get_tenant_user(user_id, request.user)
        return Response(AdminUserDetailSerializer(user).data)


# ---------------------------------------------------------------------------
# POST /api/v1/admin/users/{id}/transition/
# ---------------------------------------------------------------------------

class TransitionView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, user_id):
        target = _get_tenant_user(user_id, request.user)
        serializer = StatusTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data["new_status"]
        reason     = serializer.validated_data["reason"]

        # Photo-approval gate: PENDING_REVIEW → ACTIVE requires approved photo
        if (
            target.status == User.AccountStatus.PENDING_REVIEW
            and new_status == User.AccountStatus.ACTIVE
        ):
            profile = getattr(target, "profile", None)
            if not profile or profile.photo_id_review_status != UserProfile.PhotoIdStatus.APPROVED:
                raise UnprocessableEntity(
                    "Cannot activate this account: photo ID has not been approved yet."
                )

        try:
            target.transition_status(new_status, changed_by=request.user, reason=reason)
        except DjangoValidationError as exc:
            raise UnprocessableEntity(
                exc.messages[0] if exc.messages else str(exc)
            )

        _audit(action=AuditLog.Action.UPDATE, user=target, actor=request.user, request=request)
        if new_status == User.AccountStatus.ACTIVE:
            try:
                from integrations.webhook_utils import dispatch_webhook
                dispatch_webhook("user.activated", {"user_id": str(target.pk), "username": target.username, "role": target.role}, target.tenant)
            except Exception:
                pass
        return Response(AdminUserDetailSerializer(
            User.objects.prefetch_related("site_assignments__site", "status_history")
                .select_related("profile", "tenant")
                .get(pk=target.pk)
        ).data)


# ---------------------------------------------------------------------------
# POST /api/v1/admin/users/{id}/review-photo/
# ---------------------------------------------------------------------------

class ReviewPhotoView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, user_id):
        target = _get_tenant_user(user_id, request.user)
        serializer = ReviewPhotoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        profile = getattr(target, "profile", None)
        if not profile:
            raise UnprocessableEntity("This user has no profile / photo to review.")

        decision = serializer.validated_data["decision"]
        profile.photo_id_review_status = decision
        profile.save(update_fields=["photo_id_review_status", "updated_at"])

        action = (AuditLog.Action.APPROVE if decision == UserProfile.PhotoIdStatus.APPROVED
                  else AuditLog.Action.REJECT)
        _audit(action=action, user=target, actor=request.user, request=request)

        return Response(AdminUserDetailSerializer(
            User.objects.prefetch_related("site_assignments__site", "status_history")
                .select_related("profile", "tenant")
                .get(pk=target.pk)
        ).data)


# ---------------------------------------------------------------------------
# POST /api/v1/admin/users/{id}/assign-role/
# ---------------------------------------------------------------------------

class AssignRoleView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, user_id):
        if str(user_id) == str(request.user.pk):
            return Response(
                {"detail": "Cannot modify your own role assignment."},
                status=status.HTTP_403_FORBIDDEN,
            )

        target = _get_tenant_user(user_id, request.user)
        serializer = RoleAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_role = serializer.validated_data["role"]
        site_ids = serializer.validated_data["site_ids"]

        # Update role
        target.role = new_role
        User.objects.filter(pk=target.pk).update(role=new_role)

        # Replace site assignments
        UserSiteAssignment.objects.filter(user=target).delete()
        if site_ids:
            sites = Site.objects.filter(pk__in=site_ids, tenant=request.user.tenant)
            UserSiteAssignment.objects.bulk_create([
                UserSiteAssignment(user=target, site=site) for site in sites
            ])

        _audit(action=AuditLog.Action.UPDATE, user=target, actor=request.user, request=request)
        return Response(AdminUserDetailSerializer(
            User.objects.prefetch_related("site_assignments__site", "status_history")
                .select_related("profile", "tenant")
                .get(pk=target.pk)
        ).data)


# ---------------------------------------------------------------------------
# POST /api/v1/admin/users/{id}/unlock/
# ---------------------------------------------------------------------------

class UnlockView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, user_id):
        target = _get_tenant_user(user_id, request.user)
        target.record_successful_login()   # clears locked_until + failed_login_count
        _audit(action=AuditLog.Action.UPDATE, user=target, actor=request.user, request=request)
        return Response({"detail": "Account unlocked.", "is_locked": False})


# ---------------------------------------------------------------------------
# POST /api/v1/admin/users/create-courier/
# ---------------------------------------------------------------------------

class CreateCourierView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        serializer = CreateCourierSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data  = serializer.validated_data
        tenant = request.user.tenant

        # Uniqueness check
        if User.objects.filter(tenant=tenant, username=data["username"]).exists():
            raise ConflictError(
                f"Username '{data['username']}' is already registered for this tenant."
            )

        user = User.objects.create_user(
            username=data["username"],
            tenant=tenant,
            password=data["password"],
            role=User.Role.COURIER,
            status=User.AccountStatus.ACTIVE,
        )

        from iam.models import UserProfile as _UP
        profile = _UP.objects.create(
            user=user,
            tenant=tenant,
            legal_first_name=data["legal_first_name"],
            legal_last_name=data["legal_last_name"],
            employee_student_id=data["employee_student_id"],
            photo_id_review_status=_UP.PhotoIdStatus.APPROVED,
        )

        site_ids = data.get("site_ids", [])
        if site_ids:
            sites = Site.objects.filter(pk__in=site_ids, tenant=tenant)
            UserSiteAssignment.objects.bulk_create([
                UserSiteAssignment(user=user, site=site) for site in sites
            ])

        _audit(action=AuditLog.Action.CREATE, user=user, actor=request.user, request=request)
        return Response(
            AdminUserDetailSerializer(
                User.objects.prefetch_related("site_assignments__site", "status_history")
                    .select_related("profile", "tenant")
                    .get(pk=user.pk)
            ).data,
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# GET /api/v1/admin/sites/   (helper for role-assignment UI)
# ---------------------------------------------------------------------------

class SiteListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        sites = Site.objects.filter(tenant=request.user.tenant, is_active=True).values(
            "id", "name", "timezone"
        )
        return Response(list(sites))
