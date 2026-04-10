import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Building2, MapPin, Plus, ChevronLeft } from "lucide-react";
import { adminApi, Tenant, TenantSite } from "@/api/admin";
import { PageHeader, Card } from "@/components/ui";
import { colors, radius, font } from "@/styles/tokens";

// ---------------------------------------------------------------------------
// Add site modal
// ---------------------------------------------------------------------------

interface AddSiteModalProps {
  tenantId: string;
  onClose: () => void;
  onCreated: (s: TenantSite) => void;
}

function AddSiteModal({ tenantId, onClose, onCreated }: AddSiteModalProps) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const s = await adminApi.createTenantSite(tenantId, { name, address, timezone, is_active: true });
      onCreated(s);
    } catch (err: any) {
      setError(err.message ?? "Failed to create site");
    } finally {
      setSaving(false);
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px",
    border: `1px solid ${colors.border}`, borderRadius: radius.md,
    fontSize: font.size.sm, boxSizing: "border-box",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: radius.lg, padding: "1.75rem", width: 420, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 1.25rem", fontSize: "1.05rem", fontWeight: 700 }}>Add Site</h3>
        {error && <div style={{ background: colors.dangerLight, color: colors.dangerDark, borderRadius: radius.md, padding: "8px 12px", fontSize: font.size.sm, marginBottom: "1rem" }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: font.size.sm, fontWeight: 600, marginBottom: 4 }}>Name</label>
            <input value={name} onChange={e => setName(e.target.value)} required style={fieldStyle} placeholder="Main Campus" />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: font.size.sm, fontWeight: 600, marginBottom: 4 }}>Address</label>
            <input value={address} onChange={e => setAddress(e.target.value)} style={fieldStyle} placeholder="1 University Ave" />
          </div>
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", fontSize: font.size.sm, fontWeight: 600, marginBottom: 4 }}>Timezone</label>
            <input value={timezone} onChange={e => setTimezone(e.target.value)} required style={fieldStyle} placeholder="America/New_York" />
          </div>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 18px", border: `1px solid ${colors.border}`, borderRadius: radius.md, background: "#fff", cursor: "pointer", fontWeight: 500 }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: "8px 18px", border: "none", borderRadius: radius.md, background: colors.primary, color: "#fff", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
              {saving ? "Adding…" : "Add Site"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminTenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [sites, setSites] = useState<TenantSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddSite, setShowAddSite] = useState(false);

  // Edit tenant name/slug/active state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([adminApi.getTenant(id), adminApi.listTenantSites(id)])
      .then(([t, s]) => { setTenant(t); setSites(s); setEditName(t.name); setEditSlug(t.slug); setEditActive(t.is_active); })
      .catch(() => navigate("/admin/tenants"))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  async function handleSave() {
    if (!tenant) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await adminApi.updateTenant(tenant.id, { name: editName, slug: editSlug, is_active: editActive });
      setTenant(updated);
      setEditing(false);
    } catch (err: any) {
      setSaveError(err.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: "2rem", color: colors.textMuted }}>Loading…</div>;
  if (!tenant) return null;

  const fieldStyle: React.CSSProperties = {
    padding: "7px 10px", border: `1px solid ${colors.border}`,
    borderRadius: radius.md, fontSize: font.size.sm,
  };

  return (
    <div>
      <button
        onClick={() => navigate("/admin/tenants")}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: colors.textMuted, fontSize: font.size.sm, marginBottom: "1.25rem", padding: 0 }}
      >
        <ChevronLeft size={15} /> Tenants
      </button>

      <PageHeader
        title={tenant.name}
        subtitle={`/${tenant.slug}`}
        icon={<Building2 size={22} />}
      />

      {/* Tenant details card */}
      <Card style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: editing ? "1rem" : 0 }}>
          <div style={{ fontWeight: 600, fontSize: font.size.base, marginBottom: editing ? "1rem" : 0 }}>Details</div>
          {!editing && (
            <button onClick={() => setEditing(true)} style={{ padding: "6px 14px", border: `1px solid ${colors.border}`, borderRadius: radius.md, background: "#fff", cursor: "pointer", fontSize: font.size.sm, fontWeight: 500 }}>Edit</button>
          )}
        </div>

        {editing ? (
          <>
            {saveError && <div style={{ background: colors.dangerLight, color: colors.dangerDark, borderRadius: radius.md, padding: "8px 12px", fontSize: font.size.sm, marginBottom: "1rem" }}>{saveError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: font.size.sm, fontWeight: 600, marginBottom: 4 }}>Name</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...fieldStyle, width: "100%", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: font.size.sm, fontWeight: 600, marginBottom: 4 }}>Slug</label>
                <input value={editSlug} onChange={e => setEditSlug(e.target.value)} style={{ ...fieldStyle, width: "100%", boxSizing: "border-box", fontFamily: "monospace" }} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
              <input type="checkbox" id="is_active" checked={editActive} onChange={e => setEditActive(e.target.checked)} />
              <label htmlFor="is_active" style={{ fontSize: font.size.sm, fontWeight: 500 }}>Active</label>
            </div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setEditing(false)} style={{ padding: "7px 16px", border: `1px solid ${colors.border}`, borderRadius: radius.md, background: "#fff", cursor: "pointer", fontWeight: 500, fontSize: font.size.sm }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: "7px 16px", border: "none", borderRadius: radius.md, background: colors.primary, color: "#fff", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, fontSize: font.size.sm }}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem", marginTop: "0.75rem" }}>
            {[
              { label: "ID", value: tenant.id, mono: true },
              { label: "Slug", value: tenant.slug, mono: true },
              { label: "Status", value: tenant.is_active ? "Active" : "Inactive" },
              { label: "Created", value: new Date(tenant.created_at).toLocaleDateString() },
            ].map(row => (
              <div key={row.label}>
                <div style={{ fontSize: font.size.xs, color: colors.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{row.label}</div>
                <div style={{ fontSize: font.size.sm, color: colors.text, fontFamily: row.mono ? "monospace" : undefined, wordBreak: "break-all" }}>{row.value}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Sites card */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600, fontSize: font.size.base }}>
          <MapPin size={16} color={colors.primary} /> Sites
        </div>
        <button
          onClick={() => setShowAddSite(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "7px 14px", border: "none", borderRadius: radius.md, background: colors.primary, color: "#fff", fontSize: font.size.sm, fontWeight: 600, cursor: "pointer" }}
        >
          <Plus size={14} /> Add Site
        </button>
      </div>

      {showAddSite && (
        <AddSiteModal
          tenantId={tenant.id}
          onClose={() => setShowAddSite(false)}
          onCreated={s => { setSites(prev => [...prev, s]); setShowAddSite(false); }}
        />
      )}

      <Card padding="0">
        {sites.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: colors.textMuted, fontSize: font.size.sm }}>No sites yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: font.size.sm }}>
            <thead>
              <tr style={{ background: colors.gray50 }}>
                {["Name", "Address", "Timezone", "Active"].map(h => (
                  <th key={h} style={{ padding: "9px 16px", textAlign: "left", fontWeight: 600, color: colors.textMuted, fontSize: font.size.xs, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sites.map((s, idx) => (
                <tr key={s.id} style={{ borderTop: `1px solid ${colors.border}`, background: idx % 2 === 0 ? colors.surface : colors.gray50 }}>
                  <td style={{ padding: "9px 16px", fontWeight: 500, color: colors.text }}>{s.name}</td>
                  <td style={{ padding: "9px 16px", color: colors.textSecondary }}>{s.address || "—"}</td>
                  <td style={{ padding: "9px 16px", color: colors.textMuted, fontFamily: "monospace", fontSize: font.size.xs }}>{s.timezone}</td>
                  <td style={{ padding: "9px 16px" }}>
                    <span style={{ color: s.is_active ? colors.successDark : colors.dangerDark, fontWeight: 600, fontSize: font.size.xs }}>
                      {s.is_active ? "Yes" : "No"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
