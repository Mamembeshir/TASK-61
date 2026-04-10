"""
meetings/models.py - All 6 meeting workspace models with state machines.
"""
import uuid
from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError


class Meeting(models.Model):
    class Status(models.TextChoices):
        DRAFT      = "DRAFT",       "Draft"
        SCHEDULED  = "SCHEDULED",   "Scheduled"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED  = "COMPLETED",   "Completed"
        CANCELLED  = "CANCELLED",   "Cancelled"

    _TRANSITIONS = {
        "DRAFT":       ["SCHEDULED", "CANCELLED"],
        "SCHEDULED":   ["IN_PROGRESS", "CANCELLED"],
        "IN_PROGRESS": ["COMPLETED", "CANCELLED"],
        "COMPLETED":   [],
        "CANCELLED":   [],
    }

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant      = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, related_name="meetings")
    site        = models.ForeignKey("tenants.Site", on_delete=models.SET_NULL, null=True, blank=True, related_name="meetings")
    title       = models.CharField(max_length=300)
    scheduled_at = models.DateTimeField()
    status      = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)
    created_by  = models.ForeignKey("iam.User", on_delete=models.PROTECT, related_name="created_meetings")
    created_at  = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "meetings_meeting"
        ordering = ["-scheduled_at"]

    def __str__(self):
        return f"{self.title} ({self.status})"

    def transition_status(self, new_status: str, changed_by) -> None:
        allowed = self._TRANSITIONS.get(self.status, [])
        if new_status not in allowed:
            raise ValidationError(
                f"Cannot transition meeting from {self.status} to {new_status}."
            )
        if new_status == Meeting.Status.SCHEDULED:
            if not self.agenda_items.exists():
                raise ValidationError(
                    "Meeting must have at least one agenda item before scheduling."
                )
        old_status = self.status
        self.status = new_status
        self.save(update_fields=["status", "updated_at"])
        from core.models import AuditLog
        AuditLog.objects.create(
            tenant_id      = str(self.tenant_id),
            entity_type    = "Meeting",
            entity_id      = str(self.pk),
            action         = AuditLog.Action.UPDATE,
            actor_id       = str(changed_by.pk),
            actor_username = changed_by.username,
            diff_json      = {"old_status": old_status, "new_status": new_status},
        )


class AgendaItem(models.Model):
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meeting     = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name="agenda_items")
    title       = models.CharField(max_length=300)
    description = models.TextField(max_length=2000, blank=True, default="")
    sort_order  = models.IntegerField(default=0)
    submitted_by = models.ForeignKey("iam.User", on_delete=models.PROTECT, related_name="submitted_agenda_items")
    attachment_path = models.CharField(max_length=500, null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "meetings_agendaitem"
        ordering = ["sort_order", "created_at"]


class MeetingAttendance(models.Model):
    class Method(models.TextChoices):
        IN_PERSON     = "IN_PERSON",     "In Person"
        MATERIAL_ONLY = "MATERIAL_ONLY", "Material Only"

    id       = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meeting  = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name="attendances")
    user     = models.ForeignKey("iam.User", on_delete=models.PROTECT, related_name="meeting_attendances")
    method   = models.CharField(max_length=20, choices=Method.choices)
    signed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "meetings_attendance"
        unique_together = [("meeting", "user")]


