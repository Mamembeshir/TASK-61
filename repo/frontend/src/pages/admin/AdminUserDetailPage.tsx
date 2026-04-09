import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { adminApi, type AdminUserDetail, type Site } from "@/api/admin";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  PENDING_REVIEW: { bg: "#fff3cd", color: "#856404" },
  ACTIVE:         { bg: "#d1e7dd", color: "#0a3622" },
  SUSPENDED:      { bg: "#ffe5d0", color: "#7d2d00" },
  DEACTIVATED:    { bg: "#e2e3e5", color: "#41464b" },
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN:   "#0d6efd",
  STAFF:   "#6c757d",
  COURIER: "#6610f2",
};

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{
      padding: "2px 10px", borderRadius: "12px", fontSize: "0.78rem",
      fontWeight: 600, backgroundColor: bg, color,
    }}>
      {label.replace(/_/g, " ")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Confirmation dialog for status transitions
// ---------------------------------------------------------------------------

interface ConfirmDialogProps {
  title: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
}

function ConfirmDialog({ title, onConfirm, onCancel, loading }: ConfirmDialogProps) {
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 10;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div style={{
        background: "#fff", borderRadius: "10px", padding: "1.5rem",
        width: "420px", boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
      }}>
        <h3 style={{ margin: "0 0 1rem", fontSize: "1.1rem" }}>{title}</h3>
        <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "4px", color: "#495057" }}>
          Reason <span style={{ color: "#6c757d" }}>(min 10 characters)</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          style={{
            width: "100%", padding: "8px 10px", border: "1px solid #ced4da",
            borderRadius: "6px", fontSize: "0.9rem", resize: "vertical",
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
          <button onClick={onCancel} disabled={loading} style={outlineBtn}>Cancel</button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={!valid || loading}
            style={{ ...solidBtn, opacity: valid && !loading ? 1 : 0.55 }}
          >
            {loading ? "Processing…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Valid transitions per status
// ---------------------------------------------------------------------------

const TRANSITIONS: Record<string, string[]> = {
  PENDING_REVIEW: ["ACTIVE", "DEACTIVATED"],
  ACTIVE:         ["SUSPENDED", "DEACTIVATED"],
  SUSPENDED:      ["ACTIVE", "DEACTIVATED"],
  DEACTIVATED:    [],
};

const TRANSITION_LABELS: Record<string, string> = {
  ACTIVE:      "Activate",
  SUSPENDED:   "Suspend",
  DEACTIVATED: "Deactivate",
};

const TRANSITION_COLORS: Record<string, string> = {
  ACTIVE:      "#198754",
  SUSPENDED:   "#fd7e14",
  DEACTIVATED: "#dc3545",
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [user,    setUser]    = useState<AdminUserDetail | null>(null);
  const [sites,   setSites]   = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Confirm dialog state
  const [pendingTransition, setPendingTransition] = useState<string | null>(null);
  const [actionLoading,     setActionLoading]     = useState(false);

  // Role assignment
  const [roleEdit,     setRoleEdit]     = useState(false);
  const [newRole,      setNewRole]      = useState("");
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [roleLoading,  setRoleLoading]  = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [u, s] = await Promise.all([adminApi.getUser(id), adminApi.listSites()]);
      setUser(u);
      setSites(s);
      setNewRole(u.role);
      setSelectedSites(s.filter(site => u.site_names.includes(site.name)).map(site => site.id));
    } catch (e: any) {
      setError(e.message ?? "Failed to load user.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleTransition(reason: string) {
    if (!id || !pendingTransition) return;
    setActionLoading(true);
    try {
      const updated = await adminApi.transition(id, pendingTransition, reason);
      setUser(updated);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? e.message ?? "Transition failed.");
    } finally {
      setActionLoading(false);
      setPendingTransition(null);
    }
  }

  async function handlePhotoReview(decision: "APPROVED" | "REJECTED") {
    if (!id) return;
    setActionLoading(true);
    try {
      const updated = await adminApi.reviewPhoto(id, decision);
      setUser(updated);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? e.message ?? "Photo review failed.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUnlock() {
    if (!id) return;
    setActionLoading(true);
    try {
      await adminApi.unlock(id);
      await load();
    } catch (e: any) {
      setError(e.response?.data?.detail ?? e.message ?? "Unlock failed.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRoleAssign() {
    if (!id) return;
    setRoleLoading(true);
    try {
      const updated = await adminApi.assignRole(id, newRole, selectedSites);
      setUser(updated);
      setRoleEdit(false);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? e.message ?? "Role assignment failed.");
    } finally {
      setRoleLoading(false);
    }
  }

  function toggleSite(siteId: string) {
    setSelectedSites(prev =>
      prev.includes(siteId) ? prev.filter(s => s !== siteId) : [...prev, siteId]
    );
  }

  if (loading) return <p style={{ padding: "2rem", color: "#6c757d" }}>Loading…</p>;
  if (error && !user) return (
    <div style={{ padding: "2rem" }}>
      <div style={{ background: "#f8d7da", color: "#842029", padding: "10px 14px", borderRadius: "6px" }}>{error}</div>
      <button onClick={() => navigate("/admin/users")} style={{ ...outlineBtn, marginTop: "1rem" }}>← Back to Users</button>
    </div>
  );
  if (!user) return null;

  const statusStyle = STATUS_COLORS[user.status] ?? { bg: "#eee", color: "#333" };
  const validTransitions = TRANSITIONS[user.status] ?? [];
  const photoStatus = user.photo_id_review_status;
  const isImage = user.photo_id_file_path &&
    /\.(jpe?g|png)$/i.test(user.photo_id_file_path);

  return (
    <div style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif", maxWidth: "900px" }}>
      {/* Back */}
      <button onClick={() => navigate("/admin/users")} style={{ ...outlineBtn, marginBottom: "1.25rem" }}>
        ← Back to Users
      </button>

      {/* Error banner */}
      {error && (
        <div style={{ background: "#f8d7da", color: "#842029", padding: "10px 14px", borderRadius: "6px", marginBottom: "1rem" }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: "1rem", background: "none", border: "none", cursor: "pointer", color: "#842029", fontWeight: 600 }}>×</button>
        </div>
      )}

      {/* Profile card */}
      <section style={card}>
        <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.3rem" }}>{user.legal_name ?? user.username}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.5rem 1.5rem", fontSize: "0.9rem" }}>
          <Field label="Username"><code>{user.username}</code></Field>
          <Field label="Role">
            <Badge label={user.role} bg={ROLE_COLORS[user.role] ?? "#6c757d"} color="#fff" />
          </Field>
          <Field label="Status">
            <Badge label={user.status} bg={statusStyle.bg} color={statusStyle.color} />
          </Field>
          <Field label="Employee / Student ID">{user.employee_student_id ?? "—"}</Field>
          <Field label="Sites">{user.site_names.join(", ") || "—"}</Field>
          <Field label="Member since">{new Date(user.created_at).toLocaleDateString()}</Field>
          {user.is_locked && (
            <Field label="Locked until">
              <span style={{ color: "#dc3545", fontWeight: 600 }}>
                {user.locked_until ? new Date(user.locked_until).toLocaleString() : "Yes"}
              </span>
            </Field>
          )}
        </div>
      </section>

      {/* Unlock */}
      {user.is_locked && (
        <section style={{ ...card, marginTop: "1rem", borderLeft: "4px solid #dc3545" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong style={{ color: "#dc3545" }}>Account Locked</strong>
              <span style={{ marginLeft: "1rem", fontSize: "0.85rem", color: "#6c757d" }}>
                {user.failed_login_count} failed attempt{user.failed_login_count !== 1 ? "s" : ""}
              </span>
            </div>
            <button onClick={handleUnlock} disabled={actionLoading} style={{ ...solidBtn, background: "#dc3545" }}>
              {actionLoading ? "Unlocking…" : "Unlock Account"}
            </button>
          </div>
        </section>
      )}

      {/* Photo ID */}
      {(user.photo_id_file_path || photoStatus) && (
        <section style={{ ...card, marginTop: "1rem" }}>
          <h3 style={sectionTitle}>Photo ID Review</h3>
          <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: "200px" }}>
              <Field label="Review Status">
                {photoStatus ? (
                  <Badge
                    label={photoStatus}
                    bg={photoStatus === "APPROVED" ? "#d1e7dd" : photoStatus === "REJECTED" ? "#f8d7da" : "#fff3cd"}
                    color={photoStatus === "APPROVED" ? "#0a3622" : photoStatus === "REJECTED" ? "#842029" : "#856404"}
                  />
                ) : "—"}
              </Field>
            </div>
            {user.photo_id_file_path && (
              <div>
                {isImage ? (
                  <img
                    src={`/media/${user.photo_id_file_path}`}
                    alt="Photo ID"
                    style={{ maxWidth: "260px", maxHeight: "180px", borderRadius: "6px", border: "1px solid #dee2e6", objectFit: "contain" }}
                  />
                ) : (
                  <a
                    href={`/media/${user.photo_id_file_path}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ ...outlineBtn, textDecoration: "none", display: "inline-block" }}
                  >
                    Download ID (PDF)
                  </a>
                )}
              </div>
            )}
          </div>
          {photoStatus === "PENDING" && (
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button
                onClick={() => handlePhotoReview("APPROVED")}
                disabled={actionLoading}
                style={{ ...solidBtn, background: "#198754" }}
              >
                Approve Photo
              </button>
              <button
                onClick={() => handlePhotoReview("REJECTED")}
                disabled={actionLoading}
                style={{ ...solidBtn, background: "#dc3545" }}
              >
                Reject Photo
              </button>
            </div>
          )}
        </section>
      )}

      {/* Status transitions */}
      {validTransitions.length > 0 && (
        <section style={{ ...card, marginTop: "1rem" }}>
          <h3 style={sectionTitle}>Status Actions</h3>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {validTransitions.map(target => (
              <button
                key={target}
                onClick={() => setPendingTransition(target)}
                disabled={actionLoading}
                style={{ ...solidBtn, background: TRANSITION_COLORS[target] ?? "#6c757d" }}
              >
                {TRANSITION_LABELS[target] ?? target}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Role assignment */}
      <section style={{ ...card, marginTop: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h3 style={{ ...sectionTitle, margin: 0 }}>Role & Sites</h3>
          {!roleEdit && (
            <button onClick={() => setRoleEdit(true)} style={outlineBtn}>
              Edit
            </button>
          )}
        </div>
        {roleEdit ? (
          <div>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={labelStyle}>Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                style={inputStyle}
              >
                {["ADMIN", "STAFF", "COURIER"].map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={labelStyle}>Sites</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {sites.map(s => (
                  <label key={s.id} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.85rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={selectedSites.includes(s.id)}
                      onChange={() => toggleSite(s.id)}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button onClick={handleRoleAssign} disabled={roleLoading} style={solidBtn}>
                {roleLoading ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setRoleEdit(false)} style={outlineBtn}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: "0.9rem" }}>
            <Field label="Role">
              <Badge label={user.role} bg={ROLE_COLORS[user.role] ?? "#6c757d"} color="#fff" />
            </Field>
            <Field label="Sites" style={{ marginTop: "0.4rem" }}>{user.site_names.join(", ") || "—"}</Field>
          </div>
        )}
      </section>

      {/* Status history */}
      <section style={{ ...card, marginTop: "1rem" }}>
        <h3 style={sectionTitle}>Status History</h3>
        {user.status_history.length === 0 ? (
          <p style={{ color: "#6c757d", fontSize: "0.9rem", margin: 0 }}>No history yet.</p>
        ) : (
          <div style={{ position: "relative", paddingLeft: "1.5rem" }}>
            {/* vertical line */}
            <div style={{ position: "absolute", left: "7px", top: 0, bottom: 0, width: "2px", background: "#dee2e6" }} />
            {user.status_history.map((entry, i) => {
              const oldS = STATUS_COLORS[entry.old_status] ?? { bg: "#eee", color: "#333" };
              const newS = STATUS_COLORS[entry.new_status] ?? { bg: "#eee", color: "#333" };
              return (
                <div key={entry.id} style={{ position: "relative", paddingBottom: i < user.status_history.length - 1 ? "1.25rem" : 0 }}>
                  {/* dot */}
                  <div style={{
                    position: "absolute", left: "-1.5rem", top: "3px",
                    width: "12px", height: "12px", borderRadius: "50%",
                    background: newS.bg, border: `2px solid ${newS.color}`,
                  }} />
                  <div style={{ fontSize: "0.8rem", color: "#6c757d", marginBottom: "2px" }}>
                    {new Date(entry.timestamp).toLocaleString()}
                    {entry.changed_by_username && (
                      <span style={{ marginLeft: "0.5rem" }}>by <strong>{entry.changed_by_username}</strong></span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                    <Badge label={entry.old_status} bg={oldS.bg} color={oldS.color} />
                    <span style={{ color: "#6c757d", fontSize: "0.85rem" }}>→</span>
                    <Badge label={entry.new_status} bg={newS.bg} color={newS.color} />
                  </div>
                  {entry.reason && (
                    <div style={{ fontSize: "0.82rem", color: "#495057", marginTop: "3px" }}>{entry.reason}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Confirm dialog */}
      {pendingTransition && (
        <ConfirmDialog
          title={`${TRANSITION_LABELS[pendingTransition] ?? pendingTransition} account?`}
          onConfirm={handleTransition}
          onCancel={() => setPendingTransition(null)}
          loading={actionLoading}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Micro-components
// ---------------------------------------------------------------------------

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <div style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6c757d", marginBottom: "2px" }}>
        {label}
      </div>
      <div style={{ fontSize: "0.9rem" }}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #dee2e6",
  borderRadius: "8px",
  padding: "1.25rem",
};

const sectionTitle: React.CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "#495057",
  margin: "0 0 0.75rem",
};

const solidBtn: React.CSSProperties = {
  padding: "7px 16px",
  background: "#0d6efd",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.85rem",
};

const outlineBtn: React.CSSProperties = {
  padding: "7px 16px",
  background: "#fff",
  color: "#495057",
  border: "1px solid #ced4da",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 500,
  fontSize: "0.85rem",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.82rem",
  fontWeight: 600,
  marginBottom: "4px",
  color: "#495057",
};

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid #ced4da",
  borderRadius: "6px",
  fontSize: "0.9rem",
};
