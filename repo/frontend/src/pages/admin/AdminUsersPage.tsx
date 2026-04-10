import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi, type AdminUserSummary } from "@/api/admin";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  PENDING_REVIEW: { bg: "#fff3cd", color: "#856404" },
  ACTIVE:         { bg: "#d1e7dd", color: "#0a3622" },
  SUSPENDED:      { bg: "#ffe5d0", color: "#7d2d00" },
  DEACTIVATED:    { bg: "#e2e3e5", color: "#41464b" },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_COLORS[status] ?? { bg: "#eee", color: "#333" };
  return (
    <span style={{
      padding: "2px 10px",
      borderRadius: "12px",
      fontSize: "0.78rem",
      fontWeight: 600,
      backgroundColor: style.bg,
      color: style.color,
      whiteSpace: "nowrap",
    }}>
      {status.replace("_", " ")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Role badge
// ---------------------------------------------------------------------------

const ROLE_COLORS: Record<string, string> = {
  ADMIN:   "#0d6efd",
  STAFF:   "#6c757d",
  COURIER: "#6610f2",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span style={{
      padding: "2px 10px",
      borderRadius: "12px",
      fontSize: "0.78rem",
      fontWeight: 600,
      backgroundColor: ROLE_COLORS[role] ?? "#6c757d",
      color: "#fff",
    }}>
      {role}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const STATUSES = ["", "PENDING_REVIEW", "ACTIVE", "SUSPENDED", "DEACTIVATED"];
const ROLES    = ["", "ADMIN", "STAFF", "COURIER"];

export default function AdminUsersPage() {
  const navigate = useNavigate();

  const [users,      setUsers]      = useState<AdminUserSummary[]>([]);
  const [count,      setCount]      = useState(0);
  const [cursor,     setCursor]     = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [prevCursor, setPrevCursor] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter,   setRoleFilter]   = useState("");
  const [search,       setSearch]       = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.listUsers({
        status: statusFilter || undefined,
        role:   roleFilter   || undefined,
        search: search       || undefined,
        cursor: cursor       || undefined,
      });
      setUsers(result.results);
      setCount(result.count);
      setNextCursor(result.next_cursor);
      setPrevCursor(result.previous_cursor);
    } catch (e: any) {
      setError(e.message ?? "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, roleFilter, search, cursor]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>User Management</h2>
        <button
          onClick={() => navigate("/admin/users/create-courier")}
          style={{ padding: "8px 16px", background: "#0d6efd", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
        >
          + Create Courier
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <input
          placeholder="Search username…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCursor(null); }}
          style={{ padding: "6px 10px", border: "1px solid #ced4da", borderRadius: "6px", fontSize: "0.9rem", minWidth: "200px" }}
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setCursor(null); }}
          style={{ padding: "6px 10px", border: "1px solid #ced4da", borderRadius: "6px", fontSize: "0.9rem" }}
        >
          {STATUSES.map(s => <option key={s} value={s}>{s || "All Statuses"}</option>)}
        </select>
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setCursor(null); }}
          style={{ padding: "6px 10px", border: "1px solid #ced4da", borderRadius: "6px", fontSize: "0.9rem" }}
        >
          {ROLES.map(r => <option key={r} value={r}>{r || "All Roles"}</option>)}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "#f8d7da", color: "#842029", padding: "10px 14px", borderRadius: "6px", marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p style={{ color: "#6c757d" }}>Loading…</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #dee2e6", textAlign: "left" }}>
              <th style={th}>Name</th>
              <th style={th}>Username</th>
              <th style={th}>Role</th>
              <th style={th}>Status</th>
              <th style={th}>Sites</th>
              <th style={th}>Created</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: "1.5rem", color: "#6c757d", textAlign: "center" }}>No users found.</td></tr>
            ) : users.map(u => (
              <tr
                key={u.id}
                onClick={() => navigate(`/admin/users/${u.id}`)}
                style={{ borderBottom: "1px solid #dee2e6", cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f8f9fa")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}
              >
                <td style={td}>{u.legal_name ?? "—"}</td>
                <td style={td}><code>{u.username}</code></td>
                <td style={td}><RoleBadge role={u.role} /></td>
                <td style={td}><StatusBadge status={u.status} /></td>
                <td style={td}>{u.site_names.join(", ") || "—"}</td>
                <td style={td}>{new Date(u.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Pagination */}
      {(prevCursor || nextCursor) && (
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button onClick={() => setCursor(prevCursor)} disabled={!prevCursor} style={pagBtn}>← Prev</button>
          <span style={{ fontSize: "0.9rem", color: "#6c757d" }}>{count} total</span>
          <button onClick={() => setCursor(nextCursor)} disabled={!nextCursor} style={pagBtn}>Next →</button>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "10px 12px",
  fontWeight: 600,
  fontSize: "0.82rem",
  color: "#495057",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const td: React.CSSProperties = {
  padding: "10px 12px",
  verticalAlign: "middle",
};

const pagBtn: React.CSSProperties = {
  padding: "5px 12px",
  border: "1px solid #ced4da",
  borderRadius: "6px",
  background: "#fff",
  cursor: "pointer",
  fontSize: "0.85rem",
};
