import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { menuApi, type MenuListItem } from "@/api/foodservice";
import StatusBadge from "@/components/StatusBadge";

export default function MenusPage() {
  const navigate = useNavigate();
  const [menus,   setMenus]   = useState<MenuListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setMenus(await menuApi.list());
    } catch (e: any) {
      setError(e.message ?? "Failed to load menus.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>Menus</h2>
        <button onClick={() => navigate("/kitchen/menus/new")} style={primaryBtn}>+ New Menu</button>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {loading ? (
        <p style={{ color: "#6c757d" }}>Loading…</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #dee2e6", textAlign: "left" }}>
              <th style={th}>Name</th>
              <th style={th}>Status</th>
              <th style={th}>Published Ver.</th>
              <th style={th}>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {menus.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: "1.5rem", textAlign: "center", color: "#6c757d" }}>No menus found.</td></tr>
            ) : menus.map((m) => (
              <tr
                key={m.id}
                onClick={() => navigate(`/kitchen/menus/${m.id}`)}
                style={{ borderBottom: "1px solid #dee2e6", cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fa")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                <td style={{ ...td, fontWeight: 500 }}>{m.name}</td>
                <td style={td}>
                  {m.published_version_number
                    ? <StatusBadge status="PUBLISHED" />
                    : <StatusBadge status="DRAFT" />}
                </td>
                <td style={td}>{m.published_version_number ? `v${m.published_version_number}` : "—"}</td>
                <td style={td}>{new Date(m.updated_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const primaryBtn: React.CSSProperties = { padding: "8px 16px", background: "#0d6efd", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 };
const errorBox: React.CSSProperties   = { background: "#f8d7da", color: "#842029", padding: "10px 14px", borderRadius: "6px", marginBottom: "1rem" };
const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 600, fontSize: "0.82rem", color: "#495057", textTransform: "uppercase" as const, letterSpacing: "0.04em" };
const td: React.CSSProperties = { padding: "10px 12px", verticalAlign: "middle" };
