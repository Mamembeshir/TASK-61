import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { dishApi, allergenApi, type DishDetail, type DishVersionRead, type Allergen } from "@/api/foodservice";
import StatusBadge from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";

const CHIP_COLORS: Record<string, string> = {
  GLUTEN: "#fff3cd", MILK: "#d1e7dd", EGG: "#cfe2ff", PEANUT: "#f8d7da",
  TREENUT: "#e2d9f3", SOY: "#d1e7dd", FISH: "#cff4fc", SHELLFISH: "#ffd6a5",
  SESAME: "#e2e3e5", MUSTARD: "#fff3cd", CELERY: "#d1e7dd", LUPIN: "#cfe2ff",
  MOLLUSC: "#ffd6a5", SULPHITE: "#e2d9f3", NONE: "#e2e3e5",
};

export default function DishDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [dish,      setDish]      = useState<DishDetail | null>(null);
  const [versions,  setVersions]  = useState<DishVersionRead[]>([]);
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const [activating,  setActivating]  = useState<DishVersionRead | null>(null);
  const [actLoading,  setActLoading]  = useState(false);
  const [actError,    setActError]    = useState<string | null>(null);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [d, vers] = await Promise.all([
        dishApi.get(id),
        dishApi.versions.list(id),
      ]);
      setDish(d);
      setVersions(vers);
    } catch (e: any) {
      setError(e.message ?? "Dish not found.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);
  useEffect(() => { allergenApi.list().then(setAllergens).catch(() => {}); }, []);

  async function handleActivate(v: DishVersionRead) {
    if (!id) return;
    setActLoading(true);
    setActError(null);
    try {
      await dishApi.versions.activate(id, v.id);
      setActivating(null);
      await load();
    } catch (e: any) {
      setActError(e.message ?? "Activation failed.");
    } finally {
      setActLoading(false);
    }
  }

  if (loading) return <div style={{ padding: "1.5rem" }}>Loading…</div>;
  if (error)   return <div style={{ padding: "1.5rem", color: "#842029" }}>{error}</div>;
  if (!dish)   return null;

  const av = dish.active_version;
  const allergenMap = new Map(allergens.map((a) => [a.name, a]));

  return (
    <div style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif", maxWidth: "900px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <button onClick={() => navigate("/kitchen/dishes")} style={backBtn}>← Dishes</button>
        <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>{dish.name ?? "Dish"}</h2>
        {av ? <StatusBadge status="ACTIVE" /> : <StatusBadge status="DRAFT" />}
      </div>

      {/* Active version card */}
      {av ? (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Active Version v{av.version_number}</h3>
            <button onClick={() => navigate(`/kitchen/dishes/${id}/versions/new`)} style={outlineBtn}>New Version</button>
          </div>

          <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
            <Stat label="Per-Serving Cost" value={`$${parseFloat(av.per_serving_cost).toFixed(2)}`} />
            <Stat label="Effective From" value={av.effective_from} />
          </div>

          {/* Description */}
          {av.description && (
            <p style={{ color: "#495057", fontSize: "0.9rem", marginBottom: "1rem" }}>{av.description}</p>
          )}

          {/* Allergens */}
          <div style={{ marginBottom: "1rem" }}>
            <h4 style={subHead}>Allergens</h4>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {av.allergens.length === 0
                ? <span style={{ color: "#6c757d" }}>None declared</span>
                : av.allergens.map((a) => (
                  <span key={a.id} style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "0.8rem", fontWeight: 500, background: CHIP_COLORS[a.code] ?? "#e2e3e5" }}>
                    {a.name}
                  </span>
                ))
              }
            </div>
          </div>

          {/* Nutrition */}
          <div style={{ marginBottom: "1rem" }}>
            <h4 style={subHead}>Nutrition</h4>
            {av.has_nutrition ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", maxWidth: "500px" }}>
                <NutStat label="Calories" value={`${av.calories} kcal`} />
                <NutStat label="Protein"  value={`${av.protein_g} g`} />
                <NutStat label="Carbs"    value={`${av.carbs_g} g`} />
                <NutStat label="Fat"      value={`${av.fat_g} g`} />
              </div>
            ) : (
              <span style={{ color: "#6c757d", fontSize: "0.88rem" }}>Not provided</span>
            )}
          </div>

          {/* Portions */}
          {av.portions.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <h4 style={subHead}>Portions</h4>
              <table style={{ borderCollapse: "collapse", fontSize: "0.88rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #dee2e6" }}>
                    <th style={th}>Label</th><th style={th}>Size</th><th style={th}>Price Mult.</th>
                  </tr>
                </thead>
                <tbody>
                  {av.portions.map((p) => (
                    <tr key={p.id} style={{ borderBottom: "1px solid #dee2e6" }}>
                      <td style={td}>{p.portion_label}</td>
                      <td style={td}>{p.serving_size_qty} {p.serving_size_unit}</td>
                      <td style={td}>×{p.price_multiplier}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Addons */}
          {av.addons.length > 0 && (
            <div>
              <h4 style={subHead}>Add-ons</h4>
              <table style={{ borderCollapse: "collapse", fontSize: "0.88rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #dee2e6" }}>
                    <th style={th}>Name</th><th style={th}>Cost</th><th style={th}>Allergens</th>
                  </tr>
                </thead>
                <tbody>
                  {av.addons.map((a) => (
                    <tr key={a.id} style={{ borderBottom: "1px solid #dee2e6" }}>
                      <td style={td}>{a.addon_name}</td>
                      <td style={td}>${parseFloat(a.additional_cost).toFixed(2)}</td>
                      <td style={td}>
                        {a.allergens.map((al) => (
                          <span key={al.id} style={{ marginRight: "4px", padding: "2px 7px", borderRadius: "10px", fontSize: "0.75rem", background: CHIP_COLORS[al.code] ?? "#e2e3e5" }}>{al.name}</span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div style={{ ...card, color: "#6c757d", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>No active version.</span>
          <button onClick={() => navigate(`/kitchen/dishes/${id}/versions/new`)} style={outlineBtn}>New Version</button>
        </div>
      )}

      {/* Version list */}
      <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem", marginTop: "1.75rem" }}>All Versions</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #dee2e6" }}>
            <th style={th}>Ver.</th><th style={th}>Name</th><th style={th}>Status</th>
            <th style={th}>Effective From</th><th style={th}>Cost</th><th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => (
            <tr key={v.id} style={{ borderBottom: "1px solid #dee2e6" }}>
              <td style={td}>v{v.version_number}</td>
              <td style={td}>{v.name}</td>
              <td style={td}><StatusBadge status={v.status} /></td>
              <td style={td}>{v.effective_from}</td>
              <td style={td}>${parseFloat(v.per_serving_cost).toFixed(2)}</td>
              <td style={{ ...td, display: "flex", gap: "0.5rem" }}>
                {v.status === "DRAFT" && (
                  <button onClick={() => { setActError(null); setActivating(v); }} style={activateBtn}>Activate</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Activate dialog */}
      {activating && (
        <div style={overlay}>
          <div style={modalBox}>
            <h3 style={{ margin: "0 0 0.75rem", fontSize: "1.1rem" }}>Activate Version v{activating.version_number}?</h3>
            <p style={{ color: "#495057", fontSize: "0.9rem" }}>
              This will supersede the current active version. Proceed?
            </p>
            {actError && <div style={{ background: "#f8d7da", color: "#842029", padding: "8px 12px", borderRadius: "6px", marginBottom: "0.75rem" }}>{actError}</div>}
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button onClick={() => setActivating(null)} style={outlineBtn}>Cancel</button>
              <button onClick={() => handleActivate(activating)} disabled={actLoading} style={primaryBtn}>
                {actLoading ? "Activating…" : "Activate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.75rem", color: "#6c757d", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: "1.05rem", fontWeight: 600, marginTop: "2px" }}>{value}</div>
    </div>
  );
}

function NutStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center", padding: "0.5rem", border: "1px solid #dee2e6", borderRadius: "6px" }}>
      <div style={{ fontSize: "0.75rem", color: "#6c757d" }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: "1rem" }}>{value}</div>
    </div>
  );
}

const card: React.CSSProperties       = { border: "1px solid #dee2e6", borderRadius: "8px", padding: "1.25rem", marginBottom: "1rem" };
const primaryBtn: React.CSSProperties = { padding: "8px 16px", background: "#0d6efd", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 };
const outlineBtn: React.CSSProperties = { padding: "7px 14px", background: "#fff", color: "#0d6efd", border: "1px solid #0d6efd", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem" };
const backBtn: React.CSSProperties    = { padding: "6px 12px", background: "#fff", color: "#6c757d", border: "1px solid #ced4da", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem" };
const activateBtn: React.CSSProperties = { padding: "4px 10px", background: "#0d6efd", color: "#fff", border: "none", borderRadius: "5px", cursor: "pointer", fontSize: "0.8rem" };
const subHead: React.CSSProperties    = { margin: "0 0 0.5rem", fontSize: "0.85rem", fontWeight: 600, color: "#495057", textTransform: "uppercase", letterSpacing: "0.04em" };
const th: React.CSSProperties         = { padding: "8px 10px", fontWeight: 600, fontSize: "0.78rem", color: "#495057", textTransform: "uppercase" as const, textAlign: "left" as const };
const td: React.CSSProperties         = { padding: "8px 10px", verticalAlign: "middle" };
const overlay: React.CSSProperties    = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 };
const modalBox: React.CSSProperties   = { background: "#fff", borderRadius: "10px", padding: "1.5rem", maxWidth: "420px", width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" };