class MeetingMinute(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meeting    = models.OneToOneField(Meeting, on_delete=models.CASCADE, related_name="minutes")
    content    = models.TextField(max_length=50000, blank=True, default="")
    updated_by = models.ForeignKey("iam.User", on_delete=models.PROTECT, related_name="updated_minutes")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "meetings_minute"


class Resolution(models.Model):
    class Status(models.TextChoices):
        OPEN        = "OPEN",        "Open"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED   = "COMPLETED",   "Completed"
        CANCELLED   = "CANCELLED",   "Cancelled"

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meeting     = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name="resolutions")
    agenda_item = models.ForeignKey(AgendaItem, on_delete=models.SET_NULL, null=True, blank=True, related_name="resolutions")
    text        = models.TextField()
    status      = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN, db_index=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "meetings_resolution"

    def update_status(self) -> None:
        """Recompute status from child tasks per questions.md 5.4."""
        tasks = list(self.tasks.values_list("status", flat=True))
        if not tasks:
            # No tasks → stays OPEN (nothing to recompute)
            return
        task_set = set(tasks)
        done_cancelled = {"DONE", "CANCELLED"}
        if task_set <= done_cancelled:
            if task_set == {"CANCELLED"}:
                new_status = Resolution.Status.CANCELLED
            else:
                new_status = Resolution.Status.COMPLETED
        else:
            new_status = Resolution.Status.IN_PROGRESS
        if new_status != self.status:
            self.status = new_status
            self.save(update_fields=["status", "updated_at"])


class Task(models.Model):
    class Status(models.TextChoices):
        TODO        = "TODO",        "To Do"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        DONE        = "DONE",        "Done"
        OVERDUE     = "OVERDUE",     "Overdue"
        CANCELLED   = "CANCELLED",   "Cancelled"

    class DeliveryType(models.TextChoices):
        PICKUP = "PICKUP", "Pick Up"
        DROP   = "DROP",   "Drop Off"

    _TRANSITIONS = {
        "TODO":        ["IN_PROGRESS", "DONE", "CANCELLED"],
        "IN_PROGRESS": ["DONE", "CANCELLED"],
        "DONE":        [],
        "OVERDUE":     ["IN_PROGRESS", "DONE", "CANCELLED"],
        "CANCELLED":   [],
    }

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    resolution      = models.ForeignKey(Resolution, on_delete=models.CASCADE, related_name="tasks")
    title           = models.CharField(max_length=300)
    assignee        = models.ForeignKey("iam.User", on_delete=models.PROTECT, related_name="assigned_tasks")
    due_date        = models.DateField()
    status          = models.CharField(max_length=20, choices=Status.choices, default=Status.TODO, db_index=True)
    progress_notes  = models.TextField(null=True, blank=True)
    completed_at    = models.DateTimeField(null=True, blank=True)
    delivery_type   = models.CharField(max_length=10, choices=DeliveryType.choices, null=True, blank=True)
    pickup_location = models.CharField(max_length=500, null=True, blank=True)
    drop_location   = models.CharField(max_length=500, null=True, blank=True)
    confirmed_at    = models.DateTimeField(null=True, blank=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "meetings_task"

    def transition_status(self, new_status: str, changed_by) -> None:
        allowed = self._TRANSITIONS.get(self.status, [])
        if new_status not in allowed:
            raise ValidationError(
                f"Cannot transition task from {self.status} to {new_status}."
            )
        old_status = self.status
        self.status = new_status
        if new_status == Task.Status.DONE:
            self.completed_at = timezone.now()
        self.save(update_fields=["status", "completed_at", "updated_at"])
        # Recompute parent resolution
        self.resolution.update_status()
        from core.models import AuditLog
        AuditLog.objects.create(
            tenant_id      = str(self.resolution.meeting.tenant_id),
            entity_type    = "Task",
            entity_id      = str(self.pk),
            action         = AuditLog.Action.UPDATE,
            actor_id       = str(changed_by.pk),
            actor_username = changed_by.username,
            diff_json      = {"old_status": old_status, "new_status": new_status, "resolution_id": str(self.resolution_id)},
        )

    @classmethod
    def mark_overdue(cls) -> int:
        """Transition TODO/IN_PROGRESS tasks past due_date to OVERDUE. Returns count updated."""
        today = timezone.now().date()
        count = cls.objects.filter(
            status__in=[cls.Status.TODO, cls.Status.IN_PROGRESS],
            due_date__lt=today,
        ).update(status=cls.Status.OVERDUE)
        return count
