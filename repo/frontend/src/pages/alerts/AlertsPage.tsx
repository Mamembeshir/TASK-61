import { useState, useEffect, useCallback } from "react";
import { integrationsApi, type AlertListItem, type Alert } from "@/api/integrations";
import apiClient from "@/api/client";
import { useAuth } from "@/context/AuthContext";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_COLOR: Record<string, { bg: string; text: string }> = {
  CRITICAL: { bg: "#fde8e8", text: "#b71c1c" },
  WARNING:  { bg: "#fff8e1", text: "#e65100" },
  INFO:     { bg: "#e3f2fd", text: "#0d47a1" },
};

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  OPEN:         { bg: "#fce4ec", text: "#880e4f" },
  ACKNOWLEDGED: { bg: "#fff3e0", text: "#bf360c" },
  ASSIGNED:     { bg: "#e8f5e9", text: "#1b5e20" },
  CLOSED:       { bg: "#f3f4f6", text: "#555" },
};

const STATUS_OPTIONS = ["", "OPEN", "ACKNOWLEDGED", "ASSIGNED", "CLOSED"];
const SEVERITY_OPTIONS = ["", "CRITICAL", "WARNING", "INFO"];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString();
}

// ---------------------------------------------------------------------------
// Severity badge
// ---------------------------------------------------------------------------

