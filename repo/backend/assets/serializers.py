"""
assets/serializers.py

All serializers for the Asset Ledger API.

Validation conventions:
- Asset code regex / length failures  → 422 UnprocessableEntity
- Classification depth > 3            → 422 UnprocessableEntity
- Duplicate fingerprint / stale version → raised in the view layer as 409
- Resource not found (FK lookup)      → 400 ValidationError (field error)
"""
import re

from rest_framework import serializers

from core.exceptions import UnprocessableEntity
from assets.models import Asset, AssetClassification, AssetVersion

_ASSET_CODE_RE = re.compile(r"^[A-Z0-9\-]{3,50}$")


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

class AssetClassificationSerializer(serializers.ModelSerializer):
    level    = serializers.IntegerField(read_only=True)
    children = serializers.SerializerMethodField()

    class Meta:
        model  = AssetClassification
        fields = ["id", "code", "name", "level", "parent", "is_active", "children"]

    def get_children(self, obj):
        qs = obj.children.filter(is_active=True).prefetch_related("children")
        return AssetClassificationSerializer(qs, many=True).data


class AssetClassificationCreateSerializer(serializers.Serializer):
    code   = serializers.CharField(max_length=50)
    name   = serializers.CharField(max_length=200)
    parent = serializers.UUIDField(required=False, allow_null=True)

    def validate_code(self, value):
        if not re.match(r"^[A-Z0-9.]+$", value):
            raise UnprocessableEntity(
                "Classification code must be uppercase alphanumeric characters or dots."
            )
        return value

    def validate(self, data):
        request = self.context["request"]
        tenant  = request.user.tenant

        # Resolve parent FK
        parent_id = data.pop("parent", None)
        parent_obj = None
        if parent_id:
            parent_obj = AssetClassification.objects.filter(
                pk=parent_id, tenant=tenant, is_active=True
            ).first()
            if not parent_obj:
                raise serializers.ValidationError({"parent": "Parent classification not found."})

        # Check depth: if parent exists, new node level = parent.level + 1
        if parent_obj and parent_obj.level >= 3:
            raise UnprocessableEntity(
                "Classification depth cannot exceed 3 levels."
            )

        data["parent"] = parent_obj
        data["tenant"] = tenant
        return data


# ---------------------------------------------------------------------------
# Version
# ---------------------------------------------------------------------------

class AssetVersionSerializer(serializers.ModelSerializer):
    changed_by_username = serializers.CharField(
        source="changed_by.username", read_only=True, default=None
    )

    class Meta:
        model  = AssetVersion
        fields = [
            "id",
            "version_number",
            "data_snapshot",
            "change_source",
            "changed_by_username",
            "note",
            "created_at",
        ]


# ---------------------------------------------------------------------------
# Asset — list
# ---------------------------------------------------------------------------

class AssetListSerializer(serializers.ModelSerializer):
    classification_name    = serializers.CharField(source="classification.name", read_only=True)
    site_name              = serializers.CharField(source="site.name", read_only=True)
    current_version_number = serializers.IntegerField(
        source="current_version.version_number", read_only=True, default=None
    )
    updated_at = serializers.DateTimeField(
        source="current_version.created_at", read_only=True, default=None
    )

    class Meta:
        model  = Asset
        fields = [
            "id",
            "asset_code",
            "name",
            "classification_name",
            "site_name",
            "current_version_number",
            "updated_at",
            "is_deleted",
            "created_at",
        ]


# ---------------------------------------------------------------------------
# Asset — detail
# ---------------------------------------------------------------------------

class AssetDetailSerializer(AssetListSerializer):
    data_snapshot = serializers.JSONField(
        source="current_version.data_snapshot", read_only=True, default=None
    )
    classification = AssetClassificationSerializer(read_only=True)

    class Meta(AssetListSerializer.Meta):
        fields = AssetListSerializer.Meta.fields + ["data_snapshot", "classification", "fingerprint"]


# ---------------------------------------------------------------------------
# Asset — create
# ---------------------------------------------------------------------------

class AssetCreateSerializer(serializers.Serializer):
    asset_code        = serializers.CharField()
    name              = serializers.CharField(min_length=1, max_length=200)
    site_id           = serializers.UUIDField()
    classification_id = serializers.UUIDField()
    custom_data       = serializers.JSONField(required=False, default=dict)

    def validate_asset_code(self, value):
        if not _ASSET_CODE_RE.match(value):
            raise UnprocessableEntity(
                r"Asset code must match ^[A-Z0-9\-]{3,50}$"
            )
        return value

    def validate(self, data):
        from tenants.models import Site
        from iam.models import UserSiteAssignment

        request = self.context["request"]
        user    = request.user

        # Resolve site (scoped to tenant)
        site = Site.objects.filter(
            pk=data["site_id"], tenant=user.tenant, is_active=True
        ).first()
        if not site:
            raise serializers.ValidationError({"site_id": "Site not found."})

        # STAFF: must be assigned to the site
        if user.role == "STAFF":
            if not UserSiteAssignment.objects.filter(user=user, site=site).exists():
                raise serializers.ValidationError(
                    {"site_id": "You are not assigned to this site."}
                )

        # Resolve classification (scoped to tenant)
        classification = AssetClassification.objects.filter(
            pk=data["classification_id"], tenant=user.tenant, is_active=True
        ).first()
        if not classification:
            raise serializers.ValidationError(
                {"classification_id": "Classification not found."}
            )

        data["site"]           = site
        data["classification"] = classification
        return data


# ---------------------------------------------------------------------------
# Asset — update (optimistic concurrency)
# ---------------------------------------------------------------------------

class AssetUpdateSerializer(serializers.Serializer):
    name              = serializers.CharField(min_length=1, max_length=200)
    classification_id = serializers.UUIDField()
    custom_data       = serializers.JSONField(required=False, default=dict)
    version_number    = serializers.IntegerField()   # optimistic lock token

    def validate(self, data):
        request = self.context["request"]
        user    = request.user

        classification = AssetClassification.objects.filter(
            pk=data["classification_id"], tenant=user.tenant, is_active=True
        ).first()
        if not classification:
            raise serializers.ValidationError(
                {"classification_id": "Classification not found."}
            )

        data["classification"] = classification
        return data
