"""
tests/api/meetings/test_meetings.py

Integration tests for the HarborOps Meetings API.

Endpoints under test:
  POST   /api/v1/meetings/meetings/
  GET    /api/v1/meetings/meetings/
  GET    /api/v1/meetings/meetings/{id}/
  PATCH  /api/v1/meetings/meetings/{id}/
  DELETE /api/v1/meetings/meetings/{id}/
  POST   /api/v1/meetings/meetings/{id}/schedule/
  POST   /api/v1/meetings/meetings/{id}/start/
  POST   /api/v1/meetings/meetings/{id}/complete/
  POST   /api/v1/meetings/meetings/{id}/cancel/
  GET    /api/v1/meetings/meetings/{id}/agenda/
  POST   /api/v1/meetings/meetings/{id}/agenda/
  PATCH  /api/v1/meetings/meetings/{id}/agenda/{item_id}/
  DELETE /api/v1/meetings/meetings/{id}/agenda/{item_id}/
  GET    /api/v1/meetings/meetings/{id}/attendance/
  POST   /api/v1/meetings/meetings/{id}/attendance/
  GET    /api/v1/meetings/meetings/{id}/minutes/
  PUT    /api/v1/meetings/meetings/{id}/minutes/
  GET    /api/v1/meetings/meetings/{id}/resolutions/
  POST   /api/v1/meetings/meetings/{id}/resolutions/
  POST   /api/v1/meetings/resolutions/{id}/create-task/
  PATCH  /api/v1/meetings/tasks/{id}/
  GET    /api/v1/meetings/tasks/mine/
"""
import datetime
import io

import pytest

from core.models import AuditLog
from meetings.models import (
    AgendaItem,
    Meeting,
    MeetingAttendance,
    MeetingMinute,
    Resolution,
    Task,
)

pytestmark = [pytest.mark.api, pytest.mark.django_db]

BASE       = "/api/v1/meetings/meetings/"
TODAY      = datetime.date.today()
TOMORROW   = TODAY + datetime.timedelta(days=1)
YESTERDAY  = TODAY - datetime.timedelta(days=1)

SCHEDULED_AT = "2026-06-01T10:00:00Z"


# ---------------------------------------------------------------------------
# Module-level fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def meeting(admin_user, tenant, site):
    """A freshly created DRAFT meeting."""
    return Meeting.objects.create(
        tenant       = tenant,
        site         = site,
        title        = "Board Meeting",
        scheduled_at = SCHEDULED_AT,
        created_by   = admin_user,
    )


@pytest.fixture
def scheduled_meeting(admin_client, meeting, assert_status):
    """A meeting that has one agenda item and has been moved to SCHEDULED."""
    admin_client.post(
        f"{BASE}{meeting.pk}/agenda/",
        data={"title": "Item 1", "description": ""},
        format="json",
    )
    resp = admin_client.post(f"{BASE}{meeting.pk}/schedule/")
    assert_status(resp, 200)
    meeting.refresh_from_db()
    return meeting


@pytest.fixture
def inprogress_meeting(admin_client, scheduled_meeting, assert_status):
    """A meeting that is IN_PROGRESS."""
    resp = admin_client.post(f"{BASE}{scheduled_meeting.pk}/start/")
    assert_status(resp, 200)
    scheduled_meeting.refresh_from_db()
    return scheduled_meeting


@pytest.fixture
def resolution(admin_client, inprogress_meeting, assert_status):
    """A single OPEN resolution on an IN_PROGRESS meeting."""
    resp = admin_client.post(
        f"{BASE}{inprogress_meeting.pk}/resolutions/",
        data={"text": "We resolve to improve port throughput by 15%."},
        format="json",
    )
    assert_status(resp, 201)
    return Resolution.objects.get(pk=resp.json()["id"])


def _task_payload(assignee_id, title="Action item", due_date=None):
    return {
        "title":       title,
        "assignee_id": str(assignee_id),
        "due_date":    str(due_date or TOMORROW),
    }


# ---------------------------------------------------------------------------
# 1. Full lifecycle
# ---------------------------------------------------------------------------

