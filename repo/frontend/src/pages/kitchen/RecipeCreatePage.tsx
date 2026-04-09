import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { recipeApi, UNIT_LABELS } from "@/api/foodservice";
import CurrencyInput from "@/components/CurrencyInput";

interface Ingredient {
  ingredient_name: string;
  quantity: string;
  unit: string;
  unit_cost: string;
}

interface Step {
  instruction: string;
}

const UNITS = Object.entries(UNIT_LABELS);
const TODAY = new Date().toISOString().slice(0, 10);

function lineTotal(ing: Ingredient): number {
  const q = parseFloat(ing.quantity) || 0;
  const c = parseFloat(ing.unit_cost) || 0;
  return q * c;
}

function perServingCost(ingredients: Ingredient[], servings: string): number {
  const s = parseFloat(servings) || 1;
  const total = ingredients.reduce((acc, i) => acc + lineTotal(i), 0);
  return total / s;
}

export default function RecipeCreatePage() {
  const navigate = useNavigate();

  const [name,      setName]      = useState("");
  const [servings,  setServings]  = useState("1");
  const [effFrom,   setEffFrom]   = useState(TODAY);
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { ingredient_name: "", quantity: "", unit: "oz", unit_cost: "" },
  ]);
  const [steps, setSteps] = useState<Step[]>([{ instruction: "" }]);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Ingredients helpers
  function addIngredient() {
    setIngredients((prev) => [...prev, { ingredient_name: "", quantity: "", unit: "oz", unit_cost: "" }]);
  }
  function removeIngredient(i: number) {
    setIngredients((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateIngredient(i: number, field: keyof Ingredient, val: string) {
    setIngredients((prev) => prev.map((ing, idx) => idx === i ? { ...ing, [field]: val } : ing));
  }

  // Steps helpers
  function addStep() {
    setSteps((prev) => [...prev, { instruction: "" }]);
  }
  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateStep(i: number, val: string) {
    setSteps((prev) => prev.map((s, idx) => idx === i ? { instruction: val } : s));
  }
  function moveStep(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    setSteps((prev) => {
      const arr = [...prev];
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  }

  const preview = perServingCost(ingredients, servings);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError("Recipe name is required."); return; }
    if (ingredients.length === 0) { setError("At least one ingredient is required."); return; }
    if (steps.length === 0) { setError("At least one step is required."); return; }

    setLoading(true);
    try {
      const recipe = await recipeApi.create({
        name: name.trim(),
        effective_from: effFrom,
        servings: parseFloat(servings) || 1,
        ingredients: ingredients.map((ing, i) => ({
          ingredient_name: ing.ingredient_name,
          quantity: parseFloat(ing.quantity) || 0,
          unit: ing.unit,
          unit_cost: parseFloat(ing.unit_cost) || 0,
          sort_order: i,
        })),
        steps: steps.map((s, i) => ({ step_number: i + 1, instruction: s.instruction })),
      });
      navigate(`/kitchen/recipes/${recipe.id}`);
    } catch (e: any) {
      setError(e.message ?? "Failed to create recipe.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif", maxWidth: "860px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <button onClick={() => navigate("/kitchen/recipes")} style={backBtn}>← Recipes</button>
        <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>New Recipe</h2>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      <form onSubmit={handleSubmit}>
        {/* Basic info */}
        <div style={section}>
          <div style={row}>
            <div style={col}>
              <label style={label}>Recipe Name <span style={req}>*</span></label>
              <input value={name} onChange={(e) => setName(e.target.value)} style={input} placeholder="e.g. Classic Pancakes" required />
            </div>
            <div style={{ ...col, maxWidth: "160px" }}>
              <label style={label}>Servings <span style={req}>*</span></label>
              <input type="number" min="0.01" step="0.01" value={servings} onChange={(e) => setServings(e.target.value)} style={input} required />
            </div>
            <div style={{ ...col, maxWidth: "180px" }}>
              <label style={label}>Effective From <span style={req}>*</span></label>
              <input type="date" value={effFrom} onChange={(e) => setEffFrom(e.target.value)} style={input} required />
            </div>
          </div>
        </div>

        {/* Ingredients */}
        <div style={section}>
          <h3 style={sectionTitle}>Ingredients</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #dee2e6" }}>
                <th style={th}>Ingredient</th>
                <th style={{ ...th, width: "100px" }}>Qty</th>
                <th style={{ ...th, width: "130px" }}>Unit</th>
                <th style={{ ...th, width: "120px" }}>Unit Cost</th>
                <th style={{ ...th, width: "100px", textAlign: "right" }}>Line Total</th>
                <th style={{ ...th, width: "40px" }}></th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map((ing, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #dee2e6" }}>
                  <td style={td}>
                    <input value={ing.ingredient_name} onChange={(e) => updateIngredient(i, "ingredient_name", e.target.value)} style={{ ...input, marginBottom: 0 }} placeholder="Flour" />
                  </td>
                  <td style={td}>
                    <input type="number" min="0.001" step="0.001" value={ing.quantity} onChange={(e) => updateIngredient(i, "quantity", e.target.value)} style={{ ...input, marginBottom: 0 }} placeholder="2" />
                  </td>
                  <td style={td}>
                    <select value={ing.unit} onChange={(e) => updateIngredient(i, "unit", e.target.value)} style={{ ...input, marginBottom: 0 }}>
                      {UNITS.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                    </select>
                  </td>
                  <td style={td}>
                    <CurrencyInput value={ing.unit_cost} onChange={(v) => updateIngredient(i, "unit_cost", v)} />
                  </td>
                  <td style={{ ...td, textAlign: "right", color: "#495057" }}>
                    ${lineTotal(ing).toFixed(2)}
                  </td>
                  <td style={td}>
                    {ingredients.length > 1 && (
                      <button type="button" onClick={() => removeIngredient(i)} style={iconBtn} title="Remove">×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.75rem" }}>
            <button type="button" onClick={addIngredient} style={outlineBtn}>+ Add Ingredient</button>
            <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#495057" }}>
              Per-serving cost preview: <span style={{ color: "#0d6efd" }}>${preview.toFixed(2)}</span>
            </span>
          </div>
        </div>

        {/* Steps */}
        <div style={section}>
          <h3 style={sectionTitle}>Steps</h3>
          {steps.map((s, i) => (
            <div key={i} style={{ marginBottom: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingTop: "6px" }}>
                <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} style={{ ...iconBtn, fontSize: "0.7rem" }}>▲</button>
                <button type="button" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} style={{ ...iconBtn, fontSize: "0.7rem" }}>▼</button>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.8rem", color: "#6c757d", marginBottom: "4px", fontWeight: 500 }}>Step {i + 1}</div>
                <div style={{ position: "relative" }}>
                  <textarea
                    value={s.instruction}
                    onChange={(e) => updateStep(i, e.target.value)}
                    maxLength={2000}
                    rows={3}
                    style={{ ...input, resize: "vertical", width: "100%", boxSizing: "border-box", marginBottom: 0 }}
                    placeholder="Describe this step…"
                  />
                  <div style={{ textAlign: "right", fontSize: "0.75rem", color: "#6c757d" }}>{s.instruction.length}/2000</div>
                </div>
              </div>
              {steps.length > 1 && (
                <button type="button" onClick={() => removeStep(i)} style={{ ...iconBtn, marginTop: "6px" }} title="Remove">×</button>
              )}
            </div>
          ))}
          <button type="button" onClick={addStep} style={outlineBtn}>+ Add Step</button>
        </div>

        <button type="submit" disabled={loading} style={primaryBtn}>
          {loading ? "Saving…" : "Save as Draft"}
        </button>
      </form>
    </div>
  );
}

const primaryBtn: React.CSSProperties = { padding: "10px 20px", background: "#0d6efd", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "0.95rem" };
const outlineBtn: React.CSSProperties = { padding: "7px 14px", background: "#fff", color: "#0d6efd", border: "1px solid #0d6efd", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem" };
const backBtn: React.CSSProperties    = { padding: "6px 12px", background: "#fff", color: "#6c757d", border: "1px solid #ced4da", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem" };
const iconBtn: React.CSSProperties    = { padding: "4px 8px", background: "#fff", color: "#6c757d", border: "1px solid #ced4da", borderRadius: "4px", cursor: "pointer", lineHeight: 1 };
const errorBox: React.CSSProperties   = { background: "#f8d7da", color: "#842029", padding: "10px 14px", borderRadius: "6px", marginBottom: "1rem" };
const section: React.CSSProperties    = { marginBottom: "1.75rem", padding: "1.25rem", border: "1px solid #dee2e6", borderRadius: "8px" };
const sectionTitle: React.CSSProperties = { margin: "0 0 1rem 0", fontSize: "1rem", fontWeight: 600, color: "#212529" };
const row: React.CSSProperties        = { display: "flex", gap: "1rem", flexWrap: "wrap" };
const col: React.CSSProperties        = { flex: 1, minWidth: "180px" };
const label: React.CSSProperties      = { display: "block", fontSize: "0.85rem", fontWeight: 500, color: "#495057", marginBottom: "4px" };
const req: React.CSSProperties        = { color: "#dc3545" };
const input: React.CSSProperties      = { display: "block", width: "100%", padding: "7px 10px", border: "1px solid #ced4da", borderRadius: "6px", fontSize: "0.9rem", boxSizing: "border-box", marginBottom: "0" };
const th: React.CSSProperties         = { padding: "8px 10px", fontWeight: 600, fontSize: "0.78rem", color: "#495057", textTransform: "uppercase" as const, letterSpacing: "0.04em", textAlign: "left" as const };
const td: React.CSSProperties         = { padding: "8px 10px", verticalAlign: "top" };
