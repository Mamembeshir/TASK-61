"""
assets/views.py

Asset Ledger REST API views.

Access model:
  COURIER       → 403 on every endpoint (IsNotCourier permission)
  STAFF         → sees / edits only assets for their assigned sites (404 otherwise)
  ADMIN         → full access within their tenant; can include_deleted=true; soft-delete

Versioning:
  PUT /assets/{id}/ requires version_number (optimistic concurrency lock).
  Stale version_number → 409 CONFLICT.

Fingerprint:
  POST /assets/ computes fingerprint before saving.
  Duplicate fingerprint within tenant → 409 with existing asset info.
"""
from rest_framework.views     import APIView
from rest_framework.response  import Response
from rest_framework           import status

from django.conf      import settings
from django.shortcuts import get_object_or_404
from django.utils     import timezone
from django.utils.dateparse import parse_datetime

from core.exceptions  import ConflictError, UnprocessableEntity
from core.models      import AuditLog
from core.pagination  import CursorPagination
from assets.models       import Asset, AssetClassification, AssetVersion
from assets.permissions  import IsNotCourier
from assets.serializers  import (
    AssetListSerializer,
    AssetDetailSerializer,
    AssetCreateSerializer,
    AssetUpdateSerializer,
    AssetVersionSerializer,
    AssetClassificationSerializer,
    AssetClassificationCreateSerializer,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    return xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR")


def _base_asset_queryset(user):
    """
    Tenant-scoped queryset with pre-fetched relations.
    STAFF filtered to their assigned sites only.
    """
    from iam.models import UserSiteAssignment

    qs = (
        Asset.objects
        .select_related(
            "site",
            "classification",
            "current_version",
            "current_version__changed_by",
        )
        .filter(site__tenant=user.tenant)
    )

    if user.role == "STAFF":
        assigned = UserSiteAssignment.objects.filter(user=user).values_list("site_id", flat=True)
        qs = qs.filter(site_id__in=assigned)

    return qs


def _log(request, action, asset):
    AuditLog.objects.create(
        tenant_id    = request.user.tenant_id,
        entity_type  = "Asset",
        entity_id    = str(asset.pk),
        action       = action,
        actor_id     = str(request.user.pk),
        actor_username = request.user.username,
        diff_json    = {"asset_code": asset.asset_code, "name": asset.name},
        ip_address   = _get_ip(request),
    )


# ---------------------------------------------------------------------------
# Asset list + create
# ---------------------------------------------------------------------------

class AssetListCreateView(APIView):
    permission_classes = [IsNotCourier]

    def get(self, request):
        qs = _base_asset_queryset(request.user)

        # Filters
        site_id           = request.query_params.get("site_id")
        classification_id = request.query_params.get("classification_id")
        include_deleted   = (
            request.query_params.get("include_deleted", "false").lower() == "true"
            and request.user.role == "ADMIN"
        )

        if site_id:
            qs = qs.filter(site_id=site_id)
        if classification_id:
            qs = qs.filter(classification_id=classification_id)
        if not include_deleted:
            qs = qs.filter(is_deleted=False)

        paginator = CursorPagination()
        page      = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(
            AssetListSerializer(page, many=True).data
        )

    def post(self, request):
        ser = AssetCreateSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        site           = d["site"]
        classification = d["classification"]
        asset_code     = d["asset_code"]
        name           = d["name"]
        custom_data    = d.get("custom_data", {})

        # Compute fingerprint before saving (needed for duplicate check)
        import hashlib
        raw = "|".join([
            str(site.pk),
            asset_code.lower(),
            name.lower(),
            classification.code,
        ])
        fp = hashlib.sha256(raw.encode()).hexdigest()

        # Check for asset_code conflict on the same site first (unique DB constraint)
        code_conflict = (
            Asset.objects
            .filter(site=site, asset_code=asset_code)
            .select_related("site")
            .first()
        )
        if code_conflict:
            raise ConflictError({
                "existing_id":   str(code_conflict.pk),
                "existing_name": code_conflict.name,
            })

        # Duplicate fingerprint check across tenant (same identity fields)
        existing = (
            Asset.objects
            .filter(fingerprint=fp, is_deleted=False, site__tenant=request.user.tenant)
            .select_related("site")
            .first()
        )
        if existing:
            raise ConflictError({
                "existing_id":   str(existing.pk),
                "existing_name": existing.name,
            })

        asset = Asset.objects.create(
            site=site,
            asset_code=asset_code,
            name=name,
            classification=classification,
            fingerprint=fp,
        )
        asset.create_version(
            data=custom_data,
            source=AssetVersion.ChangeSource.MANUAL,
            user=request.user,
        )
        _log(request, AuditLog.Action.CREATE, asset)

        # Reload with all relations for the response serializer
        asset = (
            Asset.objects
            .select_related(
                "site", "classification",
                "current_version", "current_version__changed_by",
            )
            .get(pk=asset.pk)
        )
        try:
            from integrations.webhook_utils import dispatch_webhook
            dispatch_webhook("asset.created", {"id": str(asset.pk), "code": asset.asset_code, "name": asset.name}, request.user.tenant)
        except Exception:
            pass
        return Response(AssetDetailSerializer(asset).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Asset detail + update + soft-delete
# ---------------------------------------------------------------------------

class AssetDetailUpdateDeleteView(APIView):
    permission_classes = [IsNotCourier]

    def _get_asset(self, request, pk):
        qs = _base_asset_queryset(request.user)
        return get_object_or_404(qs, pk=pk)

    def get(self, request, pk):
        asset = self._get_asset(request, pk)
        return Response(AssetDetailSerializer(asset).data)

    def put(self, request, pk):
        asset = self._get_asset(request, pk)

        if asset.is_deleted:
            raise UnprocessableEntity("Cannot update a deleted asset.")

        ser = AssetUpdateSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        # Optimistic concurrency check
        current_ver = asset.current_version.version_number if asset.current_version else 0
        if d["version_number"] != current_ver:
            raise ConflictError(
                f"Stale version. Current is {current_ver}, you sent {d['version_number']}."
            )

        # Apply changes to the asset record
        asset.name           = d["name"]
        asset.classification = d["classification"]
        Asset.objects.filter(pk=asset.pk).update(
            name=d["name"],
            classification=d["classification"],
        )
        asset.create_version(
            data=d.get("custom_data", {}),
            source=AssetVersion.ChangeSource.MANUAL,
            user=request.user,
        )
        _log(request, AuditLog.Action.UPDATE, asset)

        asset = (
            Asset.objects
            .select_related(
                "site", "classification",
                "current_version", "current_version__changed_by",
            )
            .get(pk=asset.pk)
        )
        try:
            from integrations.webhook_utils import dispatch_webhook
            dispatch_webhook("asset.updated", {"id": str(asset.pk), "code": asset.asset_code, "name": asset.name}, request.user.tenant)
        except Exception:
            pass
        return Response(AssetDetailSerializer(asset).data)

    def delete(self, request, pk):
        if request.user.role != "ADMIN":
            return Response(
                {"detail": "Only admins can delete assets."},
                status=status.HTTP_403_FORBIDDEN,
            )

        asset = self._get_asset(request, pk)

        if asset.is_deleted:
            raise UnprocessableEntity("Asset is already deleted.")

        prev_data = asset.current_version.data_snapshot if asset.current_version else {}
        asset.create_version(
            data=prev_data,
            source=AssetVersion.ChangeSource.CORRECTION,
            user=request.user,
            note="Asset soft-deleted.",
        )
        Asset.objects.filter(pk=asset.pk).update(is_deleted=True)
        _log(request, AuditLog.Action.DELETE, asset)

        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Asset timeline (all versions, newest first)
# ---------------------------------------------------------------------------

class AssetTimelineView(APIView):
    permission_classes = [IsNotCourier]

    def get(self, request, pk):
        qs = _base_asset_queryset(request.user)
        asset = get_object_or_404(qs, pk=pk)

        versions = (
            AssetVersion.objects
            .filter(asset=asset)
            .select_related("changed_by")
            .order_by("-version_number")
        )
        return Response(AssetVersionSerializer(versions, many=True).data)


# ---------------------------------------------------------------------------
# Asset as-of (point-in-time version lookup)
# ---------------------------------------------------------------------------

class AssetAsOfView(APIView):
    permission_classes = [IsNotCourier]

    def get(self, request, pk):
        at_str = request.query_params.get("at")
        if not at_str:
            return Response(
                {"detail": "Query parameter 'at' is required (ISO 8601 datetime)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        dt = parse_datetime(at_str)
        if dt is None:
            return Response(
                {"detail": "Invalid 'at' value. Use ISO 8601 format, e.g. 2025-01-15T10:00:00Z."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.utc)

        qs    = _base_asset_queryset(request.user)
        asset = get_object_or_404(qs, pk=pk)

        version = asset.get_version_at(dt)
        if version is None:
            return Response(
                {"detail": "No version found at the requested time."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(AssetVersionSerializer(version).data)


# ---------------------------------------------------------------------------
# Classification list + create
# ---------------------------------------------------------------------------

class ClassificationListCreateView(APIView):
    """
    GET  — Returns the classification tree (root nodes with nested children)
           for the authenticated user's tenant.
    POST — ADMIN only. Creates a new classification node.
    """

    def get(self, request):
        roots = (
            AssetClassification.objects
            .filter(tenant=request.user.tenant, parent__isnull=True, is_active=True)
            .prefetch_related("children__children")
            .order_by("code")
        )
        return Response(AssetClassificationSerializer(roots, many=True).data)

    def post(self, request):
        if request.user.role != "ADMIN":
            return Response(
                {"detail": "Only admins can create classifications."},
                status=status.HTTP_403_FORBIDDEN,
            )

        ser = AssetClassificationCreateSerializer(
            data=request.data, context={"request": request}
        )
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        # Uniqueness check
        if AssetClassification.objects.filter(
            tenant=d["tenant"], code=d["code"]
        ).exists():
            raise ConflictError("A classification with this code already exists.")

        classification = AssetClassification.objects.create(
            tenant=d["tenant"],
            code=d["code"],
            name=d["name"],
            parent=d.get("parent"),
        )
        return Response(
            AssetClassificationSerializer(classification).data,
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# Constants (patchable in tests)
# ---------------------------------------------------------------------------

MAX_IMPORT_SIZE  = getattr(settings, "BULK_IMPORT_MAX_FILE_MB", 25) * 1024 * 1024
MAX_IMPORT_ROWS  = getattr(settings, "BULK_IMPORT_MAX_ROWS", 10_000)
ASYNC_THRESHOLD  = 1_000   # rows; above this → Celery async


# ---------------------------------------------------------------------------
# Bulk import helpers
# ---------------------------------------------------------------------------

def _save_upload(uploaded_file, tenant_id, job_id: str) -> str:
    """Persist the uploaded file to UPLOAD_ROOT/imports/<tenant>/<job_id><ext>."""
    from pathlib import Path
    import os

    ext       = os.path.splitext(uploaded_file.name)[1].lower() or ".csv"
    upload_dir = Path(settings.UPLOAD_ROOT) / "imports" / str(tenant_id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / f"{job_id}{ext}"
    with open(file_path, "wb") as fh:
        for chunk in uploaded_file.chunks():
            fh.write(chunk)
    return str(file_path)


def _preview_response(job) -> dict:
    from assets.import_export import summarise
    summary = summarise(job.results_json)
    return {
        "import_id": str(job.pk),
        "status":    job.status,
        **summary,
        "rows": job.results_json["rows"],
    }


# ---------------------------------------------------------------------------
# POST /api/v1/assets/import/
# ---------------------------------------------------------------------------

class AssetImportView(APIView):
    permission_classes = [IsNotCourier]
    parser_classes     = [__import__("rest_framework").parsers.MultiPartParser,
                          __import__("rest_framework").parsers.JSONParser]

    def post(self, request):
        uploaded = request.FILES.get("file")
        site_id  = request.data.get("site_id")

        if not uploaded:
            return Response({"detail": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)
        if not site_id:
            return Response({"detail": "site_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        # File size check (before saving)
        if uploaded.size > MAX_IMPORT_SIZE:
            raise UnprocessableEntity(
                f"File exceeds maximum size of "
                f"{getattr(settings, 'BULK_IMPORT_MAX_FILE_MB', 25)} MB."
            )

        # Validate file extension
        ext = (uploaded.name or "").rsplit(".", 1)[-1].lower()
        if ext not in ("csv", "xlsx"):
            raise UnprocessableEntity("Only CSV and XLSX files are accepted.")

        # Resolve site + STAFF scoping
        from tenants.models import Site
        from iam.models import UserSiteAssignment
        from assets.models import BulkImportJob

        site = Site.objects.filter(pk=site_id, tenant=request.user.tenant).first()
        if not site:
            return Response({"detail": "Site not found."}, status=status.HTTP_400_BAD_REQUEST)
        if request.user.role == "STAFF":
            if not UserSiteAssignment.objects.filter(user=request.user, site=site).exists():
                return Response(
                    {"detail": "You are not assigned to this site."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # Create the job record first so we have a job ID for the file path
        job = BulkImportJob.objects.create(
            tenant=request.user.tenant,
            site=site,
            uploaded_by=request.user,
            file_path="",
            status=BulkImportJob.Status.PENDING,
        )
        file_path = _save_upload(uploaded, request.user.tenant_id, str(job.pk))
        BulkImportJob.objects.filter(pk=job.pk).update(file_path=file_path)
        job.file_path = file_path

        # Parse + count rows (always needed to enforce MAX_IMPORT_ROWS)
        from assets.import_export import parse_file, parse_and_classify
        try:
            headers, rows = parse_file(file_path)
        except ValueError as exc:
            job.status = BulkImportJob.Status.FAILED
            BulkImportJob.objects.filter(pk=job.pk).update(
                status=job.status, results_json={"error": str(exc)}
            )
            raise UnprocessableEntity(str(exc))

        if len(rows) > MAX_IMPORT_ROWS:
            BulkImportJob.objects.filter(pk=job.pk).update(
                status=BulkImportJob.Status.FAILED,
                results_json={"error": f"Row count {len(rows)} exceeds limit of {MAX_IMPORT_ROWS}."},
            )
            raise UnprocessableEntity(
                f"Row count {len(rows)} exceeds the maximum of {MAX_IMPORT_ROWS} rows."
            )

        # Async path
        if len(rows) >= ASYNC_THRESHOLD:
            from assets.tasks import process_bulk_import_async
            BulkImportJob.objects.filter(pk=job.pk).update(
                status=BulkImportJob.Status.PROCESSING
            )
            process_bulk_import_async.delay(str(job.pk))
            return Response(
                {
                    "import_id": str(job.pk),
                    "status":    BulkImportJob.Status.PROCESSING,
                    "message":   (
                        f"Import queued ({len(rows)} rows). "
                        f"Poll GET /api/v1/assets/import/{job.pk}/ for status."
                    ),
                },
                status=status.HTTP_202_ACCEPTED,
            )

        # Sync path: classify and return preview
        results = parse_and_classify(file_path, request.user.tenant, site)
        BulkImportJob.objects.filter(pk=job.pk).update(
            status=BulkImportJob.Status.PREVIEW_READY,
            total_rows=len(results["rows"]),
            results_json=results,
        )
        job.status       = BulkImportJob.Status.PREVIEW_READY
        job.total_rows   = len(results["rows"])
        job.results_json = results
        return Response(_preview_response(job), status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# GET /api/v1/assets/import/{job_id}/  — status / preview
# ---------------------------------------------------------------------------

class AssetImportDetailView(APIView):
    permission_classes = [IsNotCourier]

    def get(self, request, job_id):
        from assets.models import BulkImportJob
        job = get_object_or_404(
            BulkImportJob, pk=job_id, tenant=request.user.tenant
        )
        return Response(_preview_response(job))


# ---------------------------------------------------------------------------
# POST /api/v1/assets/import/{job_id}/correct/
# ---------------------------------------------------------------------------

class AssetImportCorrectView(APIView):
    permission_classes = [IsNotCourier]

    def post(self, request, job_id):
        from assets.models import BulkImportJob
        from assets.import_export import apply_corrections

        job = get_object_or_404(
            BulkImportJob, pk=job_id, tenant=request.user.tenant
        )
        if job.status != BulkImportJob.Status.PREVIEW_READY:
            return Response(
                {"detail": f"Job is in status '{job.status}', expected PREVIEW_READY."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        corrections = request.data.get("corrections", [])
        if not isinstance(corrections, list):
            return Response(
                {"detail": "'corrections' must be a list."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updated_results = apply_corrections(
            job.results_json, corrections, request.user.tenant, job.site
        )
        BulkImportJob.objects.filter(pk=job.pk).update(results_json=updated_results)
        job.results_json = updated_results
        return Response(_preview_response(job))


# ---------------------------------------------------------------------------
# POST /api/v1/assets/import/{job_id}/confirm/
# ---------------------------------------------------------------------------

class AssetImportConfirmView(APIView):
    permission_classes = [IsNotCourier]

    def post(self, request, job_id):
        from assets.models import BulkImportJob
        from assets.import_export import confirm_import

        job = get_object_or_404(
            BulkImportJob, pk=job_id, tenant=request.user.tenant
        )
        if job.status != BulkImportJob.Status.PREVIEW_READY:
            return Response(
                {"detail": f"Job is in status '{job.status}', expected PREVIEW_READY."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        decisions = request.data.get("decisions", [])
        if not isinstance(decisions, list):
            return Response(
                {"detail": "'decisions' must be a list."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = confirm_import(job, decisions, request.user)
        try:
            from integrations.webhook_utils import dispatch_webhook
            dispatch_webhook("asset.imported", {"job_id": str(job.pk), "created": result.get("created", 0), "updated": result.get("updated", 0)}, request.user.tenant)
        except Exception:
            pass
        return Response({**result, "import_id": str(job.pk)})


# ---------------------------------------------------------------------------
# GET /api/v1/assets/export/
# ---------------------------------------------------------------------------

class AssetExportView(APIView):
    permission_classes = [IsNotCourier]

    def get(self, request):
        from assets.import_export import build_export
        from django.http import HttpResponse

        # Use 'file_format' (not 'format') to avoid DRF's URL_FORMAT_OVERRIDE
        # interception which would cause Http404 when ?format=csv is requested.
        fmt     = request.query_params.get("file_format", "xlsx").lower()
        site_id = request.query_params.get("site_id")

        if fmt not in ("xlsx", "csv"):
            return Response(
                {"detail": "file_format must be 'xlsx' or 'csv'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_bytes, content_type, filename = build_export(request.user, site_id, fmt)
        response = HttpResponse(file_bytes, content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
