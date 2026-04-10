"""
meetings/views.py

HarborOps meeting workspace API.

Access control:
  - COURIER → 403 on all endpoints (IsNotCourier permission)
  - STAFF → site-scoped (meetings at assigned sites OR created by self)
  - ADMIN → all meetings in their tenant

Audit log: every mutating operation records an AuditLog entry.
"""
import os
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404

from rest_framework.views    import APIView
from rest_framework.response import Response
from rest_framework          import status
from rest_framework.exceptions import PermissionDenied

from core.exceptions import UnprocessableEntity
from core.models     import AuditLog
from core.pagination import paginate_list
from meetings.models import (
    Meeting,
    AgendaItem,
    MeetingAttendance,
    MeetingMinute,
    Resolution,
    Task,
)
from meetings.permissions import IsNotCourier
from meetings.serializers import (
    MeetingListSerializer,
    MeetingDetailSerializer,
    AgendaItemSerializer,
    AttendanceSerializer,
    MinuteSerializer,
    ResolutionSerializer,
    ResolutionCreateSerializer,
    TaskSerializer,
    TaskCreateSerializer,
    TaskUpdateSerializer,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR", "")


def _log(request, action, entity_type, entity_id, diff=None):
    AuditLog.objects.create(
        tenant_id      = request.user.tenant_id,
        entity_type    = entity_type,
        entity_id      = str(entity_id),
        action         = action,
        actor_id       = str(request.user.pk),
        actor_username = request.user.username,
        diff_json      = diff or {},
        ip_address     = _get_ip(request),
    )


def _meetings_queryset(request):
    """Return tenant-scoped meeting queryset, further filtered by site for STAFF."""
    qs = Meeting.objects.filter(tenant=request.user.tenant)
    if request.user.role == "STAFF":
        from iam.models import UserSiteAssignment
        assigned_site_ids = UserSiteAssignment.objects.filter(
            user=request.user
        ).values_list("site_id", flat=True)
        qs = qs.filter(
            models_Q(site__in=assigned_site_ids) | models_Q(created_by=request.user)
        )
    return qs


def _get_meeting(request, pk):
    """Fetch a meeting scoped to this user's tenant and site access."""
    qs = Meeting.objects.filter(tenant=request.user.tenant)
    meeting = get_object_or_404(qs, pk=pk)
    if request.user.role == "STAFF":
        from iam.models import UserSiteAssignment
        assigned_site_ids = list(
            UserSiteAssignment.objects.filter(user=request.user).values_list("site_id", flat=True)
        )
        if meeting.created_by_id != request.user.pk and (
            meeting.site_id is None or meeting.site_id not in assigned_site_ids
        ):
            raise PermissionDenied("You do not have access to this meeting.")
    return meeting


# Inline Q import to avoid top-level circular import risk
from django.db.models import Q as models_Q


# ---------------------------------------------------------------------------
# Attachment helpers
# ---------------------------------------------------------------------------

ALLOWED_EXTENSIONS = {"pdf", "docx", "xlsx", "pptx", "png", "jpg", "jpeg"}
MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024  # 20 MB
MAX_ATTACHMENTS_PER_MEETING = 10


def _save_attachment(meeting_id, uploaded_file):
    """Validate and persist an uploaded file. Returns relative path string.

    Security: the original client filename is never used as a filesystem path.
    Only the extension (validated against an allowlist) is taken from the
    basename of the original name; the stored filename is a UUID.
    """
    original_name = uploaded_file.name or ""

    # Reject null bytes, forward/back slashes, and empty names up-front.
    # Slashes in a multipart filename are never legitimate — they indicate
    # a path traversal attempt.  Null bytes truncate paths on C filesystems.
    if not original_name or "\x00" in original_name or "/" in original_name or "\\" in original_name:
        raise UnprocessableEntity("Invalid attachment filename.")

    # Strip any residual directory components (belt-and-suspenders)
    safe_basename = os.path.basename(original_name)
    if not safe_basename or os.sep in safe_basename or (os.altsep and os.altsep in safe_basename):
        raise UnprocessableEntity("Invalid attachment filename.")

    ext = safe_basename.rsplit(".", 1)[-1].lower() if "." in safe_basename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise UnprocessableEntity(
            f"Attachment extension '.{ext}' is not allowed. "
            f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}."
        )
    if uploaded_file.size > MAX_ATTACHMENT_SIZE:
        raise UnprocessableEntity(
            f"Attachment exceeds 20 MB limit (got {uploaded_file.size} bytes)."
        )
    # Count existing attachments for this meeting
    existing_count = AgendaItem.objects.filter(
        meeting_id=meeting_id,
        attachment_path__isnull=False,
    ).exclude(attachment_path="").count()
    if existing_count >= MAX_ATTACHMENTS_PER_MEETING:
        raise UnprocessableEntity(
            f"Meeting already has {existing_count} attachments (maximum is {MAX_ATTACHMENTS_PER_MEETING})."
        )

    # Use a UUID-based server-side filename to prevent path traversal and
    # information disclosure via client-supplied names.
    server_filename = f"{uuid.uuid4().hex}.{ext}"
    media_root = getattr(settings, "MEDIA_ROOT", "/tmp/media")
    dest_dir = os.path.join(media_root, "meeting_attachments", str(meeting_id))
    os.makedirs(dest_dir, exist_ok=True)
    dest_path = os.path.join(dest_dir, server_filename)
    with open(dest_path, "wb") as fh:
        for chunk in uploaded_file.chunks():
            fh.write(chunk)
    return f"meeting_attachments/{meeting_id}/{server_filename}"