class TestMeetingLifecycle:
    """
    Walk a meeting through its entire lifecycle end-to-end, verifying each
    step returns the expected status code and the meeting/resolution/task
    model state evolves correctly.
    """

    def test_full_lifecycle(
        self,
        admin_client,
        staff_user,
        admin_user,
        tenant,
        site,
        assert_status,
    ):
        # Step 1 — create meeting → 201, status=DRAFT
        resp = admin_client.post(
            BASE,
            data={
                "title":        "Harbour Board Q2",
                "scheduled_at": SCHEDULED_AT,
                "site_id":      str(site.pk),
            },
            format="json",
        )
        assert_status(resp, 201)
        data = resp.json()
        assert data["status"] == "DRAFT"
        meeting_id = data["id"]

        # Step 2 — add first agenda item → 201
        resp = admin_client.post(
            f"{BASE}{meeting_id}/agenda/",
            data={"title": "Port congestion review", "description": "Discuss Q2 throughput."},
            format="json",
        )
        assert_status(resp, 201)
        item1_id = resp.json()["id"]

        # Step 3 — add second agenda item → 201
        resp = admin_client.post(
            f"{BASE}{meeting_id}/agenda/",
            data={"title": "Safety inspections", "description": ""},
            format="json",
        )
        assert_status(resp, 201)
        item2_id = resp.json()["id"]
        assert item1_id != item2_id
        assert AgendaItem.objects.filter(meeting_id=meeting_id).count() == 2

        # Step 4 — schedule meeting → 200, status=SCHEDULED
        resp = admin_client.post(f"{BASE}{meeting_id}/schedule/")
        assert_status(resp, 200)
        assert resp.json()["status"] == "SCHEDULED"

        # Step 5 — start meeting → 200, status=IN_PROGRESS
        resp = admin_client.post(f"{BASE}{meeting_id}/start/")
        assert_status(resp, 200)
        assert resp.json()["status"] == "IN_PROGRESS"

        # Step 6 — record staff_user attendance IN_PERSON → 201
        resp = admin_client.post(
            f"{BASE}{meeting_id}/attendance/",
            data={"user_id": str(staff_user.pk), "method": "IN_PERSON"},
            format="json",
        )
        assert_status(resp, 201)
        assert resp.json()["method"] == "IN_PERSON"

        # Step 7 — record admin_user attendance MATERIAL_ONLY → 201
        resp = admin_client.post(
            f"{BASE}{meeting_id}/attendance/",
            data={"user_id": str(admin_user.pk), "method": "MATERIAL_ONLY"},
            format="json",
        )
        assert_status(resp, 201)
        assert MeetingAttendance.objects.filter(meeting_id=meeting_id).count() == 2

        # Step 8 — write minutes → 200
        minutes_text = "Meeting opened at 10:00. All agenda items discussed."
        resp = admin_client.put(
            f"{BASE}{meeting_id}/minutes/",
            data={"content": minutes_text},
            format="json",
        )
        assert_status(resp, 200)

        # Step 9 — read minutes back → 200, content matches
        resp = admin_client.get(f"{BASE}{meeting_id}/minutes/")
        assert_status(resp, 200)
        assert resp.json()["content"] == minutes_text

        # Step 10 — create resolution → 201, status=OPEN
        resp = admin_client.post(
            f"{BASE}{meeting_id}/resolutions/",
            data={"text": "We resolve to increase crane capacity by Q4."},
            format="json",
        )
        assert_status(resp, 201)
        res_data = resp.json()
        assert res_data["status"] == "OPEN"
        resolution_id = res_data["id"]

        # Step 11 — create first task → 201, status=TODO
        resp = admin_client.post(
            f"/api/v1/meetings/resolutions/{resolution_id}/create-task/",
            data=_task_payload(staff_user.pk, "Draft RFP", TOMORROW),
            format="json",
        )
        assert_status(resp, 201)
        task1_data = resp.json()
        assert task1_data["status"] == "TODO"
        task1_id = task1_data["id"]

        # Resolution stays OPEN until a task status is transitioned
        resolution = Resolution.objects.get(pk=resolution_id)
        assert resolution.status == Resolution.Status.OPEN

        # Step 12 — create second task → 201
        resp = admin_client.post(
            f"/api/v1/meetings/resolutions/{resolution_id}/create-task/",
            data=_task_payload(admin_user.pk, "Procure funding", TOMORROW),
            format="json",
        )
        assert_status(resp, 201)
        task2_id = resp.json()["id"]

        # Step 13 — mark first task DONE → 200; resolution still IN_PROGRESS (task2 TODO)
        resp = admin_client.patch(
            f"/api/v1/meetings/tasks/{task1_id}/",
            data={"status": "DONE"},
            format="json",
        )
        assert_status(resp, 200)
        resolution.refresh_from_db()
        assert resolution.status == Resolution.Status.IN_PROGRESS

        # Step 14 — mark second task DONE → 200; resolution → COMPLETED
        resp = admin_client.patch(
            f"/api/v1/meetings/tasks/{task2_id}/",
            data={"status": "DONE"},
            format="json",
        )
        assert_status(resp, 200)
        resolution.refresh_from_db()
        assert resolution.status == Resolution.Status.COMPLETED

        # Step 15 — complete meeting → 200, status=COMPLETED
        resp = admin_client.post(f"{BASE}{meeting_id}/complete/")
        assert_status(resp, 200)
        assert resp.json()["status"] == "COMPLETED"