function SevBadge({ sev }: { sev: string }) {
  const c = SEVERITY_COLOR[sev] ?? { bg: "#eee", text: "#333" };
  return (
    <span
      style={{
        background: c.bg,
        color: c.text,
        padding: "2px 8px",
        borderRadius: 12,
        fontSize: "0.72rem",
        fontWeight: 700,
        textTransform: "uppercase" as const,
      }}
    >
      {sev}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLOR[status] ?? { bg: "#eee", text: "#333" };
  return (
    <span
      style={{
        background: c.bg,
        color: c.text,
        padding: "2px 8px",
        borderRadius: 12,
        fontSize: "0.72rem",
        fontWeight: 600,
      }}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function DetailPanel({
  alertId,
  onClose,
  onMutated,
  isAdmin,
  myId,
}: {
  alertId: string;
  onClose: () => void;
  onMutated: () => void;
  isAdmin: boolean;
  myId: string;
}) {
  const [alert, setAlert]         = useState<Alert | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [working, setWorking]     = useState(false);

  // Assign picker state
  const [assignUserId, setAssignUserId] = useState("");
  const [users, setUsers]               = useState<{ id: string; username: string }[]>([]);

  // Close note
  const [note, setNote] = useState("");

  useEffect(() => {
    setLoading(true);
    setError(null);
    integrationsApi.alerts
      .get(alertId)
      .then(setAlert)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [alertId]);

  // Load users for assign dropdown (ADMIN only)
  useEffect(() => {
    if (!isAdmin) return;
    apiClient
      .get("admin/users/")
      .then((r) => {
        const rows = Array.isArray(r.data) ? r.data : (r.data.results ?? []);
        setUsers(rows.map((u: any) => ({ id: u.id, username: u.username })));
      })
      .catch(() => {/* ignore */});
  }, [isAdmin]);

  const act = async (fn: () => Promise<Alert>) => {
    setWorking(true);
    setActionErr(null);
    try {
      const updated = await fn();
      setAlert(updated);
      onMutated();
    } catch (e: any) {
      setActionErr(e.message || "Action failed");
    } finally {
      setWorking(false);
    }
  };

  if (loading) return (
    <div style={panelStyle}>
      <CloseBtn onClick={onClose} />
      <div style={{ padding: "1.5rem", color: "#888" }}>Loading…</div>
    </div>
  );

  if (error || !alert) return (
    <div style={panelStyle}>
      <CloseBtn onClick={onClose} />
      <div style={{ padding: "1.5rem", color: "#d32f2f" }}>{error ?? "Not found"}</div>
    </div>
  );

  const canAck    = isAdmin && alert.status === "OPEN";
  const canAssign = isAdmin && alert.status === "ACKNOWLEDGED";
  const canClose  =
    alert.status === "ASSIGNED" &&
    (isAdmin || alert.assigned_to_id === myId);

  return (
    <div style={panelStyle}>
      <CloseBtn onClick={onClose} />

      <div style={{ padding: "1.25rem 1.5rem" }}>
        <div style={{ marginBottom: "0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" as const }}>
          <SevBadge sev={alert.severity} />
          <StatusBadge status={alert.status} />
        </div>

        <div style={{ fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "1rem", wordBreak: "break-word" as const }}>
          {alert.message}
        </div>

        <table style={{ fontSize: "0.78rem", color: "#555", borderCollapse: "collapse" as const, width: "100%", marginBottom: "1.25rem" }}>
          <tbody>
            <Row label="Type"      value={alert.alert_type} />
            <Row label="Created"   value={fmtTime(alert.created_at)} />
            <Row label="Updated"   value={fmtTime(alert.updated_at)} />
            {alert.acknowledged_by_username && (
              <Row label="Ack'd by"   value={`${alert.acknowledged_by_username} at ${fmtTime(alert.acknowledged_at!)}`} />
            )}
            {alert.assigned_to_username && (
              <Row label="Assigned to" value={alert.assigned_to_username} />
            )}
            {alert.closed_by_username && (
              <Row label="Closed by"  value={`${alert.closed_by_username} at ${fmtTime(alert.closed_at!)}`} />
            )}
            {alert.resolution_note && (
              <Row label="Resolution" value={alert.resolution_note} />
            )}
          </tbody>
        </table>

        {actionErr && (
          <div style={{ color: "#d32f2f", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
            {actionErr}
          </div>
        )}

        {/* Acknowledge */}
        {canAck && (
          <Btn
            label="Acknowledge"
            color="#1976d2"
            disabled={working}
            onClick={() => act(() => integrationsApi.alerts.acknowledge(alert.id))}
          />
        )}

        {/* Assign */}
        {canAssign && (
          <div style={{ marginBottom: "0.75rem" }}>
            <select
              value={assignUserId}
              onChange={(e) => setAssignUserId(e.target.value)}
              style={selectStyle}
            >
              <option value="">Select user to assign…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.username}</option>
              ))}
            </select>
            <Btn
              label="Assign"
              color="#7b1fa2"
              disabled={working || !assignUserId}
              onClick={() =>
                act(() => integrationsApi.alerts.assign(alert.id, assignUserId))
              }
            />
          </div>
        )}

        {/* Close */}
        {canClose && (
          <div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Resolution note (min 10 chars)"
              rows={3}
              style={{
                width: "100%",
                boxSizing: "border-box" as const,
                padding: "0.5rem",
                fontFamily: "monospace",
                fontSize: "0.82rem",
                border: `1px solid ${note.length > 0 && note.length < 10 ? "#d32f2f" : "#ccc"}`,
                borderRadius: 4,
                marginBottom: "0.5rem",
                resize: "vertical" as const,
              }}
            />
            {note.length > 0 && note.length < 10 && (
              <div style={{ color: "#d32f2f", fontSize: "0.75rem", marginBottom: "0.5rem" }}>
                At least 10 characters required
              </div>
            )}
            <Btn
              label="Close Alert"
              color="#d32f2f"
              disabled={working || note.trim().length < 10}
              onClick={() =>
                act(() => integrationsApi.alerts.close(alert.id, note.trim()))
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Tiny helpers
function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ padding: "2px 8px 2px 0", color: "#999", whiteSpace: "nowrap" as const }}>{label}</td>
      <td style={{ padding: "2px 0", wordBreak: "break-all" as const }}>{value}</td>
    </tr>
  );
}
function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "absolute" as const,
        top: 10,
        right: 14,
        background: "none",
        border: "none",
        fontSize: "1.2rem",
        cursor: "pointer",
        color: "#888",
      }}
    >
      ✕
    </button>
  );
}
function Btn({
  label,
  color,
  disabled,
  onClick,
}: {
  label: string;
  color: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "#ccc" : color,
        color: "#fff",
        border: "none",
        borderRadius: 4,
        padding: "0.45rem 1.1rem",
        cursor: disabled ? "default" : "pointer",
        fontSize: "0.82rem",
        marginBottom: "0.5rem",
        marginRight: "0.5rem",
      }}
    >
      {label}
    </button>
  );
}

