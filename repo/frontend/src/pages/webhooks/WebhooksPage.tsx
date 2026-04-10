import { useState, useEffect, useCallback } from "react";
import { integrationsApi, type WebhookEndpoint, type WebhookDelivery } from "@/api/integrations";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KNOWN_EVENTS = [
  "alert.created",
  "asset.created",
  "asset.updated",
  "asset.imported",
  "meeting.completed",
  "menu.published",
  "menu.unpublished",
  "task.completed",
  "user.activated",
];

const STATUS_COLOR: Record<string, string> = {
  PENDING: "#888",
  SUCCESS: "#388e3c",
  FAILED:  "#d32f2f",
};

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

// ---------------------------------------------------------------------------
// Endpoint form (create / edit)
// ---------------------------------------------------------------------------

interface FormState {
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
}

function EndpointForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: FormState;
  onSave: (data: FormState) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm]     = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState<string | null>(null);

  const toggleEvent = (ev: string) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev)
        ? f.events.filter((e) => e !== ev)
        : [...f.events, ev],
    }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    setErr(null);
    try {
      await onSave(form);
    } catch (e: any) {
      setErr(e.message || "Save failed");
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #ccc",
        borderRadius: 6,
        padding: "1.25rem 1.5rem",
        marginBottom: "1.5rem",
      }}
    >
      <h3 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>
        {initial.url ? "Edit Endpoint" : "New Webhook Endpoint"}
      </h3>

      <label style={labelStyle}>URL</label>
      <input
        type="url"
        value={form.url}
        onChange={(e) => setForm({ ...form, url: e.target.value })}
        placeholder="http://10.0.0.1/webhook/"
        style={inputStyle}
      />

      <label style={labelStyle}>Secret</label>
      <input
        type="text"
        value={form.secret}
        onChange={(e) => setForm({ ...form, secret: e.target.value })}
        placeholder="HMAC signing secret"
        style={inputStyle}
      />

      <label style={labelStyle}>Events</label>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap" as const,
          gap: "0.4rem",
          marginBottom: "0.75rem",
        }}
      >
        {KNOWN_EVENTS.map((ev) => (
          <label
            key={ev}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: form.events.includes(ev) ? "#e3f2fd" : "#f5f5f5",
              border: `1px solid ${form.events.includes(ev) ? "#1976d2" : "#ddd"}`,
              borderRadius: 4,
              padding: "3px 8px",
              fontSize: "0.78rem",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={form.events.includes(ev)}
              onChange={() => toggleEvent(ev)}
              style={{ margin: 0 }}
            />
            {ev}
          </label>
        ))}
      </div>

      <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
        />
        Active
      </label>

      {err && (
        <div style={{ color: "#d32f2f", fontSize: "0.8rem", margin: "0.5rem 0" }}>{err}</div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button
          onClick={handleSubmit}
          disabled={saving || !form.url || !form.secret}
          style={btnStyle(saving || !form.url || !form.secret, "#1976d2")}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} style={btnStyle(false, "#888")}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delivery log panel
// ---------------------------------------------------------------------------

function DeliveryLog({ endpointId }: { endpointId: string }) {
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    integrationsApi.webhooks
      .deliveries(endpointId)
      .then(setDeliveries)
      .catch(() => setDeliveries([]))
      .finally(() => setLoading(false));
  }, [endpointId]);

  if (loading) return <div style={{ color: "#888", fontSize: "0.8rem" }}>Loading deliveries…</div>;
  if (deliveries.length === 0)
    return <div style={{ color: "#aaa", fontSize: "0.8rem" }}>No delivery attempts yet.</div>;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem", marginTop: "0.5rem" }}>
      <thead>
        <tr style={{ background: "#f9f9f9" }}>
          {["Event", "Status", "Code", "Attempt", "Sent at"].map((h) => (
            <th
              key={h}
              style={{ padding: "4px 8px", textAlign: "left", borderBottom: "1px solid #e0e0e0", whiteSpace: "nowrap" }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {deliveries.map((d) => (
          <tr key={d.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
            <td style={{ padding: "4px 8px" }}>{d.event_type}</td>
            <td style={{ padding: "4px 8px", color: STATUS_COLOR[d.status] ?? "#333", fontWeight: 600 }}>
              {d.status}
            </td>
            <td style={{ padding: "4px 8px" }}>{d.response_status_code ?? "—"}</td>
            <td style={{ padding: "4px 8px" }}>#{d.attempt_number}</td>
            <td style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>{fmtTime(d.sent_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Endpoint row
// ---------------------------------------------------------------------------

function EndpointRow({
  ep,
  onEdit,
  onDelete,
  onToggle,
}: {
  ep: WebhookEndpoint;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const [showLog, setShowLog] = useState(false);

  return (
    <div
      style={{
        border: "1px solid #e0e0e0",
        borderRadius: 6,
        marginBottom: "0.75rem",
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0.75rem 1rem",
          gap: "0.75rem",
          flexWrap: "wrap" as const,
        }}
      >
        {/* Active toggle */}
        <label
          style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}
          title={ep.is_active ? "Active — click to deactivate" : "Inactive — click to activate"}
        >
          <input
            type="checkbox"
            checked={ep.is_active}
            onChange={onToggle}
            style={{ accentColor: "#1976d2" }}
          />
        </label>

        {/* URL */}
        <span
          style={{
            flex: "1 1 auto",
            fontFamily: "monospace",
            fontSize: "0.85rem",
            wordBreak: "break-all" as const,
            color: ep.is_active ? "#111" : "#999",
          }}
        >
          {ep.url}
        </span>

        {/* Event tags */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
          {ep.events.map((ev) => (
            <span
              key={ev}
              style={{
                background: "#e3f2fd",
                color: "#0d47a1",
                padding: "1px 6px",
                borderRadius: 10,
                fontSize: "0.7rem",
              }}
            >
              {ev}
            </span>
          ))}
          {ep.events.length === 0 && (
            <span style={{ color: "#aaa", fontSize: "0.75rem" }}>no events</span>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
          <ActionBtn label="Edit"     color="#1976d2" onClick={onEdit} />
          <ActionBtn label="Log"      color="#555"    onClick={() => setShowLog((v) => !v)} />
          <ActionBtn label="Delete"   color="#d32f2f" onClick={onDelete} />
        </div>
      </div>

      {showLog && (
        <div style={{ padding: "0.5rem 1rem 1rem", borderTop: "1px solid #f0f0f0" }}>
          <DeliveryLog endpointId={ep.id} />
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  label,
  color,
  onClick,
}: {
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: `1px solid ${color}`,
        color,
        padding: "2px 8px",
        borderRadius: 4,
        cursor: "pointer",
        fontSize: "0.75rem",
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.75rem",
  color: "#666",
  marginBottom: 3,
  marginTop: "0.5rem",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.4rem 0.6rem",
  fontFamily: "monospace",
  fontSize: "0.82rem",
  border: "1px solid #ccc",
  borderRadius: 4,
  marginBottom: "0.25rem",
};

function btnStyle(disabled: boolean, bg: string): React.CSSProperties {
  return {
    background: disabled ? "#ccc" : bg,
    color: "#fff",
    border: "none",
    borderRadius: 4,
    padding: "0.4rem 1rem",
    cursor: disabled ? "default" : "pointer",
    fontSize: "0.82rem",
  };
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function WebhooksPage() {
  const [endpoints, setEndpoints]   = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    integrationsApi.webhooks
      .list()
      .then(setEndpoints)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (data: FormState) => {
    await integrationsApi.webhooks.create(data);
    setShowCreate(false);
    load();
  };

  const handleUpdate = async (id: string, data: FormState) => {
    await integrationsApi.webhooks.update(id, data);
    setEditingId(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this webhook endpoint?")) return;
    await integrationsApi.webhooks.delete(id);
    load();
  };

  const handleToggle = async (ep: WebhookEndpoint) => {
    await integrationsApi.webhooks.update(ep.id, { is_active: !ep.is_active });
    load();
  };

  const blankForm: FormState = { url: "", secret: "", events: [], is_active: true };

  return (
    <div style={{ padding: "2rem", fontFamily: "monospace", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Webhook Endpoints</h2>
        {!showCreate && (
          <button
            onClick={() => { setShowCreate(true); setEditingId(null); }}
            style={btnStyle(false, "#1976d2")}
          >
            + New Endpoint
          </button>
        )}
      </div>

      {error && (
        <div style={{ color: "#d32f2f", marginBottom: "1rem", fontSize: "0.85rem" }}>{error}</div>
      )}

      {/* Create form */}
      {showCreate && (
        <EndpointForm
          initial={blankForm}
          onSave={handleCreate}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {loading ? (
        <div style={{ color: "#888", fontSize: "0.9rem" }}>Loading…</div>
      ) : endpoints.length === 0 && !showCreate ? (
        <div style={{ color: "#aaa", fontSize: "0.9rem" }}>
          No webhook endpoints configured. Click <strong>+ New Endpoint</strong> to add one.
        </div>
      ) : (
        endpoints.map((ep) =>
          editingId === ep.id ? (
            <EndpointForm
              key={ep.id}
              initial={{
                url:       ep.url,
                secret:    ep.secret,
                events:    ep.events,
                is_active: ep.is_active,
              }}
              onSave={(data) => handleUpdate(ep.id, data)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <EndpointRow
              key={ep.id}
              ep={ep}
              onEdit={() => { setEditingId(ep.id); setShowCreate(false); }}
              onDelete={() => handleDelete(ep.id)}
              onToggle={() => handleToggle(ep)}
            />
          )
        )
      )}
    </div>
  );
}
