import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { meetingApi, type MeetingTask, type TaskStatus } from "@/api/meetings";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const cfg: Record<TaskStatus, { bg: string; color: string; label: string }> = {
    TODO:        { bg: "#e2e3e5", color: "#41464b", label: "To Do" },
    IN_PROGRESS: { bg: "#cfe2ff", color: "#084298", label: "In Progress" },
    DONE:        { bg: "#d1e7dd", color: "#0f5132", label: "Done" },
    OVERDUE:     { bg: "#f8d7da", color: "#842029", label: "Overdue" },
    CANCELLED:   { bg: "#f0f0f0", color: "#6c757d", label: "Cancelled" },
  };
  const c = cfg[status] ?? { bg: "#e2e3e5", color: "#41464b", label: status };
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: "12px",
      fontSize: "0.75rem", fontWeight: 600, background: c.bg, color: c.color,
      letterSpacing: "0.03em",
    }}>
      {c.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Task row (with inline status update)
// ---------------------------------------------------------------------------
interface TaskRowProps {
  task: MeetingTask;
  onUpdated: (updated: MeetingTask) => void;
}

function TaskRow({ task, onUpdated }: TaskRowProps) {
  const navigate = useNavigate();
  const [updating, setUpdating] = useState(false);
  const isOverdue = task.status === "OVERDUE";

  async function handleStatusChange(newStatus: TaskStatus) {
    setUpdating(true);
    try {
      const updated = await meetingApi.tasks.update(task.id, { status: newStatus });
      onUpdated(updated);
    } catch (err: any) {
      alert(err.message ?? "Failed to update status.");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <tr style={{
      borderBottom: "1px solid #dee2e6",
      background: isOverdue ? "#fff5f5" : undefined,
    }}>
      {/* Meeting link */}
      <td style={td}>
        <button
          onClick={() => navigate(`/meetings/${task.resolution_id}`)}
          style={{ background: "none", border: "none", color: "#0d6efd", cursor: "pointer", padding: 0, fontSize: "0.87rem", textDecoration: "underline", textAlign: "left" }}
          title="Go to meeting"
        >
          View Meeting
        </button>
      </td>

      {/* Task title */}
      <td style={{ ...td, fontWeight: 500 }}>{task.title}</td>

      {/* Assignee */}
      <td style={{ ...td, color: "#495057" }}>{task.assignee_username}</td>

      {/* Due date */}
      <td style={{ ...td, color: isOverdue ? "#842029" : "#6c757d", fontWeight: isOverdue ? 600 : undefined }}>
        {task.due_date ? fmtDate(task.due_date) : "—"}
      </td>

      {/* Status badge */}
      <td style={td}><TaskStatusBadge status={task.status} /></td>

      {/* Status update dropdown */}
      <td style={td}>
        {task.allowed_transitions.length > 0 ? (
          <select
            value={task.status}
            onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
            disabled={updating}
            style={{
              padding: "5px 8px", border: "1px solid #ced4da", borderRadius: "5px",
              fontSize: "0.82rem", cursor: "pointer", background: "#fff",
              opacity: updating ? 0.6 : 1,
            }}
          >
            <option value={task.status} disabled>{task.status.replace("_", " ")}</option>
            {task.allowed_transitions.map((t) => (
              <option key={t} value={t}>{t.replace("_", " ")}</option>
            ))}
          </select>
        ) : (
          <span style={{ color: "#adb5bd", fontSize: "0.82rem" }}>—</span>
        )}
      </td>

      {/* Progress notes */}
      <td style={{ ...td, maxWidth: "220px" }}>
        {task.progress_notes ? (
          <span
            title={task.progress_notes}
            style={{ fontSize: "0.83rem", color: "#495057" }}
          >
            {task.progress_notes.length > 80
              ? task.progress_notes.slice(0, 80) + "…"
              : task.progress_notes}
          </span>
        ) : (
          <span style={{ color: "#adb5bd", fontSize: "0.82rem" }}>—</span>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Status filter options
// ---------------------------------------------------------------------------
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "",            label: "All Statuses" },
  { value: "TODO",        label: "To Do" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "DONE",        label: "Done" },
  { value: "OVERDUE",     label: "Overdue" },
  { value: "CANCELLED",   label: "Cancelled" },
];

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function MyTasksPage() {
  const [tasks,        setTasks]        = useState<MeetingTask[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      const data = await meetingApi.tasks.mine(params);
      setTasks(data);
    } catch (err: any) {
      setError(err.message ?? "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleTaskUpdated(updated: MeetingTask) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  const overdueCount = tasks.filter((t) => t.status === "OVERDUE").length;

  return (
    <div style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif", maxWidth: "1200px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <div style={{ flexGrow: 1 }}>
          <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>My Tasks</h2>
          {overdueCount > 0 && (
            <div style={{ marginTop: "4px", fontSize: "0.83rem", color: "#842029", fontWeight: 500 }}>
              {overdueCount} overdue task{overdueCount !== 1 ? "s" : ""}
            </div>
          )}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={filterSelect}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button onClick={load} style={outlineBtn} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: "2rem", color: "#6c757d" }}>Loading tasks…</div>
      ) : error ? (
        <div style={{ padding: "1rem", background: "#f8d7da", color: "#842029", borderRadius: "6px" }}>
          {error}
        </div>
      ) : tasks.length === 0 ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "#6c757d" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>✓</div>
          {statusFilter
            ? `No tasks with status "${statusFilter}".`
            : "You have no tasks assigned to you."}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #dee2e6" }}>
                <th style={th}>Meeting</th>
                <th style={th}>Task</th>
                <th style={th}>Assignee</th>
                <th style={th}>Due Date</th>
                <th style={th}>Status</th>
                <th style={th}>Update Status</th>
                <th style={th}>Progress Notes</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} onUpdated={handleTaskUpdated} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch { return iso; }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const outlineBtn: React.CSSProperties = {
  padding: "7px 14px", background: "#fff", color: "#0d6efd",
  border: "1px solid #0d6efd", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem",
};
const filterSelect: React.CSSProperties = {
  padding: "7px 10px", border: "1px solid #ced4da", borderRadius: "6px",
  fontSize: "0.85rem", background: "#fff", cursor: "pointer", minWidth: "140px",
};
const th: React.CSSProperties = {
  padding: "8px 14px", fontWeight: 600, fontSize: "0.78rem", color: "#495057",
  textTransform: "uppercase", textAlign: "left",
};
const td: React.CSSProperties = { padding: "10px 14px", verticalAlign: "middle" };
