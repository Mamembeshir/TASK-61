"""
iam/admin_serializers.py

Serializers for the admin user-management API.
"""
import re

from django.core.validators import RegexValidator
from rest_framework import serializers

from core.exceptions import ConflictError, UnprocessableEntity
from iam.models import User, UserProfile, UserSiteAssignment, AccountStatusHistory
from tenants.models import Site

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9._-]+$")
_SPECIAL_CHARS = set(r"""!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~""")


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _validate_password_strength(value: str) -> str:
    errors = []
    if len(value) < 10:
        errors.append("at least 10 characters")
    if not any(c.isupper() for c in value):
        errors.append("at least one uppercase letter")
    if not any(c.islower() for c in value):
        errors.append("at least one lowercase letter")
    if not any(c.isdigit() for c in value):
        errors.append("at least one digit")
    if not any(c in _SPECIAL_CHARS for c in value):
        errors.append("at least one special character")
    if errors:
        raise UnprocessableEntity(f"Password must contain: {', '.join(errors)}.")
    return value


# ---------------------------------------------------------------------------
# Status history (nested in detail)
# ---------------------------------------------------------------------------

class StatusHistorySerializer(serializers.ModelSerializer):
    changed_by_username = serializers.CharField(
        source="changed_by.username", default=None, allow_null=True
    )

    class Meta:
        model = AccountStatusHistory
        fields = ["id", "old_status", "new_status", "changed_by_username",
                  "reason", "timestamp"]


# ---------------------------------------------------------------------------
# List serializer
# ---------------------------------------------------------------------------

class AdminUserListSerializer(serializers.ModelSerializer):
    legal_name  = serializers.SerializerMethodField()
    site_names  = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "legal_name", "role", "status",
                  "created_at", "site_names"]

    def get_legal_name(self, user):
        p = getattr(user, "profile", None)
        if not p:
            return None
        return f"{p.legal_first_name} {p.legal_last_name}"

    def get_site_names(self, user):
        return [a.site.name for a in user.site_assignments.all()]


# ---------------------------------------------------------------------------
# Detail serializer
# ---------------------------------------------------------------------------

class AdminUserDetailSerializer(AdminUserListSerializer):
    status_history         = StatusHistorySerializer(many=True, read_only=True)
    photo_id_review_status = serializers.SerializerMethodField()
    photo_id_file_path     = serializers.SerializerMethodField()
    failed_login_count     = serializers.IntegerField(read_only=True)
    locked_until           = serializers.DateTimeField(read_only=True)
    is_locked              = serializers.SerializerMethodField()
    employee_student_id    = serializers.SerializerMethodField()

    class Meta(AdminUserListSerializer.Meta):
        fields = AdminUserListSerializer.Meta.fields + [
            "status_history", "photo_id_review_status", "photo_id_file_path",
            "failed_login_count", "locked_until", "is_locked", "employee_student_id",
        ]

    def get_photo_id_review_status(self, user):
        p = getattr(user, "profile", None)
        return p.photo_id_review_status if p else None

    def get_photo_id_file_path(self, user):
        p = getattr(user, "profile", None)
        return p.photo_id_file_path if p else None

    def get_is_locked(self, user):
        return user.is_locked

    def get_employee_student_id(self, user):
        p = getattr(user, "profile", None)
        return p.employee_student_id if p else None


# ---------------------------------------------------------------------------
# Status transition
# ---------------------------------------------------------------------------

class StatusTransitionSerializer(serializers.Serializer):
    new_status = serializers.ChoiceField(choices=User.AccountStatus.choices)
    reason     = serializers.CharField(min_length=10, max_length=1000)


# ---------------------------------------------------------------------------
# Role assignment
# ---------------------------------------------------------------------------

class RoleAssignmentSerializer(serializers.Serializer):
    role     = serializers.ChoiceField(choices=User.Role.choices)
    site_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=True,
        default=list,
    )

    def validate_site_ids(self, value):
        if not value:
            return value
        found = set(Site.objects.filter(pk__in=value).values_list("pk", flat=True))
        missing = [str(sid) for sid in value if sid not in found]
        if missing:
            raise serializers.ValidationError(f"Sites not found: {missing}")
        return value


# ---------------------------------------------------------------------------
# Photo review
# ---------------------------------------------------------------------------

class ReviewPhotoSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(
        choices=UserProfile.PhotoIdStatus.choices
    )


# ---------------------------------------------------------------------------
# Create courier
# ---------------------------------------------------------------------------

class CreateCourierSerializer(serializers.Serializer):
    username            = serializers.CharField(min_length=3, max_length=150)
    password            = serializers.CharField(max_length=128, write_only=True,
                                                style={"input_type": "password"})
    legal_first_name    = serializers.CharField(max_length=100)
    legal_last_name     = serializers.CharField(max_length=100)
    employee_student_id = serializers.CharField(max_length=50)
    site_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=True,
        default=list,
    )

    def validate_username(self, value):
        if not _USERNAME_RE.match(value):
            raise UnprocessableEntity(
                "Username may only contain letters, digits, '.', '_', or '-'."
            )
        return value

    def validate_password(self, value):
        return _validate_password_strength(value)

    def validate(self, attrs):
        # Uniqueness check is done in the view (we need request.user.tenant)
        return attrs