const panelStyle: React.CSSProperties = {
  position: "relative",
  background: "#fff",
  border: "1px solid #e0e0e0",
  borderRadius: 6,
  overflowY: "auto",
  maxHeight: "100%",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.4rem 0.5rem",
  fontSize: "0.82rem",
  border: "1px solid #ccc",
  borderRadius: 4,
  marginBottom: "0.5rem",
  fontFamily: "monospace",
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AlertsPage() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "ADMIN";
  const myId    = currentUser?.id ?? "";

  const [alerts, setAlerts]         = useState<AlertListItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [statusFilter, setStatus]   = useState("");
  const [sevFilter, setSev]         = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (statusFilter) params.status   = statusFilter;
    if (sevFilter)    params.severity = sevFilter;
    integrationsApi.alerts
      .list(params)
      .then(setAlerts)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [statusFilter, sevFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ padding: "2rem", fontFamily: "monospace", maxWidth: 1200, margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 1.25rem", fontSize: "1.25rem" }}>Alert Management</h2>

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatus(e.target.value)}
          style={selectStyle}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s || "All statuses"}</option>
          ))}
        </select>
        <select
          value={sevFilter}
          onChange={(e) => setSev(e.target.value)}
          style={selectStyle}
        >
          {SEVERITY_OPTIONS.map((s) => (
            <option key={s} value={s}>{s || "All severities"}</option>
          ))}
        </select>
        <button
          onClick={load}
          style={{
            padding: "0.4rem 1rem",
            background: "#555",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: "0.82rem",
          }}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ color: "#d32f2f", marginBottom: "1rem", fontSize: "0.85rem" }}>{error}</div>
      )}

      {/* Layout: table + detail panel */}
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>
        {/* Table */}
        <div style={{ flex: selectedId ? "1 1 55%" : "1 1 100%", minWidth: 0 }}>
          {loading ? (
            <div style={{ color: "#888", fontSize: "0.9rem" }}>Loading…</div>
          ) : alerts.length === 0 ? (
            <div style={{ color: "#aaa", fontSize: "0.9rem" }}>No alerts found.</div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.82rem",
              }}
            >
              <thead>
                <tr style={{ background: "#f5f5f5" }}>
                  {["Severity", "Message", "Status", "Created", "Assigned To"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "0.5rem 0.75rem",
                        textAlign: "left",
                        fontWeight: 600,
                        borderBottom: "2px solid #e0e0e0",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => setSelectedId(a.id === selectedId ? null : a.id)}
                    style={{
                      cursor: "pointer",
                      background: a.id === selectedId ? "#e8f0fe" : "transparent",
                      borderBottom: "1px solid #f0f0f0",
                    }}
                  >
                    <td style={{ padding: "0.55rem 0.75rem" }}>
                      <SevBadge sev={a.severity} />
                    </td>
                    <td
                      style={{
                        padding: "0.55rem 0.75rem",
                        maxWidth: 280,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={a.message}
                    >
                      {a.message}
                    </td>
                    <td style={{ padding: "0.55rem 0.75rem" }}>
                      <StatusBadge status={a.status} />
                    </td>
                    <td style={{ padding: "0.55rem 0.75rem", whiteSpace: "nowrap" }}>
                      {fmtTime(a.created_at)}
                    </td>
                    <td style={{ padding: "0.55rem 0.75rem", color: "#777" }}>
                      {a.assigned_to_username ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel */}
        {selectedId && (
          <div style={{ flex: "0 0 40%", minWidth: 300, position: "sticky", top: "1rem" }}>
            <DetailPanel
              key={selectedId}
              alertId={selectedId}
              onClose={() => setSelectedId(null)}
              onMutated={load}
              isAdmin={isAdmin}
              myId={myId}
            />
          </div>
        )}
      </div>
    </div>
  );
}
