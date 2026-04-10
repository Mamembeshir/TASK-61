import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckSquare, RefreshCw, ExternalLink, AlertTriangle } from "lucide-react";
import { meetingApi, type MeetingTask, type TaskStatus } from "@/api/meetings";
import {
  PageHeader, Button, Card, Table, Tr, Td, Badge, EmptyState,
  SkeletonTable, AlertBanner,
} from "@/components/ui";
import { selectStyle } from "@/styles/forms";
import { colors, font, radius, taskStatusColors } from "@/styles/tokens";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const cfg = taskStatusColors[status] ?? { bg: colors.gray200, text: colors.gray700, label: status };
  return <Badge bg={cfg.bg} text={cfg.text} label={cfg.label} dot size="sm" />;
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
    <Tr>
      {/* Meeting link */}
      <Td>
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/meetings/${task.resolution_id}`); }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            background: "none",
            border: "none",
            color: colors.primary,
            cursor: "pointer",
            padding: 0,
            fontSize: font.size.sm,
            fontWeight: font.weight.medium,
            fontFamily: font.family,
          }}
          title="Go to meeting"
        >
          View
          <ExternalLink size={12} />
        </button>
      </Td>

      {/* Task title */}
      <Td style={{ fontWeight: font.weight.medium, color: colors.text }}>
        {task.title}
      </Td>

      {/* Assignee */}
      <Td style={{ color: colors.textSecondary, fontSize: font.size.sm }}>
        {task.assignee_username}
      </Td>

      {/* Due date */}
      <Td style={{
        color: isOverdue ? colors.dangerDark : colors.textMuted,
        fontWeight: isOverdue ? font.weight.semibold : undefined,
        fontSize: font.size.sm,
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
      }}>
        {task.due_date ? fmtDate(task.due_date) : "—"}
      </Td>

      {/* Status badge */}
      <Td><TaskStatusBadge status={task.status} /></Td>

      {/* Status update dropdown */}
      <Td>
        {task.allowed_transitions.length > 0 ? (
          <select
            value={task.status}
            onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
            onClick={(e) => e.stopPropagation()}
            disabled={updating}
            style={{
              ...selectStyle,
              width: "auto",
              minWidth: 130,
              opacity: updating ? 0.6 : 1,
            }}
          >
            <option value={task.status} disabled>{task.status.replace("_", " ")}</option>
            {task.allowed_transitions.map((t) => (
              <option key={t} value={t}>{t.replace("_", " ")}</option>
            ))}
          </select>
        ) : (
          <span style={{ color: colors.textMuted, fontSize: font.size.sm }}>—</span>
        )}
      </Td>

      {/* Progress notes */}
      <Td style={{ maxWidth: 240 }}>
        {task.progress_notes ? (
          <span
            title={task.progress_notes}
            style={{
              fontSize: font.size.sm,
              color: colors.textSecondary,
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 240,
            }}
          >
            {task.progress_notes}
          </span>
        ) : (
          <span style={{ color: colors.textMuted, fontSize: font.size.sm }}>—</span>
        )}
      </Td>
    </Tr>
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
    <div>
      <PageHeader
        title="My Tasks"
        subtitle={loading
          ? "Loading tasks…"
          : `${tasks.length} task${tasks.length === 1 ? "" : "s"} assigned to you`}
        icon={<CheckSquare size={22} />}
        actions={
          <Button
            variant="secondary"
            onClick={load}
            loading={loading}
            icon={<RefreshCw size={15} />}
          >
            Refresh
          </Button>
        }
      />

      {/* Overdue banner */}
      {overdueCount > 0 && !loading && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.7rem",
          padding: "12px 16px",
          background: colors.dangerSoft,
          border: `1px solid ${colors.dangerLight}`,
          borderLeft: `3px solid ${colors.danger}`,
          borderRadius: radius.md,
          color: colors.dangerDark,
          fontSize: font.size.base,
          fontWeight: font.weight.medium,
          marginBottom: "1.15rem",
        }}>
          <AlertTriangle size={16} />
          {overdueCount} overdue task{overdueCount !== 1 ? "s" : ""} — needs attention.
        </div>
      )}

      {/* Filters */}
      <Card padding="1rem 1.15rem" style={{ marginBottom: "1.15rem" }}>
        <div style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ ...selectStyle, width: "auto", minWidth: 160 }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {statusFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStatusFilter("")}
            >
              Clear filter
            </Button>
          )}
        </div>
      </Card>

      {error && <AlertBanner type="error" message={error} onClose={() => setError(null)} />}

      {/* Table */}
      {loading ? (
        <SkeletonTable rows={6} cols={7} />
      ) : tasks.length === 0 ? (
        <Card padding="0">
          <EmptyState
            icon="✓"
            title={statusFilter ? `No ${statusFilter.toLowerCase().replace("_", " ")} tasks` : "You're all caught up"}
            description={statusFilter
              ? "Try clearing the filter to see other tasks."
              : "You have no tasks assigned to you right now."}
          />
        </Card>
      ) : (
        <Table columns={["Meeting", "Task", "Assignee", "Due Date", "Status", "Update Status", "Progress Notes"]}>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} onUpdated={handleTaskUpdated} />
          ))}
        </Table>
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
