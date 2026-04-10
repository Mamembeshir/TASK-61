"""
tests/unit/meetings/test_models.py

Unit tests for:
  - Meeting: status state machine (valid/invalid transitions), scheduling constraint
    (must have agenda item), AuditLog written on transition
  - Task: status state machine (valid/invalid transitions), completed_at set on DONE,
    mark_overdue bulk method, resolution.update_status called on transition
  - Resolution: update_status logic (all DONE → COMPLETED, all CANCELLED → CANCELLED,
    mixed → IN_PROGRESS, no tasks → stays OPEN)
  - MeetingAttendance: unique-together constraint
"""
import pytest
from datetime import date, timedelta

from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.utils import timezone

from meetings.models import Meeting, AgendaItem, MeetingAttendance, Resolution, Task
from core.models import AuditLog
from iam.factories import TenantFactory, SiteFactory, UserFactory


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_meeting(tenant, user, site=None, status=Meeting.Status.DRAFT):
    return Meeting.objects.create(
        tenant=tenant,
        site=site,
        title="Test Meeting",
        scheduled_at=timezone.now() + timedelta(days=1),
        status=status,
        created_by=user,
    )


def add_agenda_item(meeting, user):
    return AgendaItem.objects.create(
        meeting=meeting,
        title="Discuss budget",
        submitted_by=user,
        sort_order=1,
    )


def make_resolution(meeting):
    return Resolution.objects.create(meeting=meeting, text="We resolved to do X.")


def make_task(resolution, user, status=Task.Status.TODO, due_offset_days=7):
    return Task.objects.create(
        resolution=resolution,
        title="Task",
        assignee=user,
        due_date=(date.today() + timedelta(days=due_offset_days)),
        status=status,
    )


# ===========================================================================
# 1. Meeting state machine
# ===========================================================================

@pytest.mark.django_db
class TestMeetingStateMachine:

    def setup_method(self):
        self.tenant = TenantFactory()
        self.user = UserFactory(tenant=self.tenant)

    def test_draft_to_scheduled_requires_agenda_item(self):
        meeting = make_meeting(self.tenant, self.user, status=Meeting.Status.DRAFT)
        # No agenda items → must raise
        with pytest.raises(ValidationError, match="agenda item"):
            meeting.transition_status(Meeting.Status.SCHEDULED, changed_by=self.user)

    def test_draft_to_scheduled_succeeds_with_agenda_item(self):
        meeting = make_meeting(self.tenant, self.user, status=Meeting.Status.DRAFT)
        add_agenda_item(meeting, self.user)
        meeting.transition_status(Meeting.Status.SCHEDULED, changed_by=self.user)
        meeting.refresh_from_db()
        assert meeting.status == Meeting.Status.SCHEDULED

    def test_draft_to_cancelled_succeeds(self):
        meeting = make_meeting(self.tenant, self.user, status=Meeting.Status.DRAFT)
        meeting.transition_status(Meeting.Status.CANCELLED, changed_by=self.user)
        meeting.refresh_from_db()
        assert meeting.status == Meeting.Status.CANCELLED

    def test_draft_to_in_progress_is_invalid(self):
        meeting = make_meeting(self.tenant, self.user, status=Meeting.Status.DRAFT)
        with pytest.raises(ValidationError):
            meeting.transition_status(Meeting.Status.IN_PROGRESS, changed_by=self.user)

    def test_scheduled_to_in_progress_succeeds(self):
        meeting = make_meeting(self.tenant, self.user, status=Meeting.Status.SCHEDULED)
        meeting.transition_status(Meeting.Status.IN_PROGRESS, changed_by=self.user)
        meeting.refresh_from_db()
        assert meeting.status == Meeting.Status.IN_PROGRESS

    def test_scheduled_to_cancelled_succeeds(self):
        meeting = make_meeting(self.tenant, self.user, status=Meeting.Status.SCHEDULED)
        meeting.transition_status(Meeting.Status.CANCELLED, changed_by=self.user)
        meeting.refresh_from_db()
        assert meeting.status == Meeting.Status.CANCELLED

    def test_scheduled_to_completed_is_invalid(self):
        meeting = make_meeting(self.tenant, self.user, status=Meeting.Status.SCHEDULED)
        with pytest.raises(ValidationError):
            meeting.transition_status(Meeting.Status.COMPLETED, changed_by=self.user)

    def test_in_progress_to_completed_succeeds(self):
        meeting = make_meeting(self.tenant, self.user, status=Meeting.Status.IN_PROGRESS)
        meeting.transition_status(Meeting.Status.COMPLETED, changed_by=self.user)
        meeting.refresh_from_db()
        assert meeting.status == Meeting.Status.COMPLETED

    def test_completed_is_terminal_state(self):
        meeting = make_meeting(self.tenant, self.user, status=Meeting.Status.COMPLETED)
        with pytest.raises(ValidationError):
            meeting.transition_status(Meeting.Status.CANCELLED, changed_by=self.user)

    def test_cancelled_is_terminal_state(self):
        meeting = make_meeting(self.tenant, self.user, status=Meeting.Status.CANCELLED)
        with pytest.raises(ValidationError):
            meeting.transition_status(Meeting.Status.DRAFT, changed_by=self.user)

    def test_transition_writes_audit_log(self):
        meeting = make_meeting(self.tenant, self.user, status=Meeting.Status.SCHEDULED)
        before = AuditLog.objects.count()
        meeting.transition_status(Meeting.Status.IN_PROGRESS, changed_by=self.user)
        assert AuditLog.objects.count() == before + 1
        log = AuditLog.objects.order_by("-timestamp").first()
        assert log.entity_type == "Meeting"
        assert log.action == AuditLog.Action.UPDATE


