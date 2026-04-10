/**
 * Meetings API client — meetings, agenda, attendance, minutes, resolutions, tasks.
 */
import apiClient from "@/api/client";

// ---------------------------------------------------------------------------
// Enums / union types
// ---------------------------------------------------------------------------
export type MeetingStatus    = "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type ResolutionStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type TaskStatus       = "TODO" | "IN_PROGRESS" | "DONE" | "OVERDUE" | "CANCELLED";
export type AttendanceMethod = "IN_PERSON" | "MATERIAL_ONLY";
export type DeliveryType     = "PICKUP" | "DROP";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
export interface MeetingTask {
  id: string;
  resolution_id: string;
  title: string;
  assignee_id: string;
  assignee_username: string;
  due_date: string;
  status: TaskStatus;
  allowed_transitions: TaskStatus[];
  progress_notes: string;
  completed_at: string | null;
  delivery_type: DeliveryType | null;
  pickup_location: string | null;
  drop_location: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingResolution {
  id: string;
  meeting_id: string;
  agenda_item_id: string | null;
  text: string;
  status: ResolutionStatus;
  tasks: MeetingTask[];
  created_at: string;
  updated_at: string;
}

export interface AgendaItem {
  id: string;
  meeting_id: string;
  title: string;
  description: string;
  sort_order: number;
  submitted_by_id: string;
  submitted_by_username: string;
  attachment_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface Attendance {
  id: string;
  user_id: string;
  user_username: string;
  method: AttendanceMethod;
  signed_at: string;
}

export interface Minute {
  id: string;
  meeting_id: string;
  content: string;
  updated_by_id: string;
  updated_by_username: string;
  updated_at: string;
}

export interface MeetingListItem {
  id: string;
  title: string;
  scheduled_at: string;
  status: MeetingStatus;
  site_id: string | null;
  site_name: string | null;
  resolution_count: number;
  open_task_count: number;
  created_at: string;
}

export interface MeetingDetail extends MeetingListItem {
  tenant_id: string;
  created_by_id: string;
  created_by_username: string;
  updated_at: string;
  agenda_items: AgendaItem[];
  attendances: Attendance[];
  resolutions: MeetingResolution[];
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------
export const meetingApi = {
  list: (params?: { status?: string; site_id?: string }): Promise<MeetingListItem[]> =>
    apiClient.get("meetings/meetings/", { params }).then((r) => r.data),

  get: (id: string): Promise<MeetingDetail> =>
    apiClient.get(`meetings/meetings/${id}/`).then((r) => r.data),

  create: (payload: { title: string; scheduled_at: string; site_id?: string | null }): Promise<MeetingDetail> =>
    apiClient.post("meetings/meetings/", payload).then((r) => r.data),

  update: (
    id: string,
    payload: { title?: string; scheduled_at?: string }
  ): Promise<MeetingDetail> =>
    apiClient.patch(`meetings/meetings/${id}/`, payload).then((r) => r.data),

  schedule: (id: string): Promise<MeetingDetail> =>
    apiClient.post(`meetings/meetings/${id}/schedule/`).then((r) => r.data),

  start: (id: string): Promise<MeetingDetail> =>
    apiClient.post(`meetings/meetings/${id}/start/`).then((r) => r.data),

  complete: (id: string): Promise<MeetingDetail> =>
    apiClient.post(`meetings/meetings/${id}/complete/`).then((r) => r.data),

  cancel: (id: string): Promise<MeetingDetail> =>
    apiClient.post(`meetings/meetings/${id}/cancel/`).then((r) => r.data),

  agenda: {
    list: (meetingId: string): Promise<AgendaItem[]> =>
      apiClient.get(`meetings/meetings/${meetingId}/agenda/`).then((r) => r.data),

    create: (meetingId: string, formData: FormData): Promise<AgendaItem> =>
      apiClient
        .post(`meetings/meetings/${meetingId}/agenda/`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        })
        .then((r) => r.data),

    update: (
      meetingId: string,
      itemId: string,
      payload: { title?: string; description?: string }
    ): Promise<AgendaItem> =>
      apiClient
        .patch(`meetings/meetings/${meetingId}/agenda/${itemId}/`, payload)
        .then((r) => r.data),

    delete: (meetingId: string, itemId: string): Promise<void> =>
      apiClient
        .delete(`meetings/meetings/${meetingId}/agenda/${itemId}/`)
        .then(() => undefined),
  },

  attendance: {
    list: (meetingId: string): Promise<Attendance[]> =>
      apiClient.get(`meetings/meetings/${meetingId}/attendance/`).then((r) => r.data),

    signIn: (
      meetingId: string,
      payload: { user_id: string; method: AttendanceMethod }
    ): Promise<Attendance> =>
      apiClient
        .post(`meetings/meetings/${meetingId}/attendance/`, payload)
        .then((r) => r.data),
  },

  minutes: {
    get: (meetingId: string): Promise<Minute | null> =>
      apiClient
        .get(`meetings/meetings/${meetingId}/minutes/`)
        .then((r) => r.data)
        .catch((err: any) => {
          if (err?.status === 404 || err?.response?.status === 404) return null;
          throw err;
        }),

    save: (meetingId: string, content: string): Promise<Minute> =>
      apiClient
        .put(`meetings/meetings/${meetingId}/minutes/`, { content })
        .then((r) => r.data),
  },

  resolutions: {
    list: (meetingId: string): Promise<MeetingResolution[]> =>
      apiClient.get(`meetings/meetings/${meetingId}/resolutions/`).then((r) => r.data),

    create: (
      meetingId: string,
      payload: { text: string; agenda_item_id?: string | null }
    ): Promise<MeetingResolution> =>
      apiClient
        .post(`meetings/meetings/${meetingId}/resolutions/`, payload)
        .then((r) => r.data),

    update: (
      resolutionId: string,
      payload: { text?: string }
    ): Promise<MeetingResolution> =>
      apiClient
        .patch(`meetings/resolutions/${resolutionId}/`, payload)
        .then((r) => r.data),
  },

  tasks: {
    create: (
      resolutionId: string,
      payload: {
        title: string;
        assignee_id: string;
        due_date: string;
        delivery_type?: DeliveryType | null;
        pickup_location?: string | null;
        drop_location?: string | null;
      }
    ): Promise<MeetingTask> =>
      apiClient
        .post(`meetings/resolutions/${resolutionId}/create-task/`, payload)
        .then((r) => r.data),

    update: (
      taskId: string,
      payload: { status?: TaskStatus; progress_notes?: string }
    ): Promise<MeetingTask> =>
      apiClient.patch(`meetings/tasks/${taskId}/`, payload).then((r) => r.data),

    mine: (params?: { status?: string }): Promise<MeetingTask[]> =>
      apiClient.get("meetings/tasks/mine/", { params }).then((r) => r.data),
  },
};
