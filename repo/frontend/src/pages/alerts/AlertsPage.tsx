import { useState, useEffect, useCallback } from "react";
import { Bell, RefreshCw, X, CheckCircle2, UserPlus, XCircle } from "lucide-react";
import { integrationsApi, type AlertListItem, type Alert } from "@/api/integrations";
import apiClient from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import {
  PageHeader, Button, Card, Table, Tr, Td, Badge, EmptyState,
  SkeletonTable, AlertBanner, Field,
} from "@/components/ui";
import { selectStyle, textareaStyle } from "@/styles/forms";
import {
  colors, font, radius, shadows, gradients,
  alertSeverityColors, alertStatusColors,
} from "@/styles/tokens";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "",             label: "All Statuses" },
  { value: "OPEN",         label: "Open"         },
  { value: "ACKNOWLEDGED", label: "Acknowledged" },
  { value: "ASSIGNED",     label: "Assigned"     },
  { value: "CLOSED",       label: "Closed"       },
];

const SEVERITY_OPTIONS: { value: string; label: string }[] = [
  { value: "",         label: "All Severities" },
  { value: "CRITICAL", label: "Critical"       },
  { value: "WARNING",  label: "Warning"        },
  { value: "INFO",     label: "Info"           },
];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Severity / status badges
// ---------------------------------------------------------------------------
function SevBadge({ sev }: { sev: string }) {
  const cfg = alertSeverityColors[sev] ?? { bg: colors.gray200, text: colors.gray700, label: sev };
  return <Badge bg={cfg.bg} text={cfg.text} label={cfg.label} size="sm" dot />;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = alertStatusColors[status] ?? { bg: colors.gray200, text: colors.gray700, label: status };
  return <Badge bg={cfg.bg} text={cfg.text} label={cfg.label} size="sm" />;
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------
interface DetailPanelProps {
  alertId: string;
  onClose: () => void;
  onMutated: () => void;
  isAdmin: boolean;
  myId: string;
}

function DetailPanel({ alertId, onClose, onMutated, isAdmin, myId }: DetailPanelProps) {
  const [alert, setAlert]         = useState<Alert | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [working, setWorking]     = useState(false);

  const [assignUserId, setAssignUserId] = useState("");
  const [users, setUsers]               = useState<{ id: string; username: string }[]>([]);

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

  const panelBase: React.CSSProperties = {
    position: "relative",
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    boxShadow: shadows.md,
    overflow: "hidden",
    maxHeight: "calc(100vh - 140px)",
    display: "flex",
    flexDirection: "column",
  };

  const closeBtn = (
    <button
      onClick={onClose}
      style={{
        background: colors.gray100,
        border: "none",
        width: 30, height: 30, borderRadius: radius.md,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: colors.textSecondary, cursor: "pointer",
      }}
      title="Close"
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = colors.gray200;
        (e.currentTarget as HTMLElement).style.color = colors.text;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = colors.gray100;
        (e.currentTarget as HTMLElement).style.color = colors.textSecondary;
      }}
    >
      <X size={15} />
    </button>
  );

  if (loading) {
    return (
      <div style={panelBase}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "1rem 1.25rem", borderBottom: `1px solid ${colors.border}`,
        }}>
          <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.text }}>
            Alert Details
          </div>
          {closeBtn}
        </div>
        <div style={{ padding: "1.5rem", color: colors.textMuted, fontSize: font.size.sm }}>
          Loading…
        </div>
      </div>
    );
  }

  if (error || !alert) {
    return (
      <div style={panelBase}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "1rem 1.25rem", borderBottom: `1px solid ${colors.border}`,
        }}>
          <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.text }}>
            Alert Details
          </div>
          {closeBtn}
        </div>
        <div style={{ padding: "1.25rem" }}>
          <AlertBanner type="error" message={error ?? "Not found"} />
        </div>
      </div>
    );
  }

  const canAck    = isAdmin && alert.status === "OPEN";
  const canAssign = isAdmin && alert.status === "ACKNOWLEDGED";
  const canClose  =
    alert.status === "ASSIGNED" &&
    (isAdmin || alert.assigned_to_id === myId);

  return (
    <div style={panelBase}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "1rem 1.25rem",
        borderBottom: `1px solid ${colors.border}`,
        background: gradients.primarySoft,
      }}>
        <div style={{
          fontSize: font.size.md,
          fontWeight: font.weight.semibold,
          color: colors.text,
          letterSpacing: font.tracking.tight,
        }}>
          Alert Details
        </div>
        {closeBtn}
      </div>

      <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", flex: 1 }}>
        {/* Badges */}
        <div style={{ marginBottom: "0.9rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <SevBadge sev={alert.severity} />
          <StatusBadge status={alert.status} />
        </div>

        {/* Message */}
        <div style={{
          fontSize: font.size.base,
          lineHeight: 1.6,
          color: colors.text,
          marginBottom: "1.25rem",
          wordBreak: "break-word",
          padding: "12px 14px",
          background: colors.surfaceAlt,
          borderRadius: radius.md,
          border: `1px solid ${colors.border}`,
        }}>
          {alert.message}
        </div>

        {/* Metadata */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          columnGap: "1rem",
          rowGap: "0.55rem",
          fontSize: font.size.sm,
          marginBottom: "1.5rem",
        }}>
          <MetaRow label="Type"    value={alert.alert_type} />
          <MetaRow label="Created" value={fmtTime(alert.created_at)} />
          <MetaRow label="Updated" value={fmtTime(alert.updated_at)} />
          {alert.acknowledged_by_username && (
            <MetaRow
              label="Ack'd by"
              value={`${alert.acknowledged_by_username} · ${fmtTime(alert.acknowledged_at!)}`}
            />
          )}
          {alert.assigned_to_username && (
            <MetaRow label="Assigned to" value={alert.assigned_to_username} />
          )}
          {alert.closed_by_username && (
            <MetaRow
              label="Closed by"
              value={`${alert.closed_by_username} · ${fmtTime(alert.closed_at!)}`}
            />
          )}
          {alert.resolution_note && (
            <MetaRow label="Resolution" value={alert.resolution_note} />
          )}
        </div>

        {actionErr && (
          <AlertBanner type="error" message={actionErr} onClose={() => setActionErr(null)} />
        )}

        {/* Acknowledge */}
        {canAck && (
          <Button
            variant="primary"
            onClick={() => act(() => integrationsApi.alerts.acknowledge(alert.id))}
            loading={working}
            icon={<CheckCircle2 size={15} />}
            style={{ width: "100%", marginBottom: "0.75rem" }}
          >
            Acknowledge
          </Button>
        )}

        {/* Assign */}
        {canAssign && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "0.75rem" }}>
            <Field label="Assign to">
              <select
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
                style={selectStyle}
              >
                <option value="">Select user…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.username}</option>
                ))}
              </select>
            </Field>
            <Button
              variant="primary"
              disabled={working || !assignUserId}
              loading={working}
              onClick={() => act(() => integrationsApi.alerts.assign(alert.id, assignUserId))}
              icon={<UserPlus size={15} />}
              style={{ width: "100%" }}
            >
              Assign
            </Button>
          </div>
        )}

        {/* Close */}
        {canClose && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <Field
              label="Resolution note"
              required
              error={note.length > 0 && note.length < 10 ? "At least 10 characters required." : undefined}
            >
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Describe how this alert was resolved…"
                rows={4}
                style={{
                  ...textareaStyle,
                  borderColor: note.length > 0 && note.length < 10 ? colors.danger : colors.border,
                }}
              />
            </Field>
            <Button
              variant="danger"
              disabled={working || note.trim().length < 10}
              loading={working}
              onClick={() => act(() => integrationsApi.alerts.close(alert.id, note.trim()))}
              icon={<XCircle size={15} />}
              style={{ width: "100%" }}
            >
              Close Alert
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div style={{
        color: colors.textMuted,
        fontWeight: font.weight.medium,
        whiteSpace: "nowrap",
        fontSize: font.size.xs,
        textTransform: "uppercase",
        letterSpacing: font.tracking.wider,
        paddingTop: 2,
      }}>
        {label}
      </div>
      <div style={{
        color: colors.text,
        wordBreak: "break-word",
        fontSize: font.size.sm,
      }}>
        {value}
      </div>
    </>
  );
}

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
    setError(null);
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

  const openCount = alerts.filter((a) => a.status === "OPEN").length;

  return (
    <div>
      <PageHeader
        title="Alert Management"
        subtitle={loading
          ? "Loading alerts…"
          : `${alerts.length} alert${alerts.length === 1 ? "" : "s"} in view${openCount > 0 ? ` · ${openCount} open` : ""}`}
        icon={<Bell size={22} />}
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
            onChange={(e) => setStatus(e.target.value)}
            style={{ ...selectStyle, width: "auto", minWidth: 160 }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={sevFilter}
            onChange={(e) => setSev(e.target.value)}
            style={{ ...selectStyle, width: "auto", minWidth: 160 }}
          >
            {SEVERITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {(statusFilter || sevFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setStatus(""); setSev(""); }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      {error && <AlertBanner type="error" message={error} onClose={() => setError(null)} />}

      {/* Table + detail panel */}
      <div style={{
        display: "flex",
        gap: "1.15rem",
        alignItems: "flex-start",
      }}>
        <div style={{ flex: selectedId ? "1 1 60%" : "1 1 100%", minWidth: 0 }}>
          {loading ? (
            <SkeletonTable rows={6} cols={5} />
          ) : alerts.length === 0 ? (
            <Card padding="0">
              <EmptyState
                icon="🔔"
                title="No alerts"
                description={statusFilter || sevFilter
                  ? "Try clearing the filters to see more alerts."
                  : "Alerts from integrations and sensors will appear here."}
              />
            </Card>
          ) : (
            <Table columns={["Severity", "Message", "Status", "Created", "Assigned To"]}>
              {alerts.map((a) => (
                <Tr
                  key={a.id}
                  onClick={() => setSelectedId(a.id === selectedId ? null : a.id)}
                >
                  <Td><SevBadge sev={a.severity} /></Td>
                  <Td style={{ maxWidth: 320 }}>
                    <span
                      title={a.message}
                      style={{
                        display: "block",
                        maxWidth: 320,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: colors.text,
                        fontWeight: a.id === selectedId ? font.weight.semibold : font.weight.medium,
                      }}
                    >
                      {a.message}
                    </span>
                  </Td>
                  <Td><StatusBadge status={a.status} /></Td>
                  <Td style={{
                    color: colors.textMuted,
                    fontSize: font.size.sm,
                    whiteSpace: "nowrap",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {fmtTime(a.created_at)}
                  </Td>
                  <Td style={{ color: colors.textSecondary, fontSize: font.size.sm }}>
                    {a.assigned_to_username ?? "—"}
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </div>

        {/* Detail panel */}
        {selectedId && (
          <div style={{
            flex: "0 0 38%",
            minWidth: 340,
            position: "sticky",
            top: "1rem",
          }}>
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

