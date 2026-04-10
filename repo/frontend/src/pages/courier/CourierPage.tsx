import { useState, useEffect } from "react";
import { courierApi, type CourierTask } from "@/api/courier";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function isOverdue(task: CourierTask) {
  if (task.status === "DONE" || task.status === "CANCELLED") return false;
  return new Date(task.due_date) < new Date();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: CourierTask["status"] }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    TODO:        { bg: "#e9ecef", color: "#495057", label: "To Do" },
    IN_PROGRESS: { bg: "#cfe2ff", color: "#084298", label: "In Progress" },
    DONE:        { bg: "#d1e7dd", color: "#0f5132", label: "Done" },
    OVERDUE:     { bg: "#f8d7da", color: "#842029", label: "Overdue" },
    CANCELLED:   { bg: "#e2e3e5", color: "#41464b", label: "Cancelled" },
  };
  const { bg, color, label } = cfg[status] ?? cfg.TODO;
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: "12px",
      fontSize: "0.78rem", fontWeight: 600, background: bg, color,
    }}>
      {label}
    </span>
  );
}

function TypeBadge({ type }: { type: CourierTask["delivery_type"] }) {
  const isPickup = type === "PICKUP";
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: "12px",
      fontSize: "0.78rem", fontWeight: 600,
      background: isPickup ? "#fff3cd" : "#d1e7dd",
      color: isPickup ? "#664d03" : "#0f5132",
    }}>
      {isPickup ? "📦 Pickup" : "🚚 Drop"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Task card
// ---------------------------------------------------------------------------

interface TaskCardProps {
  task: CourierTask;
  onConfirm: (id: string) => void;
  confirming: boolean;
}

function TaskCard({ task, onConfirm, confirming }: TaskCardProps) {
  const location = task.delivery_type === "PICKUP" ? task.pickup_location : task.drop_location;
  const overdue = isOverdue(task);

  return (
    <div style={{
      background: "#fff",
      borderRadius: "10px",
      boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
      padding: "1.25rem 1.5rem",
      borderLeft: `4px solid ${overdue ? "#dc3545" : task.confirmed_at ? "#198754" : "#0d6efd"}`,
      display: "flex",
      flexDirection: "column",
      gap: "0.5rem",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
        <TypeBadge type={task.delivery_type} />
        <StatusBadge status={task.status} />
        {overdue && (
          <span style={{ fontSize: "0.78rem", color: "#dc3545", fontWeight: 600 }}>
            ⚠ Overdue
          </span>
        )}
      </div>

      {/* Title */}
      <div style={{ fontSize: "1.05rem", fontWeight: 600, color: "#1a1a2e" }}>
        {task.title}
      </div>

      {/* Location */}
      {location && (
        <div style={{ fontSize: "0.88rem", color: "#495057" }}>
          📍 {location}
        </div>
      )}

      {/* Due date */}
      <div style={{ fontSize: "0.85rem", color: "#6c757d" }}>
        Due: {fmtDate(task.due_date)}
      </div>

      {/* Confirmed timestamp or button */}
      {task.confirmed_at ? (
        <div style={{
          display: "flex", alignItems: "center", gap: "0.4rem",
          fontSize: "0.85rem", color: "#198754", marginTop: "0.25rem",
        }}>
          <span style={{ fontSize: "1.1rem" }}>✅</span>
          <span>Confirmed at {fmtDateTime(task.confirmed_at)}</span>
        </div>
      ) : task.status !== "DONE" && task.status !== "CANCELLED" ? (
        <button
          onClick={() => onConfirm(task.id)}
          disabled={confirming}
          style={{
            marginTop: "0.25rem",
            alignSelf: "flex-start",
            padding: "6px 20px",
            background: confirming ? "#6c757d" : "#0d6efd",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            fontSize: "0.88rem",
            fontWeight: 600,
            cursor: confirming ? "not-allowed" : "pointer",
          }}
        >
          {confirming ? "Confirming…" : "Confirm Delivery"}
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div style={{
      background: "#fff", borderRadius: "10px",
      boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
      padding: "1.25rem 1.5rem",
      borderLeft: "4px solid #dee2e6",
    }}>
      {[70, 200, 140, 80].map((w, i) => (
        <div key={i} style={{
          height: i === 1 ? "18px" : "13px",
          width: `${w}px`,
          background: "#e9ecef",
          borderRadius: "4px",
          marginBottom: "0.6rem",
        }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CourierPage() {
  const [tasks,      setTasks]      = useState<CourierTask[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    courierApi.listTasks()
      .then(setTasks)
      .catch(() => setError("Failed to load deliveries."))
      .finally(() => setLoading(false));
  }, []);

  async function handleConfirm(id: string) {
    setConfirming(id);
    try {
      const updated = await courierApi.confirmTask(id);
      setTasks(prev => prev.map(t => t.id === id ? updated : t));
    } catch (e: any) {
      const msg = e.response?.data?.detail ?? "Failed to confirm delivery.";
      alert(msg);
    } finally {
      setConfirming(null);
    }
  }

  const pending   = tasks.filter(t => !t.confirmed_at && t.status !== "DONE" && t.status !== "CANCELLED");
  const confirmed = tasks.filter(t => t.confirmed_at);
  const done      = tasks.filter(t => !t.confirmed_at && (t.status === "DONE" || t.status === "CANCELLED"));

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{
        background: "#1a1a2e", color: "#fff",
        padding: "1rem 1.5rem",
        display: "flex", alignItems: "center", gap: "0.75rem",
      }}>
        <span style={{ fontSize: "1.3rem" }}>🚚</span>
        <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>HarborOps — My Deliveries</span>
      </div>

      <div style={{ maxWidth: "640px", margin: "0 auto", padding: "1.5rem 1rem" }}>
        {error && (
          <div style={{
            background: "#f8d7da", color: "#842029",
            padding: "12px 16px", borderRadius: "8px", marginBottom: "1.5rem",
          }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : tasks.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "3rem 1rem",
            color: "#6c757d", fontSize: "1rem",
          }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📭</div>
            No delivery tasks assigned to you.
          </div>
        ) : (
          <>
            {/* Pending */}
            {pending.length > 0 && (
              <section style={{ marginBottom: "2rem" }}>
                <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "#6c757d", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
                  Pending ({pending.length})
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {pending.map(t => (
                    <TaskCard
                      key={t.id} task={t}
                      onConfirm={handleConfirm}
                      confirming={confirming === t.id}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Confirmed */}
            {confirmed.length > 0 && (
              <section style={{ marginBottom: "2rem" }}>
                <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "#6c757d", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
                  Confirmed ({confirmed.length})
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {confirmed.map(t => (
                    <TaskCard key={t.id} task={t} onConfirm={handleConfirm} confirming={false} />
                  ))}
                </div>
              </section>
            )}

            {/* Done / Cancelled */}
            {done.length > 0 && (
              <section>
                <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "#6c757d", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
                  Completed / Cancelled ({done.length})
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {done.map(t => (
                    <TaskCard key={t.id} task={t} onConfirm={handleConfirm} confirming={false} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
