import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { recipeApi, type RecipeDetail, type RecipeVersion, UNIT_LABELS } from "@/api/foodservice";
import StatusBadge from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [recipe,   setRecipe]   = useState<RecipeDetail | null>(null);
  const [versions, setVersions] = useState<RecipeVersion[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // Activate dialog
  const [activating, setActivating]   = useState<RecipeVersion | null>(null);
  const [actLoading,  setActLoading]  = useState(false);
  const [actError,    setActError]    = useState<string | null>(null);

  // Delete dialog
  const [deleting,   setDeleting]    = useState<RecipeVersion | null>(null);
  const [delLoading, setDelLoading]  = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [rec, vers] = await Promise.all([
        recipeApi.get(id),
        recipeApi.versions.list(id),
      ]);
      setRecipe(rec);
      setVersions(vers);
    } catch (e: any) {
      setError(e.message ?? "Recipe not found.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleActivate(v: RecipeVersion) {
    if (!id) return;
    setActLoading(true);
    setActError(null);
    try {
      await recipeApi.versions.activate(id, v.id);
      setActivating(null);
      await load();
    } catch (e: any) {
      setActError(e.message ?? "Activation failed.");
    } finally {
      setActLoading(false);
    }
  }

  async function handleDelete(v: RecipeVersion) {
    if (!id) return;
    setDelLoading(true);
    try {
      await recipeApi.versions.delete(id, v.id);
      setDeleting(null);
      await load();
    } catch (e: any) {
      alert(e.message ?? "Delete failed.");
    } finally {
      setDelLoading(false);
    }
  }

  function prefillNewVersion() {
    if (!recipe?.active_version) return;
    const v = recipe.active_version;
    // Encode in URL for RecipeVersionCreatePage
    const params = new URLSearchParams({ prefill: v.id });
    navigate(`/kitchen/recipes/${id}/versions/new?${params}`);
  }

  if (loading) return <div style={{ padding: "1.5rem" }}>Loading…</div>;
  if (error)   return <div style={{ padding: "1.5rem", color: "#842029" }}>{error}</div>;
  if (!recipe) return null;

  const av = recipe.active_version;

  return (
    <div style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif", maxWidth: "900px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <button onClick={() => navigate("/kitchen/recipes")} style={backBtn}>← Recipes</button>
        <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>{recipe.name}</h2>
        {av && <StatusBadge status="ACTIVE" />}
        {!av && <StatusBadge status="DRAFT" />}
      </div>

      {/* Active version card */}
      {av ? (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Active Version v{av.version_number}</h3>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button onClick={prefillNewVersion} style={outlineBtn}>New Version</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
            <Stat label="Servings" value={av.servings} />
            <Stat label="Effective From" value={av.effective_from} />
            <Stat label="Per-Serving Cost" value={`$${parseFloat(av.per_serving_cost).toFixed(2)}`} />
          </div>

          {/* Ingredients table */}
          <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.9rem", fontWeight: 600, color: "#495057" }}>Ingredients</h4>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem", marginBottom: "1.25rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #dee2e6" }}>
                <th style={th}>Ingredient</th>
                <th style={th}>Qty</th>
                <th style={th}>Unit</th>
                <th style={th}>Unit Cost</th>
                <th style={{ ...th, textAlign: "right" }}>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {av.ingredients.map((ing) => (
                <tr key={ing.id} style={{ borderBottom: "1px solid #dee2e6" }}>
                  <td style={td}>{ing.ingredient_name}</td>
                  <td style={td}>{ing.quantity}</td>
                  <td style={td}>{UNIT_LABELS[ing.unit] ?? ing.unit}</td>
                  <td style={td}>${parseFloat(ing.unit_cost).toFixed(4)}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    ${(parseFloat(ing.quantity) * parseFloat(ing.unit_cost)).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Steps */}
          <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.9rem", fontWeight: 600, color: "#495057" }}>Steps</h4>
          <ol style={{ paddingLeft: "1.25rem", margin: 0 }}>
            {av.steps.map((s) => (
              <li key={s.id} style={{ marginBottom: "0.5rem", fontSize: "0.9rem", lineHeight: 1.5 }}>{s.instruction}</li>
            ))}
          </ol>
        </div>
      ) : (
        <div style={{ ...card, color: "#6c757d", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>No active version — activate a draft version to make it live.</span>
          <button onClick={() => navigate(`/kitchen/recipes/${id}/versions/new`)} style={outlineBtn}>New Version</button>
        </div>
      )}

      {/* Version list */}
      <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem", marginTop: "1.75rem" }}>All Versions</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #dee2e6" }}>
            <th style={th}>Ver.</th>
            <th style={th}>Status</th>
            <th style={th}>Effective From</th>
            <th style={th}>Per-Serving Cost</th>
            <th style={th}>Created</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => (
            <tr key={v.id} style={{ borderBottom: "1px solid #dee2e6" }}>
              <td style={td}>v{v.version_number}</td>
              <td style={td}><StatusBadge status={v.status} /></td>
              <td style={td}>{v.effective_from}</td>
              <td style={td}>${parseFloat(v.per_serving_cost).toFixed(2)}</td>
              <td style={td}>{new Date(v.created_at).toLocaleDateString()}</td>
              <td style={{ ...td, display: "flex", gap: "0.5rem" }}>
                {v.status === "DRAFT" && (
                  <>
                    <button onClick={() => { setActError(null); setActivating(v); }} style={activateBtn}>Activate</button>
                    <button onClick={() => setDeleting(v)} style={deleteBtn}>Delete</button>
                  </>
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
            {actError && <div style={{ ...errorBox, marginBottom: "0.75rem" }}>{actError}</div>}
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button onClick={() => setActivating(null)} style={outlineBtn}>Cancel</button>
              <button onClick={() => handleActivate(activating)} disabled={actLoading} style={primaryBtn}>
                {actLoading ? "Activating…" : "Activate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleting && (
        <ConfirmDialog
          title={`Delete Version v${deleting.version_number}?`}
          message="This draft version will be permanently deleted."
          confirmLabel={delLoading ? "Deleting…" : "Delete"}
          confirmVariant="danger"
          onConfirm={() => handleDelete(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div style={{ fontSize: "0.75rem", color: "#6c757d", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: "1.05rem", fontWeight: 600, color: "#212529", marginTop: "2px" }}>{value}</div>
    </div>
  );
}

const card: React.CSSProperties     = { border: "1px solid #dee2e6", borderRadius: "8px", padding: "1.25rem", marginBottom: "1rem" };
const primaryBtn: React.CSSProperties = { padding: "8px 16px", background: "#0d6efd", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 };
const outlineBtn: React.CSSProperties = { padding: "7px 14px", background: "#fff", color: "#0d6efd", border: "1px solid #0d6efd", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem" };
const backBtn: React.CSSProperties    = { padding: "6px 12px", background: "#fff", color: "#6c757d", border: "1px solid #ced4da", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem" };
const activateBtn: React.CSSProperties = { padding: "4px 10px", background: "#0d6efd", color: "#fff", border: "none", borderRadius: "5px", cursor: "pointer", fontSize: "0.8rem" };
const deleteBtn: React.CSSProperties  = { padding: "4px 10px", background: "#fff", color: "#dc3545", border: "1px solid #dc3545", borderRadius: "5px", cursor: "pointer", fontSize: "0.8rem" };
const errorBox: React.CSSProperties   = { background: "#f8d7da", color: "#842029", padding: "8px 12px", borderRadius: "6px" };
const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 600, fontSize: "0.78rem", color: "#495057", textTransform: "uppercase" as const, letterSpacing: "0.04em", textAlign: "left" as const };
const td: React.CSSProperties = { padding: "8px 10px", verticalAlign: "middle" };
const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 };
const modalBox: React.CSSProperties = { background: "#fff", borderRadius: "10px", padding: "1.5rem", maxWidth: "420px", width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" };