# ---------------------------------------------------------------------------
# 2. Schedule validation
# ---------------------------------------------------------------------------

class TestScheduleValidation:
    def test_schedule_with_zero_agenda_items_returns_422(
        self, admin_client, meeting, assert_status
    ):
        # No agenda items added — scheduling must fail
        resp = admin_client.post(f"{BASE}{meeting.pk}/schedule/")
        assert_status(resp, 422)

        meeting.refresh_from_db()
        assert meeting.status == Meeting.Status.DRAFT


# ---------------------------------------------------------------------------
# 3. Invalid state transitions
# ---------------------------------------------------------------------------

class TestInvalidTransitions:
    def test_draft_to_inprogress_skipping_scheduled_returns_422(
        self, admin_client, meeting, assert_status
    ):
        resp = admin_client.post(f"{BASE}{meeting.pk}/start/")
        assert_status(resp, 422)

    def test_draft_to_completed_returns_422(
        self, admin_client, meeting, assert_status
    ):
        resp = admin_client.post(f"{BASE}{meeting.pk}/complete/")
        assert_status(resp, 422)

    def test_completed_to_cancelled_returns_422(
        self, admin_client, inprogress_meeting, assert_status
    ):
        # Move to COMPLETED first
        resp = admin_client.post(f"{BASE}{inprogress_meeting.pk}/complete/")
        assert_status(resp, 200)

        # Attempt CANCELLED from COMPLETED → 422
        resp = admin_client.post(f"{BASE}{inprogress_meeting.pk}/cancel/")
        assert_status(resp, 422)

    def test_cancelled_to_scheduled_returns_422(
        self, admin_client, meeting, assert_status
    ):
        # Cancel from DRAFT (allowed)
        resp = admin_client.post(f"{BASE}{meeting.pk}/cancel/")
        assert_status(resp, 200)

        # Attempt re-schedule from CANCELLED → 422
        resp = admin_client.post(f"{BASE}{meeting.pk}/schedule/")
        assert_status(resp, 422)


# ---------------------------------------------------------------------------
# 4. Resolution creation permission by meeting status
# ---------------------------------------------------------------------------

class TestResolutionPermissions:
    def test_resolution_on_draft_meeting_returns_422(
        self, admin_client, meeting, assert_status
    ):
        resp = admin_client.post(
            f"{BASE}{meeting.pk}/resolutions/",
            data={"text": "Some resolution."},
            format="json",
        )
        assert_status(resp, 422)

    def test_resolution_on_scheduled_meeting_returns_422(
        self, admin_client, scheduled_meeting, assert_status
    ):
        resp = admin_client.post(
            f"{BASE}{scheduled_meeting.pk}/resolutions/",
            data={"text": "Some resolution."},
            format="json",
        )
        assert_status(resp, 422)

    def test_resolution_on_inprogress_meeting_returns_201(
        self, admin_client, inprogress_meeting, assert_status
    ):
        resp = admin_client.post(
            f"{BASE}{inprogress_meeting.pk}/resolutions/",
            data={"text": "We resolve to act."},
            format="json",
        )
        assert_status(resp, 201)
        assert resp.json()["status"] == "OPEN"


# ---------------------------------------------------------------------------
# 5. Resolution auto-status from task states
# ---------------------------------------------------------------------------

