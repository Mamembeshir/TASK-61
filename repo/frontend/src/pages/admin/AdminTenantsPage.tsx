import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Plus, CheckCircle, XCircle } from "lucide-react";
import { adminApi, Tenant } from "@/api/admin";
import { PageHeader, Card } from "@/components/ui";
import { colors, radius, font, transition } from "@/styles/tokens";

// ---------------------------------------------------------------------------
// Create tenant modal
// ---------------------------------------------------------------------------

interface CreateModalProps {
  onClose: () => void;
  onCreated: (t: Tenant) => void;
}

function CreateTenantModal({ onClose, onCreated }: CreateModalProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(v: string) {
    setName(v);
    if (!slug || slug === name.toLowerCase().replace(/\s+/g, "-")) {
      setSlug(v.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const t = await adminApi.createTenant({ name, slug, is_active: true });
      onCreated(t);
    } catch (err: any) {
      setError(err.message ?? "Failed to create tenant");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: "#fff", borderRadius: radius.lg, padding: "1.75rem",
        width: 420, boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 1.25rem", fontSize: "1.05rem", fontWeight: 700 }}>New Tenant</h3>
        {error && (
          <div style={{
            background: colors.dangerLight, color: colors.dangerDark,
            borderRadius: radius.md, padding: "8px 12px",
            fontSize: font.size.sm, marginBottom: "1rem",
          }}>{error}</div>
        )}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: font.size.sm, fontWeight: 600, marginBottom: 4, color: colors.text }}>Name</label>
            <input
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              required
              style={{ width: "100%", padding: "8px 10px", border: `1px solid ${colors.border}`, borderRadius: radius.md, fontSize: font.size.sm, boxSizing: "border-box" }}
              placeholder="Coastal University"
            />
          </div>
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", fontSize: font.size.sm, fontWeight: 600, marginBottom: 4, color: colors.text }}>Slug</label>
            <input
              value={slug}
              onChange={e => setSlug(e.target.value)}
              required
              pattern="[a-z0-9-]+"
              style={{ width: "100%", padding: "8px 10px", border: `1px solid ${colors.border}`, borderRadius: radius.md, fontSize: font.size.sm, fontFamily: "monospace", boxSizing: "border-box" }}
              placeholder="coastal-university"
            />
            <div style={{ fontSize: font.size.xs, color: colors.textMuted, marginTop: 4 }}>Lowercase letters, numbers, and hyphens only.</div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 18px", border: `1px solid ${colors.border}`, borderRadius: radius.md, background: "#fff", cursor: "pointer", fontWeight: 500 }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: "8px 18px", border: "none", borderRadius: radius.md, background: colors.primary, color: "#fff", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
              {saving ? "Creating…" : "Create"}
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

export default function AdminTenantsPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    adminApi.listTenants()
      .then(setTenants)
      .catch(() => setTenants([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="Tenants"
        subtitle="Platform-wide tenant management"
        icon={<Building2 size={22} />}
        actions={
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: "flex", alignItems: "center", gap: "0.375rem",
              padding: "8px 16px", borderRadius: radius.md, border: "none",
              background: colors.primary, color: "#fff",
              fontSize: font.size.sm, fontWeight: 600, cursor: "pointer",
            }}
          >
            <Plus size={15} /> New Tenant
          </button>
        }
      />

      {showCreate && (
        <CreateTenantModal
          onClose={() => setShowCreate(false)}
          onCreated={t => { setTenants(prev => [t, ...prev]); setShowCreate(false); }}
        />
      )}

      <Card padding="0">
        {loading ? (
          <div style={{ padding: "2rem", color: colors.textMuted, textAlign: "center", fontSize: font.size.sm }}>Loading…</div>
        ) : tenants.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: colors.textMuted, fontSize: font.size.sm }}>No tenants found.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: font.size.sm }}>
            <thead>
              <tr style={{ background: colors.gray50 }}>
                {["Name", "Slug", "Status", "Created"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: colors.textMuted, fontSize: font.size.xs, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((t, idx) => (
                <tr
                  key={t.id}
                  onClick={() => navigate(`/admin/tenants/${t.id}`)}
                  style={{
                    borderTop: `1px solid ${colors.border}`,
                    background: idx % 2 === 0 ? colors.surface : colors.gray50,
                    cursor: "pointer",
                    transition: `background ${transition.base}`,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = colors.surfaceHover)}
                  onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? colors.surface : colors.gray50)}
                >
                  <td style={{ padding: "10px 16px", fontWeight: 600, color: colors.text }}>{t.name}</td>
                  <td style={{ padding: "10px 16px", fontFamily: "monospace", color: colors.textSecondary, fontSize: font.size.xs }}>{t.slug}</td>
                  <td style={{ padding: "10px 16px" }}>
                    {t.is_active
                      ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: colors.successDark, fontSize: font.size.xs, fontWeight: 600 }}><CheckCircle size={13} /> Active</span>
                      : <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: colors.dangerDark, fontSize: font.size.xs, fontWeight: 600 }}><XCircle size={13} /> Inactive</span>
                    }
                  </td>
                  <td style={{ padding: "10px 16px", color: colors.textMuted, fontSize: font.size.xs }}>
                    {new Date(t.created_at).toLocaleDateString()}
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