# ===========================================================================
# 2. Task state machine
# ===========================================================================

@pytest.mark.django_db
class TestTaskStateMachine:

    def setup_method(self):
        self.tenant = TenantFactory()
        self.user = UserFactory(tenant=self.tenant)
        meeting = make_meeting(self.tenant, self.user)
        self.resolution = make_resolution(meeting)

    def test_todo_to_in_progress_succeeds(self):
        task = make_task(self.resolution, self.user, status=Task.Status.TODO)
        task.transition_status(Task.Status.IN_PROGRESS, changed_by=self.user)
        task.refresh_from_db()
        assert task.status == Task.Status.IN_PROGRESS

    def test_todo_to_done_succeeds(self):
        task = make_task(self.resolution, self.user, status=Task.Status.TODO)
        task.transition_status(Task.Status.DONE, changed_by=self.user)
        task.refresh_from_db()
        assert task.status == Task.Status.DONE

    def test_todo_to_cancelled_succeeds(self):
        task = make_task(self.resolution, self.user, status=Task.Status.TODO)
        task.transition_status(Task.Status.CANCELLED, changed_by=self.user)
        task.refresh_from_db()
        assert task.status == Task.Status.CANCELLED

    def test_in_progress_to_done_succeeds(self):
        task = make_task(self.resolution, self.user, status=Task.Status.IN_PROGRESS)
        task.transition_status(Task.Status.DONE, changed_by=self.user)
        task.refresh_from_db()
        assert task.status == Task.Status.DONE

    def test_in_progress_to_todo_is_invalid(self):
        task = make_task(self.resolution, self.user, status=Task.Status.IN_PROGRESS)
        with pytest.raises(ValidationError):
            task.transition_status(Task.Status.TODO, changed_by=self.user)

    def test_done_is_terminal(self):
        task = make_task(self.resolution, self.user, status=Task.Status.DONE)
        with pytest.raises(ValidationError):
            task.transition_status(Task.Status.TODO, changed_by=self.user)

    def test_cancelled_is_terminal(self):
        task = make_task(self.resolution, self.user, status=Task.Status.CANCELLED)
        with pytest.raises(ValidationError):
            task.transition_status(Task.Status.IN_PROGRESS, changed_by=self.user)

    def test_overdue_can_transition_to_in_progress(self):
        task = make_task(self.resolution, self.user, status=Task.Status.OVERDUE)
        task.transition_status(Task.Status.IN_PROGRESS, changed_by=self.user)
        task.refresh_from_db()
        assert task.status == Task.Status.IN_PROGRESS

    def test_done_sets_completed_at(self):
        before = timezone.now()
        task = make_task(self.resolution, self.user, status=Task.Status.TODO)
        task.transition_status(Task.Status.DONE, changed_by=self.user)
        task.refresh_from_db()
        assert task.completed_at is not None
        assert task.completed_at >= before

    def test_non_done_transition_does_not_set_completed_at(self):
        task = make_task(self.resolution, self.user, status=Task.Status.TODO)
        task.transition_status(Task.Status.IN_PROGRESS, changed_by=self.user)
        task.refresh_from_db()
        assert task.completed_at is None

    def test_transition_writes_audit_log(self):
        task = make_task(self.resolution, self.user, status=Task.Status.TODO)
        before = AuditLog.objects.count()
        task.transition_status(Task.Status.DONE, changed_by=self.user)
        assert AuditLog.objects.count() == before + 1


# ===========================================================================
# 3. Task.mark_overdue class method
# ===========================================================================

