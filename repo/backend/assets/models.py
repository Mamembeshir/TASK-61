"""
assets/models.py

Asset Ledger: classification tree, versioned asset records, immutable history.

Design decisions:
- AssetClassification depth enforced at ≤ 3 levels via clean().
- Asset.fingerprint = SHA-256(site_id|asset_code.lower|name.lower|classification.code)
  Duplicate fingerprint within a tenant → 409 CONFLICT in the API layer.
- AssetVersion is append-only (immutable save/delete overrides, like AuditLog).
- version_number is per-asset, assigned inside SELECT FOR UPDATE to serialise
  concurrent version creation.
- Asset.current_version FK updated atomically with the new version record.
"""
import hashlib
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models, transaction


# ---------------------------------------------------------------------------
# AssetClassification
# ---------------------------------------------------------------------------

class AssetClassification(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.PROTECT,
        related_name="asset_classifications",
    )
    code = models.CharField(
        max_length=50,
        validators=[
            RegexValidator(
                r"^[A-Z0-9.]+$",
                "Code must be uppercase alphanumeric characters or dots.",
            )
        ],
    )
    name = models.CharField(max_length=200)
    parent = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="children",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "assets_classification"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "code"],
                name="uq_classification_tenant_code",
            )
        ]

    @property
    def level(self) -> int:
        """1-based depth computed by walking the parent chain (max 3)."""
        depth = 1
        parent_id = self.parent_id
        while parent_id is not None:
            depth += 1
            try:
                obj = AssetClassification.objects.only("parent_id").get(pk=parent_id)
                parent_id = obj.parent_id
            except AssetClassification.DoesNotExist:
                break
        return depth

    def clean(self):
        if self.level > 3:
            raise ValidationError("Classification depth cannot exceed 3 levels.")

    def __str__(self):
        return f"{self.code} — {self.name}"


# ---------------------------------------------------------------------------
# Asset
# ---------------------------------------------------------------------------

class Asset(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(
        "tenants.Site",
        on_delete=models.PROTECT,
        related_name="assets",
    )
    asset_code = models.CharField(
        max_length=50,
        validators=[
            RegexValidator(
                r"^[A-Z0-9\-]{3,50}$",
                r"Asset code must match ^[A-Z0-9\-]{3,50}$",
            )
        ],
    )
    name = models.CharField(max_length=200)
    classification = models.ForeignKey(
        AssetClassification,
        on_delete=models.PROTECT,
        related_name="assets",
    )
    # Forward reference — AssetVersion defined below; circular FK resolved by Django
    # migration framework (ALTER TABLE adds the FK after both tables exist).
    current_version = models.ForeignKey(
        "AssetVersion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="current_for_asset",
    )
    fingerprint = models.CharField(max_length=64, db_index=True)
    is_deleted = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "assets_asset"
        constraints = [
            models.UniqueConstraint(
                fields=["site", "asset_code"],
                name="uq_asset_site_code",
            )
        ]

    def __str__(self):
        return f"{self.asset_code} — {self.name}"

    def compute_fingerprint(self) -> str:
        """SHA-256 over the four identity fields (all normalised to lowercase)."""
        raw = "|".join([
            str(self.site_id),
            self.asset_code.lower(),
            self.name.lower(),
            self.classification.code,
        ])
        return hashlib.sha256(raw.encode()).hexdigest()

    @transaction.atomic
    def create_version(
        self,
        data: dict,
        source: str,
        user,
        note: str = "",
    ) -> "AssetVersion":
        """
        Append a new immutable AssetVersion, advance current_version, and
        recompute the fingerprint — all inside a single transaction with a
        SELECT FOR UPDATE row lock to serialise concurrent writers.
        """
        locked = (
            Asset.objects.select_for_update()
            .select_related("classification")
            .get(pk=self.pk)
        )

        last = (
            AssetVersion.objects.filter(asset_id=locked.pk)
            .order_by("-version_number")
            .first()
        )
        next_number = (last.version_number + 1) if last else 1

        version = AssetVersion.objects.create(
            asset=locked,
            version_number=next_number,
            data_snapshot=data,
            change_source=source,
            changed_by=user,
            note=note,
        )

        new_fp = locked.compute_fingerprint()
        Asset.objects.filter(pk=locked.pk).update(
            current_version_id=version.pk,
            fingerprint=new_fp,
        )
        # Reflect new state on self so callers see it without a re-fetch.
        self.current_version = version
        self.fingerprint = new_fp
        return version

    def get_version_at(self, dt) -> "AssetVersion | None":
        """Latest version whose created_at is ≤ the given datetime."""
        return (
            AssetVersion.objects.filter(asset_id=self.pk, created_at__lte=dt)
            .order_by("-created_at")
            .first()
        )


# ---------------------------------------------------------------------------
# AssetVersion  (immutable — no updates, no deletes)
# ---------------------------------------------------------------------------

class AssetVersion(models.Model):

    class ChangeSource(models.TextChoices):
        MANUAL      = "MANUAL",      "Manual"
        BULK_IMPORT = "BULK_IMPORT", "Bulk Import"
        CORRECTION  = "CORRECTION",  "Correction"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(
        Asset,
        on_delete=models.PROTECT,
        related_name="versions",
    )
    version_number = models.PositiveIntegerField()
    data_snapshot = models.JSONField(default=dict)
    change_source = models.CharField(
        max_length=20,
        choices=ChangeSource.choices,
        default=ChangeSource.MANUAL,
    )
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="asset_versions_created",
    )
    note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "assets_version"
        ordering = ["-version_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["asset", "version_number"],
                name="uq_asset_version_number",
            )
        ]

    def save(self, *args, **kwargs):
        if self.pk and AssetVersion.objects.filter(pk=self.pk).exists():
            raise PermissionError("AssetVersion records are immutable.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("AssetVersion records cannot be deleted.")

    def __str__(self):
        return f"{self.asset.asset_code} v{self.version_number}"


# ---------------------------------------------------------------------------
# BulkImportJob
# ---------------------------------------------------------------------------

class BulkImportJob(models.Model):

    class Status(models.TextChoices):
        PENDING        = "PENDING",        "Pending"
        PROCESSING     = "PROCESSING",     "Processing"
        PREVIEW_READY  = "PREVIEW_READY",  "Preview Ready"
        CONFIRMED      = "CONFIRMED",      "Confirmed"
        FAILED         = "FAILED",         "Failed"

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant      = models.ForeignKey(
        "tenants.Tenant", on_delete=models.PROTECT, related_name="import_jobs"
    )
    site        = models.ForeignKey(
        "tenants.Site", on_delete=models.PROTECT, related_name="import_jobs"
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="import_jobs",
    )
    file_path    = models.CharField(max_length=500)
    status       = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    total_rows   = models.IntegerField(null=True, blank=True)
    results_json = models.JSONField(null=True, blank=True)
    created_at   = models.DateTimeField(auto_now_add=True, db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "assets_bulk_import_job"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Import {self.pk} [{self.status}] by {self.uploaded_by_id}"
