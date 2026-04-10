from django.contrib import admin

from meetings.models import (
    Meeting,
    AgendaItem,
    MeetingAttendance,
    MeetingMinute,
    Resolution,
    Task,
)


@admin.register(Meeting)
class MeetingAdmin(admin.ModelAdmin):
    list_display  = ["title", "status", "scheduled_at", "tenant", "site", "created_by", "created_at"]
    list_filter   = ["status", "tenant"]
    search_fields = ["title", "created_by__username"]
    readonly_fields = ["id", "created_at", "updated_at"]
    ordering      = ["-scheduled_at"]


@admin.register(AgendaItem)
class AgendaItemAdmin(admin.ModelAdmin):
    list_display  = ["title", "meeting", "sort_order", "submitted_by", "created_at"]
    list_filter   = ["meeting__status"]
    search_fields = ["title", "meeting__title"]
    readonly_fields = ["id", "created_at", "updated_at"]
    ordering      = ["meeting", "sort_order", "created_at"]


@admin.register(MeetingAttendance)
class MeetingAttendanceAdmin(admin.ModelAdmin):
    list_display  = ["meeting", "user", "method", "signed_at"]
    list_filter   = ["method"]
    search_fields = ["meeting__title", "user__username"]
    readonly_fields = ["id", "signed_at"]


@admin.register(MeetingMinute)
class MeetingMinuteAdmin(admin.ModelAdmin):
    list_display  = ["meeting", "updated_by", "updated_at"]
    search_fields = ["meeting__title"]
    readonly_fields = ["id", "updated_at"]


@admin.register(Resolution)
class ResolutionAdmin(admin.ModelAdmin):
    list_display  = ["text_excerpt", "meeting", "agenda_item", "status", "created_at"]
    list_filter   = ["status"]
    search_fields = ["text", "meeting__title"]
    readonly_fields = ["id", "created_at", "updated_at"]
    ordering      = ["-created_at"]

    @admin.display(description="Text")
    def text_excerpt(self, obj):
        return obj.text[:80] + ("…" if len(obj.text) > 80 else "")


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display  = ["title", "resolution", "assignee", "status", "due_date", "created_at"]
    list_filter   = ["status", "delivery_type"]
    search_fields = ["title", "assignee__username", "resolution__meeting__title"]
    readonly_fields = ["id", "created_at", "updated_at", "completed_at"]
    ordering      = ["-created_at"]