class TestResolutionAutoStatus:
    def test_resolution_transitions_to_completed_when_all_tasks_done(
        self, admin_client, resolution, staff_user, admin_user, assert_status
    ):
        resolution_id = str(resolution.pk)

        # Create two tasks (both TODO)
        resp1 = admin_client.post(
            f"/api/v1/meetings/resolutions/{resolution_id}/create-task/",
            data=_task_payload(staff_user.pk, "Task A"),
            format="json",
        )
        assert_status(resp1, 201)
        task_a = resp1.json()["id"]

        resp2 = admin_client.post(
            f"/api/v1/meetings/resolutions/{resolution_id}/create-task/",
            data=_task_payload(admin_user.pk, "Task B"),
            format="json",
        )
        assert_status(resp2, 201)
        task_b = resp2.json()["id"]

        # Resolution stays OPEN until a task transitions; mark task A done first
        resolution.refresh_from_db()
        assert resolution.status == Resolution.Status.OPEN

        # Mark task A done → resolution becomes IN_PROGRESS (task B still TODO)
        resp = admin_client.patch(
            f"/api/v1/meetings/tasks/{task_a}/",
            data={"status": "DONE"},
            format="json",
        )
        assert_status(resp, 200)
        resolution.refresh_from_db()
        assert resolution.status == Resolution.Status.IN_PROGRESS

        # Mark task B done → COMPLETED
        resp = admin_client.patch(
            f"/api/v1/meetings/tasks/{task_b}/",
            data={"status": "DONE"},
            format="json",
        )
        assert_status(resp, 200)
        resolution.refresh_from_db()
        assert resolution.status == Resolution.Status.COMPLETED

    def test_resolution_cancelled_when_all_tasks_cancelled(
        self, admin_client, resolution, staff_user, admin_user, assert_status
    ):
        resolution_id = str(resolution.pk)

        resp1 = admin_client.post(
            f"/api/v1/meetings/resolutions/{resolution_id}/create-task/",
            data=_task_payload(staff_user.pk, "Cancel me A"),
            format="json",
        )
        assert_status(resp1, 201)
        task_a = resp1.json()["id"]

        resp2 = admin_client.post(
            f"/api/v1/meetings/resolutions/{resolution_id}/create-task/",
            data=_task_payload(admin_user.pk, "Cancel me B"),
            format="json",
        )
        assert_status(resp2, 201)
        task_b = resp2.json()["id"]

        admin_client.patch(
            f"/api/v1/meetings/tasks/{task_a}/",
            data={"status": "CANCELLED"},
            format="json",
        )
        admin_client.patch(
            f"/api/v1/meetings/tasks/{task_b}/",
            data={"status": "CANCELLED"},
            format="json",
        )

        resolution.refresh_from_db()
        assert resolution.status == Resolution.Status.CANCELLED


# ---------------------------------------------------------------------------
# 6. Task overdue behaviour
# ---------------------------------------------------------------------------

class TestTaskOverdue:
    def _create_overdue_task(self, admin_client, resolution, staff_user, assert_status):
        """Helper: create a task with yesterday's due_date and mark it OVERDUE."""
        resp = admin_client.post(
            f"/api/v1/meetings/resolutions/{resolution.pk}/create-task/",
            data=_task_payload(staff_user.pk, "Overdue task", YESTERDAY),
            format="json",
        )
        assert_status(resp, 201)
        task = Task.objects.get(pk=resp.json()["id"])
        return task

    def test_mark_overdue_classmethod_transitions_past_due_tasks(
        self, admin_client, resolution, staff_user, assert_status
    ):
        task = self._create_overdue_task(admin_client, resolution, staff_user, assert_status)
        assert task.status == Task.Status.TODO

        count = Task.mark_overdue()
        assert count >= 1

        task.refresh_from_db()
        assert task.status == Task.Status.OVERDUE

    def test_overdue_task_can_recover_to_inprogress(
        self, admin_client, resolution, staff_user, assert_status
    ):
        task = self._create_overdue_task(admin_client, resolution, staff_user, assert_status)
        Task.mark_overdue()
        task.refresh_from_db()
        assert task.status == Task.Status.OVERDUE

        resp = admin_client.patch(
            f"/api/v1/meetings/tasks/{task.pk}/",
            data={"status": "IN_PROGRESS"},
            format="json",
        )
        assert_status(resp, 200)
        task.refresh_from_db()
        assert task.status == Task.Status.IN_PROGRESS

    def test_overdue_task_can_transition_to_done(
        self, admin_client, resolution, staff_user, assert_status
    ):
        task = self._create_overdue_task(admin_client, resolution, staff_user, assert_status)
        Task.mark_overdue()

        resp = admin_client.patch(
            f"/api/v1/meetings/tasks/{task.pk}/",
            data={"status": "DONE"},
            format="json",
        )
        assert_status(resp, 200)
        task.refresh_from_db()
        assert task.status == Task.Status.DONE

    def test_overdue_task_can_transition_to_cancelled(
        self, admin_client, resolution, staff_user, assert_status
    ):
        task = self._create_overdue_task(admin_client, resolution, staff_user, assert_status)
        Task.mark_overdue()

        resp = admin_client.patch(
            f"/api/v1/meetings/tasks/{task.pk}/",
            data={"status": "CANCELLED"},
            format="json",
        )
        assert_status(resp, 200)
        task.refresh_from_db()
        assert task.status == Task.Status.CANCELLED


