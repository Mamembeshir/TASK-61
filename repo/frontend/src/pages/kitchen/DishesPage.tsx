import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { dishApi, allergenApi, type DishListItem, type Allergen } from "@/api/foodservice";
import SearchInput from "@/components/SearchInput";

const CHIP_COLORS: Record<string, string> = {
  GLUTEN: "#fff3cd", MILK: "#d1e7dd", EGG: "#cfe2ff", PEANUT: "#f8d7da",
  TREENUT: "#e2d9f3", SOY: "#d1e7dd", FISH: "#cff4fc", SHELLFISH: "#ffd6a5",
  SESAME: "#e2e3e5", MUSTARD: "#fff3cd", CELERY: "#d1e7dd", LUPIN: "#cfe2ff",
  MOLLUSC: "#ffd6a5", SULPHITE: "#e2d9f3", NONE: "#e2e3e5",
};

export default function DishesPage() {
  const navigate = useNavigate();
  const [dishes,    setDishes]    = useState<DishListItem[]>([]);
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const [search,    setSearch]    = useState("");
  const [include,   setInclude]   = useState<Set<string>>(new Set());
  const [exclude,   setExclude]   = useState<Set<string>>(new Set());
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    allergenApi.list().then(setAllergens).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (search)         params.search          = search;
      if (include.size)   params.allergen_include = Array.from(include).join(",");
      if (exclude.size)   params.allergen_exclude = Array.from(exclude).join(",");
      const data = await dishApi.list(params as any);
      setDishes(data);
    } catch (e: any) {
      setError(e.message ?? "Failed to load dishes.");
    } finally {
      setLoading(false);
    }
  }, [search, include, exclude]);

  useEffect(() => { load(); }, [load]);

  function toggleFilter(set: Set<string>, id: string, other: Set<string>): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else { next.add(id); other.delete(id); }
    return next;
  }

  const nonNone = allergens.filter((a) => a.code !== "NONE");

  return (
    <div style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>Dishes</h2>
        <button onClick={() => navigate("/kitchen/dishes/new")} style={primaryBtn}>+ New Dish</button>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-start" }}>
        <SearchInput value={search} onChange={(v) => setSearch(v)} placeholder="Search dishes…" />
        <div style={{ flex: 1, minWidth: "300px" }}>
          <div style={{ fontSize: "0.8rem", color: "#6c757d", marginBottom: "4px" }}>
            Include allergens (show only dishes with these):
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {nonNone.map((a) => {
              const on = include.has(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { const n = toggleFilter(include, a.id, exclude); setInclude(n); }}
                  style={{
                    padding: "3px 10px", borderRadius: "12px", border: on ? "2px solid #0d6efd" : "1px solid #ced4da",
                    background: on ? "#cfe2ff" : "#f8f9fa", color: on ? "#084298" : "#495057",
                    cursor: "pointer", fontSize: "0.78rem", fontWeight: on ? 600 : 400,
                  }}
                >
                  {a.name}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#6c757d", margin: "6px 0 4px" }}>
            Exclude allergens (hide dishes with these):
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {nonNone.map((a) => {
              const on = exclude.has(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { const n = toggleFilter(exclude, a.id, include); setExclude(n); }}
                  style={{
                    padding: "3px 10px", borderRadius: "12px", border: on ? "2px solid #dc3545" : "1px solid #ced4da",
                    background: on ? "#f8d7da" : "#f8f9fa", color: on ? "#842029" : "#495057",
                    cursor: "pointer", fontSize: "0.78rem", fontWeight: on ? 600 : 400,
                  }}
                >
                  {a.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {loading ? (
        <p style={{ color: "#6c757d" }}>Loading…</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #dee2e6", textAlign: "left" }}>
              <th style={th}>Name</th>
              <th style={th}>Cost</th>
              <th style={th}>Allergens</th>
              <th style={th}>Nutrition</th>
            </tr>
          </thead>
          <tbody>
            {dishes.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: "1.5rem", textAlign: "center", color: "#6c757d" }}>No dishes found.</td></tr>
            ) : dishes.map((d) => (
              <tr
                key={d.id}
                onClick={() => navigate(`/kitchen/dishes/${d.id}`)}
                style={{ borderBottom: "1px solid #dee2e6", cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fa")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                <td style={{ ...td, fontWeight: 500 }}>{d.name ?? "—"}</td>
                <td style={td}>{d.per_serving_cost ? `$${parseFloat(d.per_serving_cost).toFixed(2)}` : "—"}</td>
                <td style={td}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {d.allergen_names.length === 0
                      ? <span style={{ color: "#6c757d" }}>—</span>
                      : d.allergen_names.map((name) => {
                          const a = allergens.find((al) => al.name === name);
                          const bg = CHIP_COLORS[a?.code ?? ""] ?? "#e2e3e5";
                          return (
                            <span key={name} style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "0.75rem", fontWeight: 500, background: bg }}>
                              {name}
                            </span>
                          );
                        })
                    }
                  </div>
                </td>
                <td style={td}>
                  {d.has_nutrition
                    ? <span style={{ color: "#0f5132" }}>✓</span>
                    : <span style={{ color: "#6c757d" }}>—</span>}
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
const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 600, fontSize: "0.82rem", color: "#495057", textTransform: "uppercase" as const, letterSpacing: "0.04em" };
const td: React.CSSProperties = { padding: "10px 12px", verticalAlign: "middle" };
