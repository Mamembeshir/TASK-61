import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { recipeApi, type RecipeListItem } from "@/api/foodservice";
import SearchInput from "@/components/SearchInput";
import StatusBadge from "@/components/StatusBadge";

export default function RecipesPage() {
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
  const [search,  setSearch]  = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await recipeApi.list({ search: search || undefined });
      setRecipes(data);
    } catch (e: any) {
      setError(e.message ?? "Failed to load recipes.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>Recipes</h2>
        <button onClick={() => navigate("/kitchen/recipes/new")} style={primaryBtn}>
          + New Recipe
        </button>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <SearchInput value={search} onChange={(v) => setSearch(v)} placeholder="Search recipes…" />
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {loading ? (
        <p style={{ color: "#6c757d" }}>Loading…</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #dee2e6", textAlign: "left" }}>
              <th style={th}>Name</th>
              <th style={th}>Active Ver.</th>
              <th style={th}>Effective From</th>
              <th style={th}>Per-Serving Cost</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {recipes.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: "1.5rem", textAlign: "center", color: "#6c757d" }}>No recipes found.</td></tr>
            ) : recipes.map((r) => (
              <tr
                key={r.id}
                onClick={() => navigate(`/kitchen/recipes/${r.id}`)}
                style={{ borderBottom: "1px solid #dee2e6", cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fa")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                <td style={{ ...td, fontWeight: 500 }}>{r.name}</td>
                <td style={td}>{r.active_version_number ?? "—"}</td>
                <td style={td}>{r.effective_from ?? "—"}</td>
                <td style={td}>
                  {r.per_serving_cost ? `$${parseFloat(r.per_serving_cost).toFixed(2)}` : "—"}
                </td>
                <td style={td}>
                  {r.active_version_number
                    ? <StatusBadge status="ACTIVE" />
                    : <StatusBadge status="DRAFT" />}
                </td>
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
const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 600, fontSize: "0.82rem", color: "#495057", textTransform: "uppercase", letterSpacing: "0.04em" };
const td: React.CSSProperties = { padding: "10px 12px", verticalAlign: "middle" };
