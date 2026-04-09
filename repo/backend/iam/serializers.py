"""
iam/serializers.py

Auth-related serializers.
"""
import os
import re

from django.conf import settings
from rest_framework import serializers

from core.exceptions import ConflictError, UnprocessableEntity
from tenants.models import Tenant
from iam.models import User, UserProfile

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9._-]+$")
_ALLOWED_PHOTO_CONTENT_TYPES = {"image/jpeg", "image/png", "application/pdf"}
_ALLOWED_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}
_MAX_PHOTO_BYTES = 10 * 1024 * 1024  # 10 MB

_SPECIAL_CHARS = set(r"""!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~""")

# ---------------------------------------------------------------------------
# Password validator
# ---------------------------------------------------------------------------

def _validate_password_strength(value: str) -> str:
    """
    Enforce: min 10 chars, ≥1 uppercase, ≥1 lowercase, ≥1 digit, ≥1 special char.
    Raises UnprocessableEntity (422) on failure.
    """
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
        raise UnprocessableEntity(
            f"Password must contain: {', '.join(errors)}."
        )
    return value


# ---------------------------------------------------------------------------
# LoginSerializer
# ---------------------------------------------------------------------------

class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=128, write_only=True,
                                     style={"input_type": "password"})
    # Optional — scopes lookup to a specific tenant when provided
    tenant_slug = serializers.SlugField(required=False, allow_blank=True)


# ---------------------------------------------------------------------------
# RegisterSerializer
# ---------------------------------------------------------------------------

class RegisterSerializer(serializers.Serializer):
    # ---- User fields ----
    username = serializers.CharField(min_length=3, max_length=150)
    password = serializers.CharField(max_length=128, write_only=True,
                                     style={"input_type": "password"})
    tenant_slug = serializers.SlugField()

    # ---- Profile fields ----
    legal_first_name    = serializers.CharField(max_length=100)
    legal_last_name     = serializers.CharField(max_length=100)
    employee_student_id = serializers.CharField(max_length=50)

    # ---- Optional sensitive fields ----
    government_id = serializers.CharField(max_length=50, required=False,
                                          allow_blank=True, write_only=True)
    photo_id      = serializers.FileField(required=False, allow_null=True)

    # ------------------------------------------------------------------
    # Field-level validators
    # ------------------------------------------------------------------

    def validate_username(self, value):
        if not _USERNAME_RE.match(value):
            raise UnprocessableEntity(
                "Username may only contain letters, digits, '.', '_', or '-'."
            )
        return value

    def validate_password(self, value):
        return _validate_password_strength(value)

    def validate_photo_id(self, file):
        if file is None:
            return file
        # Content-type check
        content_type = getattr(file, "content_type", "") or ""
        ext = os.path.splitext(getattr(file, "name", ""))[1].lower()
        if content_type not in _ALLOWED_PHOTO_CONTENT_TYPES and ext not in _ALLOWED_PHOTO_EXTENSIONS:
            raise UnprocessableEntity(
                "Photo ID must be a JPEG, PNG, or PDF file."
            )
        # Size check
        size = getattr(file, "size", None)
        if size is not None and size > _MAX_PHOTO_BYTES:
            raise UnprocessableEntity("Photo ID must not exceed 10 MB.")
        return file

    def validate_tenant_slug(self, value):
        try:
            return Tenant.objects.get(slug=value, is_active=True)
        except Tenant.DoesNotExist:
            raise serializers.ValidationError("No active tenant with that slug.")

    def validate(self, attrs):
        tenant: Tenant = attrs["tenant_slug"]   # resolved to Tenant instance
        username = attrs["username"]

        # Per-tenant username uniqueness → 409
        if User.objects.filter(tenant=tenant, username=username).exists():
            raise ConflictError(
                f"Username '{username}' is already registered for this tenant."
            )

        employee_id = attrs.get("employee_student_id", "")
        if employee_id and UserProfile.objects.filter(
            tenant=tenant, employee_student_id=employee_id
        ).exists():
            raise ConflictError(
                f"Employee/student ID '{employee_id}' is already registered for this tenant."
            )

        return attrs

    def create(self, validated_data):
        from pathlib import Path

        tenant: Tenant = validated_data["tenant_slug"]

        user = User.objects.create_user(
            username=validated_data["username"],
            tenant=tenant,
            password=validated_data["password"],
            status=User.AccountStatus.PENDING_REVIEW,
            role=User.Role.STAFF,
        )

        profile = UserProfile(
            user=user,
            tenant=tenant,
            legal_first_name=validated_data["legal_first_name"],
            legal_last_name=validated_data["legal_last_name"],
            employee_student_id=validated_data["employee_student_id"],
        )

        # Encrypt government ID if provided
        gov_id = validated_data.get("government_id", "")
        if gov_id:
            profile.set_government_id(gov_id)

        # Save photo ID file
        photo_file = validated_data.get("photo_id")
        if photo_file:
            ext = os.path.splitext(getattr(photo_file, "name", ".jpg"))[1].lower() or ".jpg"
            photo_dir = Path(settings.UPLOAD_ROOT) / "photo_ids"
            photo_dir.mkdir(parents=True, exist_ok=True)
            photo_path = photo_dir / f"{user.pk}{ext}"
            with open(photo_path, "wb") as fh:
                for chunk in photo_file.chunks():
                    fh.write(chunk)
            profile.photo_id_file_path = str(photo_path)

        profile.save()
        return user


# ---------------------------------------------------------------------------
# UserProfileSerializer  (read-only — used for /me/ and /register/ response)
# ---------------------------------------------------------------------------

class UserProfileSerializer(serializers.Serializer):
    """
    Flat read-only representation of User + UserProfile.
    government_id is always returned as the pre-computed mask — never plaintext.
    """
    id          = serializers.UUIDField()
    username    = serializers.CharField()
    role        = serializers.CharField()
    status      = serializers.CharField()
    tenant_slug = serializers.SerializerMethodField()

    # Profile fields — None when no profile exists
    legal_first_name        = serializers.SerializerMethodField()
    legal_last_name         = serializers.SerializerMethodField()
    employee_student_id     = serializers.SerializerMethodField()
    government_id           = serializers.SerializerMethodField()   # always the mask
    photo_id_review_status  = serializers.SerializerMethodField()

    def _profile(self, user):
        return getattr(user, "profile", None)

    def get_tenant_slug(self, user):
        return user.tenant.slug if user.tenant_id else None

    def get_legal_first_name(self, user):
        p = self._profile(user)
        return p.legal_first_name if p else None

    def get_legal_last_name(self, user):
        p = self._profile(user)
        return p.legal_last_name if p else None

    def get_employee_student_id(self, user):
        p = self._profile(user)
        return p.employee_student_id if p else None

    def get_government_id(self, user):
        """Always returns the pre-computed mask, never the plaintext."""
        p = self._profile(user)
        return p.government_id_mask if p else None

    def get_photo_id_review_status(self, user):
        p = self._profile(user)
        return p.photo_id_review_status if p else None
