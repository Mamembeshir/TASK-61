"""
iam/views.py

Auth endpoints:
  POST /api/v1/auth/register/   — create PENDING_REVIEW account
  POST /api/v1/auth/login/      — exchange credentials for session + token
  POST /api/v1/auth/logout/     — destroy session + token
  GET  /api/v1/auth/me/         — return current user profile

Status code contract (questions.md §2, PRD §9.2):
  201  — registration success
  200  — login success, logout, me
  401  — wrong password
  403  — account locked, inactive (PENDING_REVIEW / SUSPENDED / DEACTIVATED)
  409  — duplicate username / employee_id (same tenant)
  422  — password strength / file-type / file-size validation failure
"""
from django.contrib.auth import login as django_login, logout as django_logout
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.authtoken.models import Token

from core.models import AuditLog
from iam.models import User
from iam.serializers import LoginSerializer, RegisterSerializer, UserProfileSerializer


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _client_ip(request) -> str:
    x_fwd = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_fwd:
        return x_fwd.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def _audit(*, action, entity_type, entity_id, actor=None, tenant_id=None,
           diff=None, request=None):
    AuditLog.objects.create(
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        actor_id=str(actor.pk) if actor else None,
        actor_username=actor.username if actor else None,
        tenant_id=tenant_id,
        diff_json=diff,
        ip_address=_client_ip(request) if request else None,
        user_agent=(request.META.get("HTTP_USER_AGENT", "") if request else None),
    )


# ---------------------------------------------------------------------------
# POST /api/v1/auth/register/
# ---------------------------------------------------------------------------

class RegisterView(APIView):
    """
    Creates a PENDING_REVIEW / STAFF user + UserProfile.
    Supports Idempotency-Key header (handled by IdempotencyMiddleware).
    Returns 201 with masked profile on first registration.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        _audit(
            action=AuditLog.Action.CREATE,
            entity_type="User",
            entity_id=user.pk,
            tenant_id=user.tenant_id,
            request=request,
        )

        return Response(
            UserProfileSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# POST /api/v1/auth/login/
# ---------------------------------------------------------------------------

class LoginView(APIView):
    """
    Authenticate with username + password.

    Check order (per questions.md §2.1):
      1. Lockout   → 403
      2. Status    → 403 (must be ACTIVE)
      3. Password  → 401 + record_failed_login
      4. Success   → 200 + session cookie + token
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        username = data["username"]
        password = data["password"]
        tenant_slug = data.get("tenant_slug") or None

        # ------------------------------------------------------------------
        # User lookup
        # ------------------------------------------------------------------
        qs = User.objects.filter(username=username)
        if tenant_slug:
            qs = qs.filter(tenant__slug=tenant_slug)

        try:
            user = qs.get()
        except User.DoesNotExist:
            User().set_password(password)   # timing-safe
            return Response({"detail": "Invalid credentials."},
                            status=status.HTTP_401_UNAUTHORIZED)
        except User.MultipleObjectsReturned:
            return Response(
                {"detail": "Multiple accounts share that username. Please provide tenant_slug."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # ------------------------------------------------------------------
        # 1. Lockout check
        # ------------------------------------------------------------------
        if user.is_locked:
            _audit(action=AuditLog.Action.LOGIN_FAILED, entity_type="User",
                   entity_id=user.pk, tenant_id=user.tenant_id, request=request,
                   diff={"reason": "locked"})
            return Response({"detail": "Account is temporarily locked. Try again later."},
                            status=status.HTTP_403_FORBIDDEN)

        # ------------------------------------------------------------------
        # 2. Status check (must be ACTIVE)
        # ------------------------------------------------------------------
        if user.status != User.AccountStatus.ACTIVE:
            _audit(action=AuditLog.Action.LOGIN_FAILED, entity_type="User",
                   entity_id=user.pk, tenant_id=user.tenant_id, request=request,
                   diff={"reason": f"status={user.status}"})
            return Response({"detail": "Account is not active."},
                            status=status.HTTP_403_FORBIDDEN)

        # ------------------------------------------------------------------
        # 3. Password check
        # ------------------------------------------------------------------
        if not user.check_password(password):
            user.record_failed_login()
            _audit(action=AuditLog.Action.LOGIN_FAILED, entity_type="User",
                   entity_id=user.pk, tenant_id=user.tenant_id, request=request,
                   diff={"reason": "wrong_password",
                         "failed_count": user.failed_login_count})
            return Response({"detail": "Invalid credentials."},
                            status=status.HTTP_401_UNAUTHORIZED)

        # ------------------------------------------------------------------
        # 4. Success
        # ------------------------------------------------------------------
        user.record_successful_login()

        # Create session (sets sessionid cookie)
        django_login(request._request, user,
                     backend="iam.backends.HarborOpsAuthBackend")

        # Issue / reuse DRF token
        token, _ = Token.objects.get_or_create(user=user)

        _audit(action=AuditLog.Action.LOGIN, entity_type="User",
               entity_id=user.pk, actor=user, tenant_id=user.tenant_id,
               request=request)

        return Response(
            {"token": token.key, "profile": UserProfileSerializer(user).data},
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# POST /api/v1/auth/logout/
# ---------------------------------------------------------------------------

class LogoutView(APIView):
    """Destroys the session and deletes the auth token."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        _audit(action=AuditLog.Action.LOGOUT, entity_type="User",
               entity_id=user.pk, actor=user, tenant_id=user.tenant_id,
               request=request)

        # Delete token
        try:
            user.auth_token.delete()
        except Token.DoesNotExist:
            pass

        # Destroy session
        django_logout(request._request)

        return Response({"detail": "Logged out successfully."},
                        status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# GET /api/v1/auth/me/
# ---------------------------------------------------------------------------

class MeView(APIView):
    """Return the authenticated user's full profile."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(
            UserProfileSerializer(request.user).data,
            status=status.HTTP_200_OK,
        )
