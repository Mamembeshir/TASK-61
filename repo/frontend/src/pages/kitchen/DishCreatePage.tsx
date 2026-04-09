import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { dishApi, allergenApi, recipeApi, type Allergen, type RecipeListItem } from "@/api/foodservice";
import CurrencyInput from "@/components/CurrencyInput";
import AllergenChipSelect from "@/components/AllergenChipSelect";
import NutritionFieldGroup from "@/components/NutritionFieldGroup";
import RecipeAutocomplete from "@/components/RecipeAutocomplete";

interface Portion {
  portion_label: string;
  serving_size_qty: string;
  serving_size_unit: string;
  price_multiplier: string;
}

interface AddonRow {
  addon_name: string;
  additional_cost: string;
  allergen_ids: string[];
}

const TODAY = new Date().toISOString().slice(0, 10);

export default function DishCreatePage() {
  const navigate = useNavigate();

  const [name,        setName]        = useState("");
  const [description, setDescription] = useState("");
  const [effFrom,     setEffFrom]     = useState(TODAY);
  const [recipe,      setRecipe]      = useState<RecipeListItem | null>(null);
  const [cost,        setCost]        = useState("");
  const [allergenIds, setAllergenIds] = useState<string[]>([]);
  const [nutrition, setNutrition] = useState({ calories: "", protein_g: "", carbs_g: "", fat_g: "" });
  const [portions,    setPortions]    = useState<Portion[]>([]);
  const [addons,      setAddons]      = useState<AddonRow[]>([]);
  const [allergens,   setAllergens]   = useState<Allergen[]>([]);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    allergenApi.list().then(setAllergens).catch(() => {});
  }, []);

  // When recipe selected, auto-fill cost from active version
  useEffect(() => {
    if (recipe?.per_serving_cost) {
      setCost(parseFloat(recipe.per_serving_cost).toFixed(2));
    }
  }, [recipe]);

  // Portions helpers
  function addPortion() {
    setPortions((p) => [...p, { portion_label: "", serving_size_qty: "", serving_size_unit: "", price_multiplier: "1.00" }]);
  }
  function removePortion(i: number) {
    setPortions((p) => p.filter((_, idx) => idx !== i));
  }
  function updatePortion(i: number, field: keyof Portion, val: string) {
    setPortions((p) => p.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  }

  // Addons helpers
  function addAddon() {
    setAddons((a) => [...a, { addon_name: "", additional_cost: "", allergen_ids: [] }]);
  }
  function removeAddon(i: number) {
    setAddons((a) => a.filter((_, idx) => idx !== i));
  }
  function updateAddon(i: number, field: keyof AddonRow, val: string | string[]) {
    setAddons((a) => a.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side nutrition check
    const nutritionVals = Object.values(nutrition);
    const filled = nutritionVals.filter((v) => v !== "");
    if (filled.length > 0 && filled.length < 4) {
      setError("Provide all four nutrition values or leave all empty.");
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim(),
        effective_from: effFrom,
        allergen_ids: allergenIds,
        recipe_id: recipe?.id ?? null,
        per_serving_cost: cost ? parseFloat(cost) : null,
        portions: portions.map((p) => ({
          portion_label:     p.portion_label,
          serving_size_qty:  parseFloat(p.serving_size_qty) || 0,
          serving_size_unit: p.serving_size_unit,
          price_multiplier:  parseFloat(p.price_multiplier) || 1,
        })),
        addons: addons.map((a) => ({
          addon_name:      a.addon_name,
          additional_cost: parseFloat(a.additional_cost) || 0,
          allergen_ids:    a.allergen_ids,
        })),
      };
      if (filled.length === 4) {
        payload.calories  = parseFloat(nutrition.calories);
        payload.protein_g = parseFloat(nutrition.protein_g);
        payload.carbs_g   = parseFloat(nutrition.carbs_g);
        payload.fat_g     = parseFloat(nutrition.fat_g);
      }

      const dish = await dishApi.create(payload);
      navigate(`/kitchen/dishes/${dish.id}`);
    } catch (e: any) {
      setError(e.message ?? "Failed to create dish.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif", maxWidth: "860px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <button onClick={() => navigate("/kitchen/dishes")} style={backBtn}>← Dishes</button>
        <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>New Dish</h2>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      <form onSubmit={handleSubmit}>
        {/* Basic info */}
        <div style={section}>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <div style={{ flex: 1, minWidth: "200px" }}>
              <label style={labelStyle}>Name <span style={req}>*</span></label>
              <input value={name} onChange={(e) => setName(e.target.value)} style={input} placeholder="e.g. Pancake Stack" required />
            </div>
            <div style={{ flex: "0 0 180px" }}>
              <label style={labelStyle}>Effective From <span style={req}>*</span></label>
              <input type="date" value={effFrom} onChange={(e) => setEffFrom(e.target.value)} style={input} required />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <div style={{ position: "relative" }}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                rows={3}
                style={{ ...input, resize: "vertical", width: "100%", boxSizing: "border-box" }}
                placeholder="Optional description…"
              />
              <div style={{ textAlign: "right", fontSize: "0.75rem", color: "#6c757d" }}>{description.length}/1000</div>
            </div>
          </div>
        </div>

        {/* Link recipe + cost */}
        <div style={section}>
          <h3 style={sectionTitle}>Recipe Link &amp; Cost</h3>
          <div style={{ marginBottom: "1rem" }}>
            <label style={labelStyle}>Link Recipe (optional)</label>
            <RecipeAutocomplete
              value={recipe}
              onChange={(r) => {
                setRecipe(r);
                if (!r) setCost(""); // clear auto-filled cost when cleared
              }}
              placeholder="Search recipes…"
            />
            {recipe?.per_serving_cost && (
              <div style={{ fontSize: "0.8rem", color: "#0f5132", marginTop: "4px" }}>
                Auto-filled from active version: ${parseFloat(recipe.per_serving_cost).toFixed(2)} / serving
              </div>
            )}
          </div>
          <div style={{ maxWidth: "180px" }}>
            <label style={labelStyle}>Per-Serving Cost {!recipe && <span style={req}>*</span>}</label>
            <CurrencyInput
              value={cost}
              onChange={setCost}
              disabled={!!recipe}
              placeholder={recipe ? "Auto from recipe" : "$0.00"}
            />
          </div>
        </div>

        {/* Allergens */}
        <div style={section}>
          <h3 style={sectionTitle}>Allergens <span style={req}>*</span></h3>
          <AllergenChipSelect
            allergens={allergens}
            selectedIds={allergenIds}
            onChange={setAllergenIds}
          />
        </div>

        {/* Nutrition */}
        <div style={section}>
          <h3 style={sectionTitle}>Nutrition (optional)</h3>
          <NutritionFieldGroup
            values={nutrition}
            onChange={(field, val) => setNutrition((n) => ({ ...n, [field]: val }))}
          />
        </div>

        {/* Portions */}
        <div style={section}>
          <h3 style={sectionTitle}>Portions</h3>
          {portions.length === 0 && (
            <p style={{ color: "#6c757d", fontSize: "0.88rem", margin: "0 0 0.75rem" }}>No portions added.</p>
          )}
          {portions.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: "1 0 120px" }}>
                <label style={labelStyle}>Label</label>
                <input value={p.portion_label} onChange={(e) => updatePortion(i, "portion_label", e.target.value)} style={input} placeholder="Small" />
              </div>
              <div style={{ flex: "0 0 80px" }}>
                <label style={labelStyle}>Qty</label>
                <input type="number" min="0" step="0.01" value={p.serving_size_qty} onChange={(e) => updatePortion(i, "serving_size_qty", e.target.value)} style={input} />
              </div>
              <div style={{ flex: "0 0 80px" }}>
                <label style={labelStyle}>Unit</label>
                <input value={p.serving_size_unit} onChange={(e) => updatePortion(i, "serving_size_unit", e.target.value)} style={input} placeholder="g" />
              </div>
              <div style={{ flex: "0 0 100px" }}>
                <label style={labelStyle}>Price Mult.</label>
                <input type="number" min="0" step="0.01" value={p.price_multiplier} onChange={(e) => updatePortion(i, "price_multiplier", e.target.value)} style={input} />
              </div>
              <button type="button" onClick={() => removePortion(i)} style={iconBtn}>×</button>
            </div>
          ))}
          <button type="button" onClick={addPortion} style={outlineBtn}>+ Add Portion</button>
        </div>

        {/* Addons */}
        <div style={section}>
          <h3 style={sectionTitle}>Add-ons</h3>
          {addons.length === 0 && (
            <p style={{ color: "#6c757d", fontSize: "0.88rem", margin: "0 0 0.75rem" }}>No add-ons added.</p>
          )}
          {addons.map((a, i) => (
            <div key={i} style={{ border: "1px solid #dee2e6", borderRadius: "6px", padding: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: 1, minWidth: "140px" }}>
                  <label style={labelStyle}>Add-on Name</label>
                  <input value={a.addon_name} onChange={(e) => updateAddon(i, "addon_name", e.target.value)} style={input} placeholder="Extra Syrup" />
                </div>
                <div style={{ flex: "0 0 130px" }}>
                  <label style={labelStyle}>Additional Cost</label>
                  <CurrencyInput value={a.additional_cost} onChange={(v) => updateAddon(i, "additional_cost", v)} />
                </div>
                <button type="button" onClick={() => removeAddon(i)} style={iconBtn}>×</button>
              </div>
              <div>
                <label style={labelStyle}>Allergens (optional)</label>
                <AllergenChipSelect
                  allergens={allergens}
                  selectedIds={a.allergen_ids}
                  onChange={(ids) => updateAddon(i, "allergen_ids", ids)}
                />
              </div>
            </div>
          ))}
          <button type="button" onClick={addAddon} style={outlineBtn}>+ Add Add-on</button>
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
const iconBtn: React.CSSProperties    = { padding: "6px 10px", background: "#fff", color: "#dc3545", border: "1px solid #dc3545", borderRadius: "4px", cursor: "pointer" };
const errorBox: React.CSSProperties   = { background: "#f8d7da", color: "#842029", padding: "10px 14px", borderRadius: "6px", marginBottom: "1rem" };
const section: React.CSSProperties    = { marginBottom: "1.75rem", padding: "1.25rem", border: "1px solid #dee2e6", borderRadius: "8px" };
const sectionTitle: React.CSSProperties = { margin: "0 0 1rem 0", fontSize: "1rem", fontWeight: 600, color: "#212529" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", fontWeight: 500, color: "#495057", marginBottom: "4px" };
const req: React.CSSProperties        = { color: "#dc3545" };
const input: React.CSSProperties      = { display: "block", width: "100%", padding: "7px 10px", border: "1px solid #ced4da", borderRadius: "6px", fontSize: "0.9rem", boxSizing: "border-box" };