# ---------------------------------------------------------------------------
# 1. MeetingListCreateView — GET/POST /api/v1/meetings/
# ---------------------------------------------------------------------------

class MeetingListCreateView(APIView):
    permission_classes = [IsNotCourier]

    def get(self, request):
        qs = Meeting.objects.filter(tenant=request.user.tenant)

        # STAFF: restrict to assigned sites OR own meetings
        if request.user.role == "STAFF":
            from iam.models import UserSiteAssignment
            assigned_site_ids = list(
                UserSiteAssignment.objects.filter(user=request.user).values_list("site_id", flat=True)
            )
            qs = qs.filter(
                models_Q(site__in=assigned_site_ids) | models_Q(created_by=request.user)
            )

        # Filters
        status_filter = request.query_params.get("status", "").strip().upper()
        if status_filter:
            qs = qs.filter(status=status_filter)

        site_id = request.query_params.get("site_id", "").strip()
        if site_id:
            qs = qs.filter(site_id=site_id)

        qs = qs.select_related("site").prefetch_related("resolutions").order_by("-created_at")
        return paginate_list(request, qs, MeetingListSerializer)

    @transaction.atomic
    def post(self, request):
        title = request.data.get("title", "").strip()
        scheduled_at = request.data.get("scheduled_at")
        site_id = request.data.get("site_id")

        if not title:
            raise UnprocessableEntity("title is required.")
        if not scheduled_at:
            raise UnprocessableEntity("scheduled_at is required.")

        site = None
        if site_id:
            from tenants.models import Site
            site = get_object_or_404(Site, pk=site_id, tenant=request.user.tenant)
            if request.user.role == "STAFF":
                from iam.models import UserSiteAssignment
                if not UserSiteAssignment.objects.filter(user=request.user, site=site).exists():
                    raise PermissionDenied("You are not assigned to this site.")

        meeting = Meeting.objects.create(
            tenant       = request.user.tenant,
            site         = site,
            title        = title,
            scheduled_at = scheduled_at,
            status       = Meeting.Status.DRAFT,
            created_by   = request.user,
        )
        _log(request, AuditLog.Action.CREATE, "Meeting", meeting.pk, {"title": title})
        return Response(MeetingDetailSerializer(meeting).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# 2. MeetingDetailView — GET/PATCH/DELETE /api/v1/meetings/<pk>/
# ---------------------------------------------------------------------------

class MeetingDetailView(APIView):
    permission_classes = [IsNotCourier]

    def get(self, request, pk):
        meeting = _get_meeting(request, pk)
        meeting = Meeting.objects.prefetch_related(
            "agenda_items__submitted_by",
            "attendances__user",
            "resolutions__tasks__assignee",
        ).select_related("site", "created_by").get(pk=meeting.pk)
        return Response(MeetingDetailSerializer(meeting).data)

    @transaction.atomic
    def patch(self, request, pk):
        meeting = _get_meeting(request, pk)
        if meeting.status != Meeting.Status.DRAFT:
            raise UnprocessableEntity("Only DRAFT meetings can be edited.")

        title        = request.data.get("title", "").strip()
        scheduled_at = request.data.get("scheduled_at")
        site_id      = request.data.get("site_id")

        update_fields = ["updated_at"]
        diff = {}

        if title and title != meeting.title:
            meeting.title = title
            update_fields.append("title")
            diff["title"] = title

        if scheduled_at and scheduled_at != str(meeting.scheduled_at):
            meeting.scheduled_at = scheduled_at
            update_fields.append("scheduled_at")
            diff["scheduled_at"] = str(scheduled_at)

        if "site_id" in request.data:
            if site_id:
                from tenants.models import Site
                site = get_object_or_404(Site, pk=site_id, tenant=request.user.tenant)
                if request.user.role == "STAFF":
                    from iam.models import UserSiteAssignment
                    if not UserSiteAssignment.objects.filter(user=request.user, site=site).exists():
                        raise PermissionDenied("You are not assigned to this site.")
                meeting.site = site
            else:
                meeting.site = None
            update_fields.append("site")
            diff["site_id"] = str(site_id) if site_id else None

        meeting.save(update_fields=update_fields)
        if diff:
            _log(request, AuditLog.Action.UPDATE, "Meeting", meeting.pk, diff)
        return Response(MeetingDetailSerializer(meeting).data)

    def delete(self, request, pk):
        meeting = _get_meeting(request, pk)
        if request.user.role != "ADMIN":
            raise PermissionDenied("Only ADMIN users can delete meetings.")
        if meeting.status != Meeting.Status.DRAFT:
            raise UnprocessableEntity("Only DRAFT meetings can be deleted.")
        _log(request, AuditLog.Action.DELETE, "Meeting", meeting.pk, {"title": meeting.title})
        meeting.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# State transition views — 3-6
# ---------------------------------------------------------------------------

class _MeetingTransitionView(APIView):
    """Base for all single-transition views."""
    permission_classes = [IsNotCourier]
    target_status = None  # set in subclass

    def post(self, request, pk):
        meeting = _get_meeting(request, pk)
        try:
            meeting.transition_status(self.target_status, request.user)
        except ValidationError as exc:
            raise UnprocessableEntity("; ".join(exc.messages))
        # transition_status() already writes an AuditLog entry with old/new status
        if self.target_status == Meeting.Status.COMPLETED:
            try:
                from integrations.webhook_utils import dispatch_webhook
                dispatch_webhook("meeting.completed", {"meeting_id": str(meeting.pk), "title": meeting.title}, meeting.tenant)
            except Exception:
                pass
        return Response(MeetingDetailSerializer(meeting).data)


class MeetingScheduleView(_MeetingTransitionView):
    target_status = Meeting.Status.SCHEDULED


class MeetingStartView(_MeetingTransitionView):
    target_status = Meeting.Status.IN_PROGRESS


class MeetingCompleteView(_MeetingTransitionView):
    target_status = Meeting.Status.COMPLETED


class MeetingCancelView(_MeetingTransitionView):
    target_status = Meeting.Status.CANCELLED


# ---------------------------------------------------------------------------
# Frozen check helper — agenda items cannot change if meeting is locked
# ---------------------------------------------------------------------------

_FROZEN_STATUSES = {
    Meeting.Status.IN_PROGRESS,
    Meeting.Status.COMPLETED,
    Meeting.Status.CANCELLED,
}


def _assert_agenda_editable(meeting):
    if meeting.status in _FROZEN_STATUSES:
        raise UnprocessableEntity(
            f"Agenda items cannot be modified when the meeting is {meeting.status}."
        )


# ---------------------------------------------------------------------------
# 7. AgendaItemListCreateView — GET/POST /api/v1/meetings/<pk>/agenda/
# ---------------------------------------------------------------------------

class AgendaItemListCreateView(APIView):
    permission_classes = [IsNotCourier]

    def get(self, request, pk):
        meeting = _get_meeting(request, pk)
        items = meeting.agenda_items.select_related("submitted_by").order_by("sort_order", "created_at")
        return paginate_list(request, items, AgendaItemSerializer, ordering=["sort_order", "created_at"])

    @transaction.atomic
    def post(self, request, pk):
        meeting = _get_meeting(request, pk)
        _assert_agenda_editable(meeting)

        title       = request.data.get("title", "").strip()
        description = request.data.get("description", "")
        sort_order  = request.data.get("sort_order", 0)

        if not title:
            raise UnprocessableEntity("title is required.")

        attachment_path = None
        if "file" in request.FILES:
            attachment_path = _save_attachment(meeting.pk, request.FILES["file"])

        item = AgendaItem.objects.create(
            meeting         = meeting,
            title           = title,
            description     = description,
            sort_order      = sort_order,
            submitted_by    = request.user,
            attachment_path = attachment_path,
        )
        _log(request, AuditLog.Action.CREATE, "AgendaItem", item.pk,
             {"meeting_id": str(meeting.pk), "title": title})
        return Response(AgendaItemSerializer(item).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# 8. AgendaItemDetailView — GET/PATCH/DELETE /api/v1/meetings/<pk>/agenda/<item_pk>/
# ---------------------------------------------------------------------------

class AgendaItemDetailView(APIView):
    permission_classes = [IsNotCourier]

    def _get_item(self, request, pk, item_pk):
        meeting = _get_meeting(request, pk)
        item = get_object_or_404(AgendaItem, pk=item_pk, meeting=meeting)
        return meeting, item

    def get(self, request, pk, item_pk):
        _, item = self._get_item(request, pk, item_pk)
        return Response(AgendaItemSerializer(item).data)

    @transaction.atomic
    def patch(self, request, pk, item_pk):
        meeting, item = self._get_item(request, pk, item_pk)
        _assert_agenda_editable(meeting)

        diff = {}
        title       = request.data.get("title", "").strip()
        description = request.data.get("description")
        sort_order  = request.data.get("sort_order")

        update_fields = ["updated_at"]
        if title and title != item.title:
            item.title = title
            update_fields.append("title")
            diff["title"] = title
        if description is not None and description != item.description:
            item.description = description
            update_fields.append("description")
            diff["description"] = description
        if sort_order is not None:
            item.sort_order = int(sort_order)
            update_fields.append("sort_order")
            diff["sort_order"] = sort_order
        if "file" in request.FILES:
            attachment_path = _save_attachment(meeting.pk, request.FILES["file"])
            item.attachment_path = attachment_path
            update_fields.append("attachment_path")
            diff["attachment_path"] = attachment_path

        item.save(update_fields=update_fields)
        if diff:
            _log(request, AuditLog.Action.UPDATE, "AgendaItem", item.pk, diff)
        return Response(AgendaItemSerializer(item).data)

    def delete(self, request, pk, item_pk):
        meeting, item = self._get_item(request, pk, item_pk)
        _assert_agenda_editable(meeting)
        _log(request, AuditLog.Action.DELETE, "AgendaItem", item.pk,
             {"meeting_id": str(meeting.pk), "title": item.title})
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# 9. AttendanceListCreateView — GET/POST /api/v1/meetings/<pk>/attendance/
# ---------------------------------------------------------------------------

class AttendanceListCreateView(APIView):
    permission_classes = [IsNotCourier]

    def get(self, request, pk):
        meeting = _get_meeting(request, pk)
        attendances = meeting.attendances.select_related("user").order_by("signed_at")
        return paginate_list(request, attendances, AttendanceSerializer, ordering="signed_at")

    @transaction.atomic
    def post(self, request, pk):
        meeting = _get_meeting(request, pk)
        user_id = request.data.get("user_id")
        method  = request.data.get("method")

        if not user_id:
            raise UnprocessableEntity("user_id is required.")
        if not method:
            raise UnprocessableEntity("method is required.")
        if method not in dict(MeetingAttendance.Method.choices):
            raise UnprocessableEntity(
                f"Invalid method '{method}'. Allowed: {list(dict(MeetingAttendance.Method.choices).keys())}."
            )

        from iam.models import User
        attendee = get_object_or_404(User, pk=user_id, tenant=request.user.tenant)

        # Deduplicate — return existing record as 200 if already signed
        existing = MeetingAttendance.objects.filter(meeting=meeting, user=attendee).first()
        if existing:
            return Response(AttendanceSerializer(existing).data, status=status.HTTP_200_OK)

        attendance = MeetingAttendance.objects.create(
            meeting = meeting,
            user    = attendee,
            method  = method,
        )
        _log(request, AuditLog.Action.CREATE, "MeetingAttendance", attendance.pk,
             {"meeting_id": str(meeting.pk), "user_id": str(user_id), "method": method})
        return Response(AttendanceSerializer(attendance).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# 10. MinuteRetrieveUpdateView — GET/PUT /api/v1/meetings/<pk>/minutes/
# ---------------------------------------------------------------------------

class MinuteRetrieveUpdateView(APIView):
    permission_classes = [IsNotCourier]

    def get(self, request, pk):
        meeting = _get_meeting(request, pk)
        try:
            minute = meeting.minutes
            return Response(MinuteSerializer(minute).data)
        except MeetingMinute.DoesNotExist:
            # Return empty minutes representation
            return Response({
                "id": None,
                "meeting_id": str(meeting.pk),
                "content": "",
                "updated_by_id": None,
                "updated_by_username": None,
                "updated_at": None,
            })

    @transaction.atomic
    def put(self, request, pk):
        meeting = _get_meeting(request, pk)
        content = request.data.get("content", "")

        try:
            minute = meeting.minutes
            minute.content    = content
            minute.updated_by = request.user
            minute.save(update_fields=["content", "updated_by", "updated_at"])
            action = AuditLog.Action.UPDATE
        except MeetingMinute.DoesNotExist:
            minute = MeetingMinute.objects.create(
                meeting    = meeting,
                content    = content,
                updated_by = request.user,
            )
            action = AuditLog.Action.CREATE

        _log(request, action, "MeetingMinute", minute.pk,
             {"meeting_id": str(meeting.pk)})
        return Response(MinuteSerializer(minute).data)


# ---------------------------------------------------------------------------
# 11. ResolutionListCreateView — GET/POST /api/v1/meetings/<pk>/resolutions/
# ---------------------------------------------------------------------------

class ResolutionListCreateView(APIView):
    permission_classes = [IsNotCourier]

    def get(self, request, pk):
        meeting = _get_meeting(request, pk)
        resolutions = meeting.resolutions.prefetch_related("tasks__assignee").order_by("created_at")
        return paginate_list(request, resolutions, ResolutionSerializer, ordering="created_at")

    @transaction.atomic
    def post(self, request, pk):
        meeting = _get_meeting(request, pk)

        # Resolutions can only be created during or after the meeting
        if meeting.status not in {Meeting.Status.IN_PROGRESS, Meeting.Status.COMPLETED}:
            raise UnprocessableEntity(
                "Resolutions can only be created when the meeting is IN_PROGRESS or COMPLETED."
            )

        ser = ResolutionCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        agenda_item = None
        if d.get("agenda_item_id"):
            agenda_item = get_object_or_404(
                AgendaItem, pk=d["agenda_item_id"], meeting=meeting
            )

        resolution = Resolution.objects.create(
            meeting     = meeting,
            agenda_item = agenda_item,
            text        = d["text"],
            status      = Resolution.Status.OPEN,
        )
        _log(request, AuditLog.Action.CREATE, "Resolution", resolution.pk,
             {"meeting_id": str(meeting.pk)})
        return Response(ResolutionSerializer(resolution).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# 12. ResolutionDetailView — GET/PATCH /api/v1/resolutions/<pk>/
# ---------------------------------------------------------------------------

class ResolutionDetailView(APIView):
    permission_classes = [IsNotCourier]

    def _get_resolution(self, request, pk):
        resolution = get_object_or_404(
            Resolution.objects.select_related("meeting"),
            pk=pk,
            meeting__tenant=request.user.tenant,
        )
        # Apply STAFF site scoping via the meeting
        if request.user.role == "STAFF":
            _get_meeting(request, resolution.meeting_id)
        return resolution

    def get(self, request, pk):
        resolution = self._get_resolution(request, pk)
        resolution = Resolution.objects.prefetch_related("tasks__assignee").get(pk=resolution.pk)
        return Response(ResolutionSerializer(resolution).data)

    @transaction.atomic
    def patch(self, request, pk):
        resolution = self._get_resolution(request, pk)
        text = request.data.get("text", "").strip()
        if not text:
            raise UnprocessableEntity("text is required.")
        if text != resolution.text:
            resolution.text = text
            resolution.save(update_fields=["text", "updated_at"])
            _log(request, AuditLog.Action.UPDATE, "Resolution", resolution.pk,
                 {"text": text})
        return Response(ResolutionSerializer(resolution).data)


# ---------------------------------------------------------------------------
# 13. TaskCreateView — POST /api/v1/resolutions/<pk>/create-task/
# ---------------------------------------------------------------------------

class TaskCreateView(APIView):
    permission_classes = [IsNotCourier]

    @transaction.atomic
    def post(self, request, pk):
        resolution = get_object_or_404(
            Resolution.objects.select_related("meeting"),
            pk=pk,
            meeting__tenant=request.user.tenant,
        )
        # STAFF site scoping
        if request.user.role == "STAFF":
            _get_meeting(request, resolution.meeting_id)

        ser = TaskCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        from iam.models import User
        assignee = get_object_or_404(User, pk=d["assignee_id"], tenant=request.user.tenant)

        # If assignee is COURIER, delivery_type is required
        if assignee.role == "COURIER" and not d.get("delivery_type"):
            raise UnprocessableEntity(
                "delivery_type is required when assigning a task to a COURIER."
            )

        task = Task.objects.create(
            resolution      = resolution,
            title           = d["title"],
            assignee        = assignee,
            due_date        = d["due_date"],
            status          = Task.Status.TODO,
            delivery_type   = d.get("delivery_type"),
            pickup_location = d.get("pickup_location"),
            drop_location   = d.get("drop_location"),
        )
        _log(request, AuditLog.Action.CREATE, "Task", task.pk,
             {"resolution_id": str(resolution.pk), "assignee_id": str(assignee.pk)})
        return Response(TaskSerializer(task).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# 14. TaskUpdateView — PATCH /api/v1/tasks/<pk>/
# ---------------------------------------------------------------------------

class TaskUpdateView(APIView):
    permission_classes = [IsNotCourier]

    @transaction.atomic
    def patch(self, request, pk):
        task = get_object_or_404(
            Task.objects.select_related("resolution__meeting", "assignee"),
            pk=pk,
            resolution__meeting__tenant=request.user.tenant,
        )
        # STAFF site scoping
        if request.user.role == "STAFF":
            _get_meeting(request, task.resolution.meeting_id)

        ser = TaskUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        diff = {}
        update_fields = ["updated_at"]

        # Handle status transition
        if "status" in d:
            new_status = d["status"]
            # Validate COURIER assignee requires delivery_type
            if task.assignee.role == "COURIER" and not (
                task.delivery_type or d.get("delivery_type")
            ):
                raise UnprocessableEntity(
                    "delivery_type is required when task is assigned to a COURIER."
                )
            try:
                task.transition_status(new_status, request.user)
            except ValidationError as exc:
                raise UnprocessableEntity("; ".join(exc.messages))
            diff["status"] = new_status
            # transition_status already saves; refresh to avoid field conflicts
            task.refresh_from_db()
            if new_status == Task.Status.DONE:
                try:
                    from integrations.webhook_utils import dispatch_webhook
                    dispatch_webhook("task.completed", {"task_id": str(task.pk), "title": task.title, "resolution_id": str(task.resolution_id)}, task.resolution.meeting.tenant)
                except Exception:
                    pass

        # Handle non-status direct fields
        if "progress_notes" in d:
            task.progress_notes = d["progress_notes"]
            update_fields.append("progress_notes")
            diff["progress_notes"] = d["progress_notes"]

        if "delivery_type" in d:
            task.delivery_type = d["delivery_type"]
            update_fields.append("delivery_type")
            diff["delivery_type"] = d["delivery_type"]

        if "pickup_location" in d:
            task.pickup_location = d["pickup_location"]
            update_fields.append("pickup_location")
            diff["pickup_location"] = d["pickup_location"]

        if "drop_location" in d:
            task.drop_location = d["drop_location"]
            update_fields.append("drop_location")
            diff["drop_location"] = d["drop_location"]

        if "confirmed_at" in d:
            task.confirmed_at = d["confirmed_at"]
            update_fields.append("confirmed_at")
            diff["confirmed_at"] = str(d["confirmed_at"]) if d["confirmed_at"] else None

        if len(update_fields) > 1:
            task.save(update_fields=update_fields)
            if diff and "status" not in diff:
                _log(request, AuditLog.Action.UPDATE, "Task", task.pk, diff)

        task.refresh_from_db()
        return Response(TaskSerializer(task).data)


# ---------------------------------------------------------------------------
# 15. MyTasksView — GET /api/v1/tasks/mine/
# ---------------------------------------------------------------------------

class MyTasksView(APIView):
    permission_classes = [IsNotCourier]

    def get(self, request):
        qs = Task.objects.filter(
            assignee=request.user,
        ).select_related("assignee", "resolution__meeting").order_by("-created_at")

        status_filter = request.query_params.get("status", "").strip().upper()
        if status_filter:
            qs = qs.filter(status=status_filter)

        return paginate_list(request, qs, TaskSerializer, ordering="-created_at")