# ---------------------------------------------------------------------------
# 7. Invalid task transitions
# ---------------------------------------------------------------------------

class TestInvalidTaskTransitions:
    def _make_task(self, admin_client, resolution, staff_user, assert_status):
        resp = admin_client.post(
            f"/api/v1/meetings/resolutions/{resolution.pk}/create-task/",
            data=_task_payload(staff_user.pk),
            format="json",
        )
        assert_status(resp, 201)
        return Task.objects.get(pk=resp.json()["id"])

    def test_done_to_inprogress_returns_422(
        self, admin_client, resolution, staff_user, assert_status
    ):
        task = self._make_task(admin_client, resolution, staff_user, assert_status)
        # Mark DONE
        admin_client.patch(
            f"/api/v1/meetings/tasks/{task.pk}/",
            data={"status": "DONE"},
            format="json",
        )
        # Attempt rollback to IN_PROGRESS
        resp = admin_client.patch(
            f"/api/v1/meetings/tasks/{task.pk}/",
            data={"status": "IN_PROGRESS"},
            format="json",
        )
        assert_status(resp, 422)

    def test_done_to_todo_returns_422(
        self, admin_client, resolution, staff_user, assert_status
    ):
        task = self._make_task(admin_client, resolution, staff_user, assert_status)
        admin_client.patch(
            f"/api/v1/meetings/tasks/{task.pk}/",
            data={"status": "DONE"},
            format="json",
        )
        resp = admin_client.patch(
            f"/api/v1/meetings/tasks/{task.pk}/",
            data={"status": "TODO"},
            format="json",
        )
        assert_status(resp, 422)

    def test_cancelled_to_todo_returns_422(
        self, admin_client, resolution, staff_user, assert_status
    ):
        task = self._make_task(admin_client, resolution, staff_user, assert_status)
        admin_client.patch(
            f"/api/v1/meetings/tasks/{task.pk}/",
            data={"status": "CANCELLED"},
            format="json",
        )
        resp = admin_client.patch(
            f"/api/v1/meetings/tasks/{task.pk}/",
            data={"status": "TODO"},
            format="json",
        )
        assert_status(resp, 422)


# ---------------------------------------------------------------------------
# 8. Attachment validation
# ---------------------------------------------------------------------------