@pytest.mark.django_db
class TestMarkOverdue:

    def setup_method(self):
        self.tenant = TenantFactory()
        self.user = UserFactory(tenant=self.tenant)
        meeting = make_meeting(self.tenant, self.user)
        self.resolution = make_resolution(meeting)

    def test_past_due_todo_tasks_become_overdue(self):
        # Create task with due_date in the past
        task = Task.objects.create(
            resolution=self.resolution,
            title="Past due",
            assignee=self.user,
            due_date=date.today() - timedelta(days=1),
            status=Task.Status.TODO,
        )
        count = Task.mark_overdue()
        assert count >= 1
        task.refresh_from_db()
        assert task.status == Task.Status.OVERDUE

    def test_past_due_in_progress_tasks_become_overdue(self):
        task = Task.objects.create(
            resolution=self.resolution,
            title="In progress overdue",
            assignee=self.user,
            due_date=date.today() - timedelta(days=2),
            status=Task.Status.IN_PROGRESS,
        )
        Task.mark_overdue()
        task.refresh_from_db()
        assert task.status == Task.Status.OVERDUE

    def test_future_tasks_are_not_affected(self):
        task = Task.objects.create(
            resolution=self.resolution,
            title="Future task",
            assignee=self.user,
            due_date=date.today() + timedelta(days=7),
            status=Task.Status.TODO,
        )
        Task.mark_overdue()
        task.refresh_from_db()
        assert task.status == Task.Status.TODO

    def test_done_tasks_are_not_marked_overdue(self):
        task = Task.objects.create(
            resolution=self.resolution,
            title="Already done",
            assignee=self.user,
            due_date=date.today() - timedelta(days=1),
            status=Task.Status.DONE,
        )
        Task.mark_overdue()
        task.refresh_from_db()
        assert task.status == Task.Status.DONE

    def test_returns_count_of_updated_tasks(self):
        for i in range(3):
            Task.objects.create(
                resolution=self.resolution,
                title=f"Overdue {i}",
                assignee=self.user,
                due_date=date.today() - timedelta(days=i + 1),
                status=Task.Status.TODO,
            )
        count = Task.mark_overdue()
        assert count >= 3


# ===========================================================================
# 4. Resolution.update_status
# ===========================================================================

@pytest.mark.django_db
class TestResolutionUpdateStatus:

    def setup_method(self):
        self.tenant = TenantFactory()
        self.user = UserFactory(tenant=self.tenant)
        meeting = make_meeting(self.tenant, self.user)
        self.resolution = make_resolution(meeting)

    def test_no_tasks_stays_open(self):
        self.resolution.update_status()
        self.resolution.refresh_from_db()
        assert self.resolution.status == Resolution.Status.OPEN

    def test_all_done_becomes_completed(self):
        make_task(self.resolution, self.user, status=Task.Status.DONE)
        make_task(self.resolution, self.user, status=Task.Status.DONE)
        self.resolution.update_status()
        self.resolution.refresh_from_db()
        assert self.resolution.status == Resolution.Status.COMPLETED

    def test_all_cancelled_becomes_cancelled(self):
        make_task(self.resolution, self.user, status=Task.Status.CANCELLED)
        make_task(self.resolution, self.user, status=Task.Status.CANCELLED)
        self.resolution.update_status()
        self.resolution.refresh_from_db()
        assert self.resolution.status == Resolution.Status.CANCELLED

    def test_done_and_cancelled_mix_becomes_completed(self):
        """DONE + CANCELLED (all terminal) → COMPLETED (not all cancelled)."""
        make_task(self.resolution, self.user, status=Task.Status.DONE)
        make_task(self.resolution, self.user, status=Task.Status.CANCELLED)
        self.resolution.update_status()
        self.resolution.refresh_from_db()
        assert self.resolution.status == Resolution.Status.COMPLETED

    def test_active_task_makes_in_progress(self):
        make_task(self.resolution, self.user, status=Task.Status.DONE)
        make_task(self.resolution, self.user, status=Task.Status.TODO)
        self.resolution.update_status()
        self.resolution.refresh_from_db()
        assert self.resolution.status == Resolution.Status.IN_PROGRESS

    def test_single_in_progress_task_makes_resolution_in_progress(self):
        make_task(self.resolution, self.user, status=Task.Status.IN_PROGRESS)
        self.resolution.update_status()
        self.resolution.refresh_from_db()
        assert self.resolution.status == Resolution.Status.IN_PROGRESS


# ===========================================================================
# 5. MeetingAttendance unique-together constraint
# ===========================================================================

@pytest.mark.django_db
class TestMeetingAttendance:

    def test_sign_in_succeeds(self):
        tenant = TenantFactory()
        user = UserFactory(tenant=tenant)
        meeting = make_meeting(tenant, user)
        att = MeetingAttendance.objects.create(
            meeting=meeting, user=user, method=MeetingAttendance.Method.IN_PERSON
        )
        assert att.pk is not None

    def test_duplicate_attendance_raises(self):
        tenant = TenantFactory()
        user = UserFactory(tenant=tenant)
        meeting = make_meeting(tenant, user)
        MeetingAttendance.objects.create(
            meeting=meeting, user=user, method=MeetingAttendance.Method.IN_PERSON
        )
        with pytest.raises(IntegrityError):
            MeetingAttendance.objects.create(
                meeting=meeting, user=user, method=MeetingAttendance.Method.MATERIAL_ONLY
            )

    def test_different_users_can_attend_same_meeting(self):
        tenant = TenantFactory()
        u1 = UserFactory(tenant=tenant)
        u2 = UserFactory(tenant=tenant)
        meeting = make_meeting(tenant, u1)
        MeetingAttendance.objects.create(meeting=meeting, user=u1, method="IN_PERSON")
        MeetingAttendance.objects.create(meeting=meeting, user=u2, method="IN_PERSON")
        assert meeting.attendances.count() == 2
