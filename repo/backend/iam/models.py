"""
iam/models.py

Identity & Access Management models.

Key design decisions (see questions.md §1, §2, §9.2):
- Users are scoped to exactly one Tenant via FK; username uniqueness is per-tenant.
- Superusers (Django admin) have tenant=NULL and bypass tenant scoping.
- DEACTIVATED is a terminal state; no transitions out (questions.md §1.6).
- Lockout timer is absolute: set once at the 5th failure, never extended by
  subsequent attempts during lockout (questions.md §2.1).
- government_id_encrypted stores AES-256-GCM ciphertext as raw bytes in
  BinaryField; encrypt_field/decrypt_field are used for the round-trip.
- employee_student_id uniqueness is enforced per-tenant via a UniqueConstraint
  on (tenant, employee_student_id) denormalised onto UserProfile.
"""
import uuid
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


# ---------------------------------------------------------------------------
# Account status state machine
# ---------------------------------------------------------------------------
# Maps each status to the set of statuses it may legally transition into.
# DEACTIVATED maps to the empty set — it is terminal.
_VALID_TRANSITIONS: dict[str, set[str]] = {
    "PENDING_REVIEW": {"ACTIVE", "DEACTIVATED"},
    "ACTIVE":         {"SUSPENDED", "DEACTIVATED"},
    "SUSPENDED":      {"ACTIVE", "DEACTIVATED"},
    "DEACTIVATED":    set(),
}


# ---------------------------------------------------------------------------
# UserManager
# ---------------------------------------------------------------------------

class UserManager(BaseUserManager):
    """Custom manager; all queries are unfiltered — callers scope by tenant."""

    def create_user(self, username: str, tenant, password: str = None, **extra_fields):
        if not username:
            raise ValueError("Username is required.")
        if tenant is None:
            raise ValueError("Tenant is required for non-superuser accounts.")
        user = self.model(username=username, tenant=tenant, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username: str, password: str = None, **extra_fields):
        """Creates a Django-admin superuser with no tenant."""
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", User.Role.ADMIN)
        extra_fields.setdefault("status", User.AccountStatus.ACTIVE)
        user = self.model(username=username, tenant=None, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class User(AbstractBaseUser, PermissionsMixin):
    """
    Central identity record.  One record per person per tenant.
    Extends Django's AbstractBaseUser so we retain PBKDF2-SHA256 hashing.
    """

    class Role(models.TextChoices):
        ADMIN   = "ADMIN",   "Administrator"
        STAFF   = "STAFF",   "Staff"
        COURIER = "COURIER", "Courier"

    class AccountStatus(models.TextChoices):
        PENDING_REVIEW = "PENDING_REVIEW", "Pending Review"
        ACTIVE         = "ACTIVE",         "Active"
        SUSPENDED      = "SUSPENDED",      "Suspended"
        DEACTIVATED    = "DEACTIVATED",    "Deactivated"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.PROTECT,
        null=True,   # NULL only for Django-admin superusers
        blank=True,
        related_name="users",
    )
    username = models.CharField(max_length=150)
    role = models.CharField(
        max_length=20, choices=Role.choices, default=Role.STAFF
    )
    status = models.CharField(
        max_length=20,
        choices=AccountStatus.choices,
        default=AccountStatus.PENDING_REVIEW,
    )

    # Django built-ins required by AbstractBaseUser / admin
    is_staff = models.BooleanField(default=False)   # access to /admin/
    is_active = models.BooleanField(default=True)   # must stay True for login to work;
                                                    # use `status` for business-logic gating

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Lockout tracking
    failed_login_count = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = []  # only username + password needed for createsuperuser

    class Meta:
        db_table = "iam_user"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "username"],
                name="uq_user_tenant_username",
            )
        ]

    def __str__(self):
        return f"{self.username} [{self.role}] ({self.status})"

    # ------------------------------------------------------------------
    # Lockout helpers
    # ------------------------------------------------------------------

    @property
    def is_locked(self) -> bool:
        """True when the account is inside an active lockout window."""
        if self.locked_until is None:
            return False
        return timezone.now() < self.locked_until

    def record_failed_login(self) -> None:
        """
        Increment the failed-login counter and lock the account after
        LOGIN_MAX_ATTEMPTS failures.

        Per questions.md §2.1:
        - Attempts made DURING an active lockout do NOT increment the counter
          and do NOT extend the locked_until timestamp.
        - The lock timer is absolute: it is set once and never moved forward.
        """
        if self.is_locked:
            # Silent no-op during lockout — do not extend, do not count.
            return

        self.failed_login_count += 1
        max_attempts = getattr(settings, "LOGIN_MAX_ATTEMPTS", 5)
        lockout_minutes = getattr(settings, "LOGIN_LOCKOUT_MINUTES", 15)

        if self.failed_login_count >= max_attempts:
            self.locked_until = timezone.now() + timedelta(minutes=lockout_minutes)

        User.objects.filter(pk=self.pk).update(
            failed_login_count=self.failed_login_count,
            locked_until=self.locked_until,
        )

    def record_successful_login(self) -> None:
        """Reset counter and clear lockout after a successful authentication."""
        self.failed_login_count = 0
        self.locked_until = None
        User.objects.filter(pk=self.pk).update(
            failed_login_count=0,
            locked_until=None,
        )

    # ------------------------------------------------------------------
    # Status state machine
    # ------------------------------------------------------------------

    def transition_status(
        self,
        new_status: str,
        changed_by: "User",
        reason: str,
    ) -> None:
        """
        Move this account to new_status, enforcing the state machine from
        PRD §10.1.  Creates an AccountStatusHistory record on success.

        Raises ValidationError for invalid transitions.
        DEACTIVATED is terminal — no exit transitions are permitted (questions.md §1.6).
        """
        current = self.status
        allowed = _VALID_TRANSITIONS.get(current, set())

        if new_status not in _VALID_TRANSITIONS:
            raise ValidationError(
                f"'{new_status}' is not a valid account status."
            )

        if new_status not in allowed:
            raise ValidationError(
                f"Cannot transition from {current} to {new_status}. "
                f"Allowed targets: {sorted(allowed) or 'none (terminal state)'}."
            )

        if not reason or not reason.strip():
            raise ValidationError("A reason is required for every status transition.")

        old_status = self.status
        self.status = new_status
        User.objects.filter(pk=self.pk).update(status=new_status)

        AccountStatusHistory.objects.create(
            user=self,
            old_status=old_status,
            new_status=new_status,
            changed_by=changed_by,
            reason=reason.strip(),
        )