class TestAttachmentValidation:
    def _make_file(self, name, content=b"data"):
        """Build a minimal in-memory upload."""
        f = io.BytesIO(content)
        f.name = name
        f.seek(0)
        return f

    def test_disallowed_extension_returns_422(
        self, admin_client, meeting, assert_status
    ):
        resp = admin_client.post(
            f"{BASE}{meeting.pk}/agenda/",
            data={
                "title": "Malware item",
                "file":  self._make_file("payload.exe"),
            },
            format="multipart",
        )
        assert_status(resp, 422)

    def test_pdf_attachment_accepted(
        self, admin_client, meeting, assert_status
    ):
        resp = admin_client.post(
            f"{BASE}{meeting.pk}/agenda/",
            data={
                "title": "Policy document",
                "file":  self._make_file("policy.pdf", b"%PDF-1.4 minimal"),
            },
            format="multipart",
        )
        assert_status(resp, 201)
        assert resp.json()["attachment_path"] is not None

    def test_eleventh_attachment_returns_422(
        self, admin_client, meeting, assert_status
    ):
        # Add 10 agenda items each with a PDF attachment (the max)
        for i in range(10):
            resp = admin_client.post(
                f"{BASE}{meeting.pk}/agenda/",
                data={
                    "title": f"Item {i}",
                    "file":  self._make_file(f"doc_{i}.pdf", b"%PDF"),
                },
                format="multipart",
            )
            assert_status(resp, 201)

        # The 11th attachment must be rejected
        resp = admin_client.post(
            f"{BASE}{meeting.pk}/agenda/",
            data={
                "title": "One too many",
                "file":  self._make_file("overflow.pdf", b"%PDF"),
            },
            format="multipart",
        )
        assert_status(resp, 422)

    def test_safe_filename_stored_as_uuid(
        self, admin_client, meeting, assert_status
    ):
        """The server-side filename must never mirror the client-supplied name."""
        resp = admin_client.post(
            f"{BASE}{meeting.pk}/agenda/",
            data={
                "title": "Named upload",
                "file":  self._make_file("my_secret_doc.pdf", b"%PDF-1.4"),
            },
            format="multipart",
        )
        assert_status(resp, 201)
        stored_path = resp.json()["attachment_path"]
        # The original client filename must not appear in the stored path
        assert "my_secret_doc" not in stored_path
        # Stored filename should be a hex UUID (32 hex chars + extension)
        import re
        assert re.search(r"[0-9a-f]{32}\.pdf$", stored_path)


# ---------------------------------------------------------------------------
# 9. Courier access restrictions
# ---------------------------------------------------------------------------

class TestCourierAccess:
    def test_courier_cannot_list_meetings(
        self, courier_client, assert_status
    ):
        resp = courier_client.get(BASE)
        assert_status(resp, 403)

    def test_courier_cannot_create_meeting(
        self, courier_client, assert_status
    ):
        resp = courier_client.post(
            BASE,
            data={"title": "Hijack meeting", "scheduled_at": SCHEDULED_AT},
            format="json",
        )
        assert_status(resp, 403)

    def test_courier_cannot_record_attendance(
        self, courier_client, meeting, staff_user, assert_status
    ):
        resp = courier_client.post(
            f"{BASE}{meeting.pk}/attendance/",
            data={"user_id": str(staff_user.pk), "method": "IN_PERSON"},
            format="json",
        )
        assert_status(resp, 403)


# ---------------------------------------------------------------------------
# 10. Audit trail
# ---------------------------------------------------------------------------

class TestAuditTrail:
    def test_create_meeting_writes_audit_log(
        self, admin_client, site, assert_status
    ):
        resp = admin_client.post(
            BASE,
            data={
                "title":        "Audit test meeting",
                "scheduled_at": SCHEDULED_AT,
                "site_id":      str(site.pk),
            },
            format="json",
        )
        assert_status(resp, 201)
        meeting_id = resp.json()["id"]

        log = AuditLog.objects.filter(
            entity_type="Meeting",
            entity_id=meeting_id,
            action=AuditLog.Action.CREATE,
        ).first()
        assert log is not None, "Expected an AuditLog CREATE entry for the new meeting."

    def test_status_transition_writes_audit_log_with_diff(
        self, admin_client, meeting, assert_status
    ):
        # Add an agenda item so we can schedule
        admin_client.post(
            f"{BASE}{meeting.pk}/agenda/",
            data={"title": "Agenda", "description": ""},
            format="json",
        )
        resp = admin_client.post(f"{BASE}{meeting.pk}/schedule/")
        assert_status(resp, 200)

        log = AuditLog.objects.filter(
            entity_type="Meeting",
            entity_id=str(meeting.pk),
            action=AuditLog.Action.UPDATE,
        ).first()
        assert log is not None
        assert "old_status" in log.diff_json
        assert "new_status" in log.diff_json
        assert log.diff_json["old_status"] == "DRAFT"
        assert log.diff_json["new_status"] == "SCHEDULED"

    def test_task_transition_writes_audit_log(
        self, admin_client, resolution, staff_user, assert_status
    ):
        resp = admin_client.post(
            f"/api/v1/meetings/resolutions/{resolution.pk}/create-task/",
            data=_task_payload(staff_user.pk),
            format="json",
        )
        assert_status(resp, 201)
        task_id = resp.json()["id"]

        admin_client.patch(
            f"/api/v1/meetings/tasks/{task_id}/",
            data={"status": "IN_PROGRESS"},
            format="json",
        )

        log = AuditLog.objects.filter(
            entity_type="Task",
            entity_id=task_id,
            action=AuditLog.Action.UPDATE,
        ).first()
        assert log is not None
        assert log.diff_json["old_status"] == "TODO"
        assert log.diff_json["new_status"] == "IN_PROGRESS"


