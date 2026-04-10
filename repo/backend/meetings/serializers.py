"""
meetings/serializers.py

Serializers for all Meeting workspace models.
"""
from rest_framework import serializers

from meetings.models import (
    Meeting,
    AgendaItem,
    MeetingAttendance,
    MeetingMinute,
    Resolution,
    Task,
)


# ---------------------------------------------------------------------------
# Task serializers
# ---------------------------------------------------------------------------

class TaskSerializer(serializers.ModelSerializer):
    assignee_username    = serializers.CharField(source="assignee.username", read_only=True)
    allowed_transitions  = serializers.SerializerMethodField()

    class Meta:
        model  = Task
        fields = [
            "id", "resolution_id", "title",
            "assignee_id", "assignee_username",
            "due_date", "status", "allowed_transitions",
            "progress_notes",
            "completed_at",
            "delivery_type", "pickup_location", "drop_location", "confirmed_at",
            "created_at", "updated_at",
        ]

    def get_allowed_transitions(self, obj):
        return Task._TRANSITIONS.get(obj.status, [])


class TaskCreateSerializer(serializers.Serializer):
    title           = serializers.CharField(max_length=300)
    assignee_id     = serializers.UUIDField()
    due_date        = serializers.DateField()
    delivery_type   = serializers.ChoiceField(choices=Task.DeliveryType.choices, required=False, allow_null=True)
    pickup_location = serializers.CharField(max_length=500, required=False, allow_blank=True, allow_null=True)
    drop_location   = serializers.CharField(max_length=500, required=False, allow_blank=True, allow_null=True)


class TaskUpdateSerializer(serializers.Serializer):
    status          = serializers.ChoiceField(choices=Task.Status.choices, required=False)
    progress_notes  = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    delivery_type   = serializers.ChoiceField(choices=Task.DeliveryType.choices, required=False, allow_null=True)
    pickup_location = serializers.CharField(max_length=500, required=False, allow_blank=True, allow_null=True)
    drop_location   = serializers.CharField(max_length=500, required=False, allow_blank=True, allow_null=True)
    confirmed_at    = serializers.DateTimeField(required=False, allow_null=True)


class CourierTaskSerializer(serializers.ModelSerializer):
    """Compact view for courier delivery tasks."""
    delivery_type_display = serializers.CharField(
        source="get_delivery_type_display", read_only=True
    )

    class Meta:
        model  = Task
        fields = [
            "id", "title", "status",
            "due_date",
            "delivery_type", "delivery_type_display",
            "pickup_location", "drop_location",
            "confirmed_at",
            "created_at",
        ]


# ---------------------------------------------------------------------------
# Resolution serializers
# ---------------------------------------------------------------------------

class ResolutionSerializer(serializers.ModelSerializer):
    tasks = TaskSerializer(many=True, read_only=True)

    class Meta:
        model  = Resolution
        fields = [
            "id", "meeting_id", "agenda_item_id",
            "text", "status",
            "tasks",
            "created_at", "updated_at",
        ]


class ResolutionCreateSerializer(serializers.Serializer):
    text           = serializers.CharField()
    agenda_item_id = serializers.UUIDField(required=False, allow_null=True)


# ---------------------------------------------------------------------------
# Agenda item serializers
# ---------------------------------------------------------------------------

class AgendaItemSerializer(serializers.ModelSerializer):
    submitted_by_username = serializers.CharField(source="submitted_by.username", read_only=True)

    class Meta:
        model  = AgendaItem
        fields = [
            "id", "meeting_id",
            "title", "description", "sort_order",
            "submitted_by_id", "submitted_by_username",
            "attachment_path",
            "created_at", "updated_at",
        ]


# ---------------------------------------------------------------------------
# Attendance serializers
# ---------------------------------------------------------------------------

class AttendanceSerializer(serializers.ModelSerializer):
    user_username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model  = MeetingAttendance
        fields = ["id", "user_id", "user_username", "method", "signed_at"]


# ---------------------------------------------------------------------------
# Minute serializers
# ---------------------------------------------------------------------------

class MinuteSerializer(serializers.ModelSerializer):
    updated_by_username = serializers.CharField(source="updated_by.username", read_only=True)

    class Meta:
        model  = MeetingMinute
        fields = ["id", "meeting_id", "content", "updated_by_id", "updated_by_username", "updated_at"]


# ---------------------------------------------------------------------------
# Meeting list serializer — minimal fields for the index
# ---------------------------------------------------------------------------

class MeetingListSerializer(serializers.ModelSerializer):
    site_name        = serializers.CharField(source="site.name", read_only=True, default=None)
    resolution_count = serializers.SerializerMethodField()
    open_task_count  = serializers.SerializerMethodField()

    class Meta:
        model  = Meeting
        fields = [
            "id", "title", "scheduled_at", "status",
            "site_id", "site_name",
            "resolution_count", "open_task_count",
            "created_at",
        ]

    def get_resolution_count(self, obj):
        # Relies on prefetch_related("resolutions") in view queryset
        if hasattr(obj, "_prefetched_objects_cache") and "resolutions" in obj._prefetched_objects_cache:
            return len(obj._prefetched_objects_cache["resolutions"])
        return obj.resolutions.count()

    def get_open_task_count(self, obj):
        return Task.objects.filter(
            resolution__meeting=obj,
            status__in=[Task.Status.TODO, Task.Status.IN_PROGRESS, Task.Status.OVERDUE],
        ).count()


# ---------------------------------------------------------------------------
# Meeting detail serializer — full nested data
# ---------------------------------------------------------------------------

class MeetingDetailSerializer(serializers.ModelSerializer):
    site_name    = serializers.CharField(source="site.name", read_only=True, default=None)
    agenda_items = AgendaItemSerializer(many=True, read_only=True)
    attendances  = AttendanceSerializer(many=True, read_only=True)
    resolutions  = ResolutionSerializer(many=True, read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model  = Meeting
        fields = [
            "id", "title", "scheduled_at", "status",
            "tenant_id",
            "site_id", "site_name",
            "created_by_id", "created_by_username",
            "created_at", "updated_at",
            "agenda_items", "attendances", "resolutions",
        ]
