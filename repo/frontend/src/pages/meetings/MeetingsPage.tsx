import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { meetingApi, type MeetingListItem, type MeetingStatus } from "@/api/meetings";
import { foodSiteApi, type FoodSite } from "@/api/foodservice";

// ---------------------------------------------------------------------------
// Status badge (local — meeting-specific colours)
// ---------------------------------------------------------------------------
function MeetingStatusBadge({ status }: { status: MeetingStatus }) {
  const cfg: Record<MeetingStatus, { bg: string; color: string; label: string }> = {
    DRAFT:       { bg: "#e2e3e5", color: "#41464b",  label: "Draft" },
    SCHEDULED:   { bg: "#cfe2ff", color: "#084298",  label: "Scheduled" },
    IN_PROGRESS: { bg: "#fff3cd", color: "#856404",  label: "In Progress" },
    COMPLETED:   { bg: "#d1e7dd", color: "#0f5132",  label: "Completed" },
    CANCELLED:   { bg: "#f8d7da", color: "#842029",  label: "Cancelled" },
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
// Create Meeting Modal
// ---------------------------------------------------------------------------
interface CreateModalProps {
  sites: FoodSite[];
  onClose: () => void;
  onCreated: () => void;
}

function CreateMeetingModal({ sites, onClose, onCreated }: CreateModalProps) {
  const [title, setTitle]           = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [siteId, setSiteId]         = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    if (!scheduledAt)  { setError("Scheduled date/time is required."); return; }
    setSubmitting(true);
    setError(null);
    try {
      await meetingApi.create({
        title: title.trim(),
        scheduled_at: scheduledAt,
        site_id: siteId || null,
      });
      onCreated();
    } catch (err: any) {
      setError(err.message ?? "Failed to create meeting.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modalBox} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 1.25rem", fontSize: "1.1rem", fontWeight: 700 }}>New Meeting</h3>
        <form onSubmit={handleSubmit}>
          <div style={fieldGroup}>
            <label style={label}>Title <span style={{ color: "#dc3545" }}>*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Meeting title"
              style={input}
              autoFocus
            />
          </div>
          <div style={fieldGroup}>
            <label style={label}>Scheduled At <span style={{ color: "#dc3545" }}>*</span></label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              style={input}
            />
          </div>
          <div style={fieldGroup}>
            <label style={label}>Site (optional)</label>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={input}>
              <option value="">— No site —</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {error && (
            <div style={{ background: "#f8d7da", color: "#842029", padding: "8px 12px", borderRadius: "6px", marginBottom: "0.75rem", fontSize: "0.85rem" }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
            <button type="button" onClick={onClose} style={outlineBtn}>Cancel</button>
            <button type="submit" disabled={submitting} style={primaryBtn}>
              {submitting ? "Creating…" : "Create Meeting"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "",            label: "All Statuses" },
  { value: "DRAFT",       label: "Draft" },
  { value: "SCHEDULED",   label: "Scheduled" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED",   label: "Completed" },
  { value: "CANCELLED",   label: "Cancelled" },
];

export default function MeetingsPage() {
  const navigate = useNavigate();

  const [meetings,    setMeetings]    = useState<MeetingListItem[]>([]);
  const [sites,       setSites]       = useState<FoodSite[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [siteFilter,  setSiteFilter]  = useState("");
  const [showCreate,  setShowCreate]  = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status   = statusFilter;
      if (siteFilter)   params.site_id  = siteFilter;
      const [ms, ss] = await Promise.all([
        meetingApi.list(params),
        sites.length === 0 ? foodSiteApi.list() : Promise.resolve(sites),
      ]);
      setMeetings(ms);
      if (sites.length === 0) setSites(ss as FoodSite[]);
    } catch (err: any) {
      setError(err.message ?? "Failed to load meetings.");
    } finally {
      setLoading(false);
    }
  }

  // Load sites once on mount
  useEffect(() => {
    foodSiteApi.list().then(setSites).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [statusFilter, siteFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCreated() {
    setShowCreate(false);
    load();
  }

  return (
    <div style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif", maxWidth: "1100px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700, flexGrow: 1 }}>Meetings</h2>

        {/* Filters */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ ...filterSelect, minWidth: "140px" }}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value)}
          style={{ ...filterSelect, minWidth: "140px" }}
        >
          <option value="">All Sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <button onClick={() => setShowCreate(true)} style={primaryBtn}>+ New Meeting</button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: "2rem", color: "#6c757d" }}>Loading…</div>
      ) : error ? (
        <div style={{ padding: "1rem", background: "#f8d7da", color: "#842029", borderRadius: "6px" }}>
          {error}
        </div>
      ) : meetings.length === 0 ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "#6c757d" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📋</div>
          No meetings found. {statusFilter || siteFilter ? "Try clearing the filters." : 'Click "+ New Meeting" to get started.'}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #dee2e6" }}>
                <th style={th}>Title</th>
                <th style={th}>Scheduled At</th>
                <th style={th}>Site</th>
                <th style={th}>Status</th>
                <th style={th}>Resolutions</th>
                <th style={th}>Open Tasks</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => navigate(`/meetings/${m.id}`)}
                  style={{
                    borderBottom: "1px solid #dee2e6",
                    cursor: "pointer",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fa")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                >
                  <td style={{ ...td, fontWeight: 500, color: "#0d6efd" }}>{m.title}</td>
                  <td style={td}>{fmtDateTime(m.scheduled_at)}</td>
                  <td style={{ ...td, color: "#6c757d" }}>{m.site_name ?? "—"}</td>
                  <td style={td}><MeetingStatusBadge status={m.status} /></td>
                  <td style={{ ...td, textAlign: "center" }}>{m.resolution_count}</td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {m.open_task_count > 0 ? (
                      <span style={{ color: "#dc3545", fontWeight: 600 }}>{m.open_task_count}</span>
                    ) : (
                      <span style={{ color: "#6c757d" }}>0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateMeetingModal
          sites={sites}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtDateTime(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const primaryBtn: React.CSSProperties = {
  padding: "8px 16px", background: "#0d6efd", color: "#fff",
  border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "0.88rem",
};
const outlineBtn: React.CSSProperties = {
  padding: "7px 14px", background: "#fff", color: "#0d6efd",
  border: "1px solid #0d6efd", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem",
};
const filterSelect: React.CSSProperties = {
  padding: "7px 10px", border: "1px solid #ced4da", borderRadius: "6px",
  fontSize: "0.85rem", background: "#fff", cursor: "pointer",
};
const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999,
};
const modalBox: React.CSSProperties = {
  background: "#fff", borderRadius: "10px", padding: "1.5rem",
  maxWidth: "480px", width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
};
const fieldGroup: React.CSSProperties = { marginBottom: "1rem" };
const label: React.CSSProperties      = { display: "block", fontWeight: 500, fontSize: "0.85rem", marginBottom: "4px", color: "#212529" };
const input: React.CSSProperties      = { width: "100%", padding: "8px 10px", border: "1px solid #ced4da", borderRadius: "6px", fontSize: "0.9rem", boxSizing: "border-box" };
const th: React.CSSProperties         = { padding: "8px 14px", fontWeight: 600, fontSize: "0.78rem", color: "#495057", textTransform: "uppercase", textAlign: "left" };
const td: React.CSSProperties         = { padding: "10px 14px", verticalAlign: "middle" };