# ---------------------------------------------------------------------------
# 11. Agenda frozen after IN_PROGRESS
# ---------------------------------------------------------------------------

class TestAgendaFrozen:
    def test_add_agenda_item_to_inprogress_meeting_returns_422(
        self, admin_client, inprogress_meeting, assert_status
    ):
        resp = admin_client.post(
            f"{BASE}{inprogress_meeting.pk}/agenda/",
            data={"title": "Late addition", "description": ""},
            format="json",
        )
        assert_status(resp, 422)

    def test_patch_agenda_item_on_inprogress_meeting_returns_422(
        self, admin_client, inprogress_meeting, assert_status
    ):
        # Retrieve the existing item created during scheduling fixture
        item = AgendaItem.objects.filter(meeting=inprogress_meeting).first()
        assert item is not None, "Expected at least one agenda item from scheduled_meeting fixture."

        resp = admin_client.patch(
            f"{BASE}{inprogress_meeting.pk}/agenda/{item.pk}/",
            data={"title": "Sneaky rename"},
            format="json",
        )
        assert_status(resp, 422)

    def test_delete_agenda_item_on_inprogress_meeting_returns_422(
        self, admin_client, inprogress_meeting, assert_status
    ):
        item = AgendaItem.objects.filter(meeting=inprogress_meeting).first()
        assert item is not None

        resp = admin_client.delete(
            f"{BASE}{inprogress_meeting.pk}/agenda/{item.pk}/",
        )
        assert_status(resp, 422)


# ---------------------------------------------------------------------------
# 12. My tasks view
# ---------------------------------------------------------------------------

class TestMyTasksView:
    TASKS_MINE = "/api/v1/meetings/tasks/mine/"

    def _create_task_for_staff(
        self, admin_client, resolution, staff_user, assert_status, title="My task"
    ):
        resp = admin_client.post(
            f"/api/v1/meetings/resolutions/{resolution.pk}/create-task/",
            data=_task_payload(staff_user.pk, title),
            format="json",
        )
        assert_status(resp, 201)
        return resp.json()["id"]

    def test_staff_sees_own_task_in_mine_list(
        self, admin_client, staff_client, resolution, staff_user, assert_status
    ):
        task_id = self._create_task_for_staff(
            admin_client, resolution, staff_user, assert_status
        )
        resp = staff_client.get(self.TASKS_MINE)
        assert_status(resp, 200)
        ids = [t["id"] for t in resp.json()["results"]]
        assert task_id in ids

    def test_filter_by_status_todo_includes_task(
        self, admin_client, staff_client, resolution, staff_user, assert_status
    ):
        task_id = self._create_task_for_staff(
            admin_client, resolution, staff_user, assert_status
        )
        resp = staff_client.get(self.TASKS_MINE, {"status": "TODO"})
        assert_status(resp, 200)
        ids = [t["id"] for t in resp.json()["results"]]
        assert task_id in ids

    def test_filter_by_status_done_excludes_todo_task(
        self, admin_client, staff_client, resolution, staff_user, assert_status
    ):
        task_id = self._create_task_for_staff(
            admin_client, resolution, staff_user, assert_status
        )
        resp = staff_client.get(self.TASKS_MINE, {"status": "DONE"})
        assert_status(resp, 200)
        ids = [t["id"] for t in resp.json()["results"]]
        assert task_id not in ids

    def test_admin_task_not_visible_in_staff_mine(
        self, admin_client, staff_client, resolution, admin_user, staff_user, assert_status
    ):
        # Create a task assigned to admin_user (not staff_user)
        resp = admin_client.post(
            f"/api/v1/meetings/resolutions/{resolution.pk}/create-task/",
            data=_task_payload(admin_user.pk, "Admin-only task"),
            format="json",
        )
        assert_status(resp, 201)
        admin_task_id = resp.json()["id"]

        resp = staff_client.get(self.TASKS_MINE)
        assert_status(resp, 200)
        ids = [t["id"] for t in resp.json()["results"]]
        assert admin_task_id not in ids
