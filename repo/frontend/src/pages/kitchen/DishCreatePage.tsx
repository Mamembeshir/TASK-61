import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Utensils, Plus, X } from "lucide-react";
import { dishApi, allergenApi, type Allergen, type RecipeListItem } from "@/api/foodservice";
import CurrencyInput from "@/components/CurrencyInput";
import AllergenChipSelect from "@/components/AllergenChipSelect";
import NutritionFieldGroup from "@/components/NutritionFieldGroup";
import RecipeAutocomplete from "@/components/RecipeAutocomplete";
import {
  PageHeader, Button, Card, Field, AlertBanner,
} from "@/components/ui";
import { inputStyle, textareaStyle } from "@/styles/forms";
import { colors, font, radius } from "@/styles/tokens";

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

  useEffect(() => {
    if (recipe?.per_serving_cost) {
      setCost(parseFloat(recipe.per_serving_cost).toFixed(2));
    }
  }, [recipe]);

  function addPortion() {
    setPortions((p) => [...p, { portion_label: "", serving_size_qty: "", serving_size_unit: "", price_multiplier: "1.00" }]);
  }
  function removePortion(i: number) {
    setPortions((p) => p.filter((_, idx) => idx !== i));
  }
  function updatePortion(i: number, field: keyof Portion, val: string) {
    setPortions((p) => p.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  }

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
    <div>
      <PageHeader
        title="New Dish"
        subtitle="Define dish, link a recipe, and declare allergens"
        icon={<Utensils size={22} />}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/kitchen/dishes")}
            icon={<ArrowLeft size={14} />}
          >
            Dishes
          </Button>
        }
      />

      {error && <AlertBanner type="error" message={error} onClose={() => setError(null)} />}

      <form onSubmit={handleSubmit}>
        {/* Basic info */}
        <Card style={{ marginBottom: "1.25rem" }}>
          <SectionTitle>Basic Details</SectionTitle>
          <div className="hb-stack-sm" style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: "1rem", marginBottom: "1rem" }}>
            <Field label="Name" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
                placeholder="e.g. Pancake Stack"
                required
              />
            </Field>
            <Field label="Effective From" required>
              <input
                type="date"
                value={effFrom}
                onChange={(e) => setEffFrom(e.target.value)}
                style={inputStyle}
                required
              />
            </Field>
          </div>
          <Field label="Description" hint={`${description.length}/1000`}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={3}
              style={textareaStyle}
              placeholder="Optional description…"
            />
          </Field>
        </Card>

        {/* Recipe link + cost */}
        <Card style={{ marginBottom: "1.25rem" }}>
          <SectionTitle>Recipe Link &amp; Cost</SectionTitle>
          <Field label="Link Recipe (optional)">
            <RecipeAutocomplete
              value={recipe}
              onChange={(r) => {
                setRecipe(r);
                if (!r) setCost("");
              }}
              placeholder="Search recipes…"
            />
          </Field>
          {recipe?.per_serving_cost && (
            <div style={{
              marginTop: "0.6rem",
              padding: "8px 12px",
              background: colors.successSoft,
              color: colors.successDark,
              border: `1px solid ${colors.successLight}`,
              borderLeft: `3px solid ${colors.success}`,
              borderRadius: radius.md,
              fontSize: font.size.sm,
            }}>
              Auto-filled from active version: <strong>${parseFloat(recipe.per_serving_cost).toFixed(2)}</strong> / serving
            </div>
          )}
          <div style={{ maxWidth: "200px", marginTop: "1rem" }}>
            <Field label="Per-Serving Cost" required={!recipe}>
              <CurrencyInput
                value={cost}
                onChange={setCost}
                disabled={!!recipe}
                placeholder={recipe ? "Auto from recipe" : "$0.00"}
              />
            </Field>
          </div>
        </Card>

        {/* Allergens */}
        <Card style={{ marginBottom: "1.25rem" }}>
          <SectionTitle>
            Allergens <span style={{ color: colors.danger }}>*</span>
          </SectionTitle>
          <AllergenChipSelect
            allergens={allergens}
            selectedIds={allergenIds}
            onChange={setAllergenIds}
          />
        </Card>

        {/* Nutrition */}
        <Card style={{ marginBottom: "1.25rem" }}>
          <SectionTitle>Nutrition (optional)</SectionTitle>
          <NutritionFieldGroup
            values={nutrition}
            onChange={(field, val) => setNutrition((n) => ({ ...n, [field]: val }))}
          />
        </Card>

        {/* Portions */}
        <Card style={{ marginBottom: "1.25rem" }}>
          <SectionTitle>Portions</SectionTitle>
          {portions.length === 0 && (
            <p style={{
              color: colors.textMuted,
              fontSize: font.size.sm,
              margin: "0 0 0.75rem",
            }}>
              No portions added.
            </p>
          )}
          {portions.map((p, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 100px 100px 120px 40px",
                gap: "0.75rem",
                marginBottom: "0.75rem",
                alignItems: "end",
              }}
            >
              <Field label="Label">
                <input
                  value={p.portion_label}
                  onChange={(e) => updatePortion(i, "portion_label", e.target.value)}
                  style={inputStyle}
                  placeholder="Small"
                />
              </Field>
              <Field label="Qty">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={p.serving_size_qty}
                  onChange={(e) => updatePortion(i, "serving_size_qty", e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Unit">
                <input
                  value={p.serving_size_unit}
                  onChange={(e) => updatePortion(i, "serving_size_unit", e.target.value)}
                  style={inputStyle}
                  placeholder="g"
                />
              </Field>
              <Field label="Price Mult.">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={p.price_multiplier}
                  onChange={(e) => updatePortion(i, "price_multiplier", e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <button
                type="button"
                onClick={() => removePortion(i)}
                style={{ ...iconBtnStyle, marginBottom: "6px" }}
                title="Remove"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addPortion} icon={<Plus size={14} />}>
            Add Portion
          </Button>
        </Card>

        {/* Addons */}
        <Card style={{ marginBottom: "1.25rem" }}>
          <SectionTitle>Add-ons</SectionTitle>
          {addons.length === 0 && (
            <p style={{
              color: colors.textMuted,
              fontSize: font.size.sm,
              margin: "0 0 0.75rem",
            }}>
              No add-ons added.
            </p>
          )}
          {addons.map((a, i) => (
            <div
              key={i}
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: radius.md,
                padding: "1rem",
                marginBottom: "0.75rem",
                background: colors.surfaceAlt,
              }}
            >
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 150px 40px",
                gap: "0.75rem",
                marginBottom: "0.85rem",
                alignItems: "end",
              }}>
                <Field label="Add-on Name">
                  <input
                    value={a.addon_name}
                    onChange={(e) => updateAddon(i, "addon_name", e.target.value)}
                    style={inputStyle}
                    placeholder="Extra Syrup"
                  />
                </Field>
                <Field label="Additional Cost">
                  <CurrencyInput
                    value={a.additional_cost}
                    onChange={(v) => updateAddon(i, "additional_cost", v)}
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => removeAddon(i)}
                  style={{ ...iconBtnStyle, marginBottom: "6px" }}
                  title="Remove"
                >
                  <X size={14} />
                </button>
              </div>
              <Field label="Allergens (optional)">
                <AllergenChipSelect
                  allergens={allergens}
                  selectedIds={a.allergen_ids}
                  onChange={(ids) => updateAddon(i, "allergen_ids", ids)}
                />
              </Field>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addAddon} icon={<Plus size={14} />}>
            Add Add-on
          </Button>
        </Card>

        <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end" }}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/kitchen/dishes")}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            Save as Draft
          </Button>
        </div>
      </form>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      margin: "0 0 1rem 0",
      fontSize: font.size.md,
      fontWeight: font.weight.semibold,
      color: colors.text,
      letterSpacing: font.tracking.tight,
    }}>
      {children}
    </h3>
  );
}

const iconBtnStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: colors.surface,
  color: colors.danger,
  border: `1px solid ${colors.dangerLight}`,
  borderRadius: radius.sm,
  cursor: "pointer",
  padding: 0,
};