# ---------------------------------------------------------------------------
# UserProfile
# ---------------------------------------------------------------------------

class UserProfile(models.Model):
    """
    Extended onboarding data for a User.
    Created automatically during registration; admin reviews photo_id.

    Encryption approach:
    - government_id_encrypted (BinaryField): stores raw AES-256-GCM bytes
      (nonce || ciphertext || tag) via core.encryption.encrypt_field encoded
      as ASCII bytes.
    - government_id_mask: pre-computed masked display string (last 4 chars).
    - Use set_government_id(plaintext) to write, get_government_id() to read.
    """

    class PhotoIdStatus(models.TextChoices):
        PENDING  = "PENDING",  "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    user = models.OneToOneField(
        User, on_delete=models.CASCADE, primary_key=True, related_name="profile"
    )
    # Denormalised for DB-level uniqueness enforcement
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.PROTECT,
        related_name="user_profiles",
    )

    legal_first_name = models.CharField(max_length=100)
    legal_last_name  = models.CharField(max_length=100)

    employee_student_id = models.CharField(max_length=50)

    # BinaryField stores raw encrypted bytes (ASCII b64 string encoded to bytes)
    government_id_encrypted = models.BinaryField(null=True, blank=True)
    # Pre-computed mask — shown in UI, never re-derived on-the-fly
    government_id_mask = models.CharField(max_length=50, blank=True, default="")

    photo_id_file_path   = models.CharField(max_length=500, blank=True, default="")
    photo_id_review_status = models.CharField(
        max_length=10,
        choices=PhotoIdStatus.choices,
        default=PhotoIdStatus.PENDING,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "iam_user_profile"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "employee_student_id"],
                name="uq_profile_tenant_employee_id",
            )
        ]

    def __str__(self):
        return f"{self.legal_first_name} {self.legal_last_name} ({self.user.username})"

    # ------------------------------------------------------------------
    # Government ID helpers
    # ------------------------------------------------------------------

    def set_government_id(self, plaintext: str) -> None:
        """
        Encrypt plaintext and store as raw bytes in government_id_encrypted.
        Also writes the masked display string.
        Never persists the plaintext.
        """
        from core.encryption import encrypt_field, mask_value

        if not plaintext:
            self.government_id_encrypted = None
            self.government_id_mask = ""
            return

        b64_str = encrypt_field(plaintext)
        self.government_id_encrypted = b64_str.encode("ascii")
        self.government_id_mask = mask_value(plaintext)

    def get_government_id(self) -> str | None:
        """Decrypt and return the government ID plaintext, or None if unset."""
        from core.encryption import decrypt_field

        if not self.government_id_encrypted:
            return None

        b64_str = bytes(self.government_id_encrypted).decode("ascii")
        return decrypt_field(b64_str)

    def save(self, *args, **kwargs):
        # Keep tenant in sync with the linked user (defensive)
        if self.user_id and not self.tenant_id:
            self.tenant = self.user.tenant
        super().save(*args, **kwargs)


# ---------------------------------------------------------------------------
# UserSiteAssignment
# ---------------------------------------------------------------------------

class UserSiteAssignment(models.Model):
    """
    Maps which Site(s) a User is authorised to operate in.
    Staff see only data for their assigned sites.
    Couriers can be assigned multiple sites (pickup / drop across sites).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="site_assignments"
    )
    site = models.ForeignKey(
        "tenants.Site", on_delete=models.CASCADE, related_name="user_assignments"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "iam_user_site_assignment"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "site"],
                name="uq_user_site_assignment",
            )
        ]

    def __str__(self):
        return f"{self.user.username} → {self.site.name}"


# ---------------------------------------------------------------------------
# AccountStatusHistory
# ---------------------------------------------------------------------------

class AccountStatusHistory(models.Model):
    """
    Immutable audit trail of every account status change.
    Created only by User.transition_status(); never updated or deleted.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="status_history"
    )
    old_status = models.CharField(max_length=20, choices=User.AccountStatus.choices)
    new_status = models.CharField(max_length=20, choices=User.AccountStatus.choices)
    changed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="status_changes_made",
    )
    reason = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "iam_account_status_history"
        ordering = ["-timestamp"]

    def save(self, *args, **kwargs):
        if self.pk and AccountStatusHistory.objects.filter(pk=self.pk).exists():
            raise PermissionError("AccountStatusHistory records are immutable.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("AccountStatusHistory records cannot be deleted.")

    def __str__(self):
        return (
            f"{self.user.username}: {self.old_status} → {self.new_status} "
            f"at {self.timestamp:%Y-%m-%d %H:%M:%S}"
        )
