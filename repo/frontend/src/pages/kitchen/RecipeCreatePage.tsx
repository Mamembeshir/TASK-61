import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, Plus, X, ChevronUp, ChevronDown } from "lucide-react";
import { recipeApi, UNIT_LABELS } from "@/api/foodservice";
import CurrencyInput from "@/components/CurrencyInput";
import {
  PageHeader, Button, Card, Field, AlertBanner,
} from "@/components/ui";
import { inputStyle, selectStyle, textareaStyle } from "@/styles/forms";
import { colors, font, radius } from "@/styles/tokens";

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

  function addIngredient() {
    setIngredients((prev) => [...prev, { ingredient_name: "", quantity: "", unit: "oz", unit_cost: "" }]);
  }
  function removeIngredient(i: number) {
    setIngredients((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateIngredient(i: number, field: keyof Ingredient, val: string) {
    setIngredients((prev) => prev.map((ing, idx) => idx === i ? { ...ing, [field]: val } : ing));
  }

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
    <div>
      <PageHeader
        title="New Recipe"
        subtitle="Define ingredients, steps, and initial cost basis"
        icon={<BookOpen size={22} />}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/kitchen/recipes")}
            icon={<ArrowLeft size={14} />}
          >
            Recipes
          </Button>
        }
      />

      {error && <AlertBanner type="error" message={error} onClose={() => setError(null)} />}

      <form onSubmit={handleSubmit}>
        {/* Basic info */}
        <Card style={{ marginBottom: "1.25rem" }}>
          <SectionTitle>Recipe Details</SectionTitle>
          <div className="hb-stack-sm" style={{ display: "grid", gridTemplateColumns: "1fr 160px 200px", gap: "1rem" }}>
            <Field label="Recipe Name" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
                placeholder="e.g. Classic Pancakes"
                required
              />
            </Field>
            <Field label="Servings" required>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                style={inputStyle}
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
        </Card>

        {/* Ingredients */}
        <Card style={{ marginBottom: "1.25rem" }}>
          <SectionTitle>Ingredients</SectionTitle>
          <div style={{
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            overflow: "hidden",
            marginBottom: "0.85rem",
          }}>
          {/* Horizontal scroll wrapper — keeps the table-like grid usable on phones */}
          <div style={{ overflowX: "auto" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "minmax(220px,1fr) 110px 140px 130px 110px 40px",
              gap: "0.5rem",
              padding: "10px 12px",
              minWidth: 760,
              background: colors.surfaceAlt,
              borderBottom: `1px solid ${colors.border}`,
              fontSize: font.size.xs,
              fontWeight: font.weight.semibold,
              color: colors.textMuted,
              textTransform: "uppercase",
              letterSpacing: font.tracking.wider,
            }}>
              <span>Ingredient</span>
              <span>Qty</span>
              <span>Unit</span>
              <span>Unit Cost</span>
              <span style={{ textAlign: "right" }}>Line Total</span>
              <span />
            </div>
            {ingredients.map((ing, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(220px,1fr) 110px 140px 130px 110px 40px",
                  gap: "0.5rem",
                  padding: "10px 12px",
                  minWidth: 760,
                  borderBottom: i < ingredients.length - 1 ? `1px solid ${colors.border}` : undefined,
                  alignItems: "center",
                }}
              >
                <input
                  value={ing.ingredient_name}
                  onChange={(e) => updateIngredient(i, "ingredient_name", e.target.value)}
                  style={{ ...inputStyle, padding: "7px 11px" }}
                  placeholder="Flour"
                />
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={ing.quantity}
                  onChange={(e) => updateIngredient(i, "quantity", e.target.value)}
                  style={{ ...inputStyle, padding: "7px 11px" }}
                  placeholder="2"
                />
                <select
                  value={ing.unit}
                  onChange={(e) => updateIngredient(i, "unit", e.target.value)}
                  style={{ ...selectStyle, padding: "7px 11px", paddingRight: 32 }}
                >
                  {UNITS.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                </select>
                <CurrencyInput
                  value={ing.unit_cost}
                  onChange={(v) => updateIngredient(i, "unit_cost", v)}
                />
                <span style={{
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  fontFamily: font.familyMono,
                  fontSize: font.size.sm,
                  color: colors.text,
                  fontWeight: font.weight.semibold,
                }}>
                  ${lineTotal(ing).toFixed(2)}
                </span>
                {ingredients.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeIngredient(i)}
                    title="Remove"
                    style={iconBtnStyle}
                  >
                    <X size={14} />
                  </button>
                ) : <span />}
              </div>
            ))}
          </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
            <Button type="button" variant="outline" size="sm" onClick={addIngredient} icon={<Plus size={14} />}>
              Add Ingredient
            </Button>
            <div style={{
              padding: "0.5rem 0.9rem",
              background: colors.primaryLight,
              border: `1px solid ${colors.primaryMid}`,
              borderRadius: radius.md,
              fontSize: font.size.sm,
              color: colors.textSecondary,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}>
              <span>Per-serving cost preview:</span>
              <strong style={{
                color: colors.primary,
                fontFamily: font.familyMono,
                fontVariantNumeric: "tabular-nums",
                fontWeight: font.weight.bold,
              }}>
                ${preview.toFixed(2)}
              </strong>
            </div>
          </div>
        </Card>

        {/* Steps */}
        <Card style={{ marginBottom: "1.25rem" }}>
          <SectionTitle>Steps</SectionTitle>
          {steps.map((s, i) => (
            <div key={i} style={{
              marginBottom: "0.85rem",
              display: "flex",
              gap: "0.6rem",
              alignItems: "flex-start",
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "3px", paddingTop: "22px" }}>
                <button
                  type="button"
                  onClick={() => moveStep(i, -1)}
                  disabled={i === 0}
                  style={arrowBtnStyle}
                  title="Move up"
                >
                  <ChevronUp size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => moveStep(i, 1)}
                  disabled={i === steps.length - 1}
                  style={arrowBtnStyle}
                  title="Move down"
                >
                  <ChevronDown size={13} />
                </button>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: font.size.xs,
                  color: colors.textMuted,
                  marginBottom: "5px",
                  fontWeight: font.weight.semibold,
                  textTransform: "uppercase",
                  letterSpacing: font.tracking.wider,
                }}>
                  Step {i + 1}
                </div>
                <textarea
                  value={s.instruction}
                  onChange={(e) => updateStep(i, e.target.value)}
                  maxLength={2000}
                  rows={3}
                  style={{ ...textareaStyle, minHeight: 72 }}
                  placeholder="Describe this step…"
                />
                <div style={{
                  textAlign: "right",
                  fontSize: font.size.xs,
                  color: colors.textMuted,
                  marginTop: "3px",
                }}>
                  {s.instruction.length}/2000
                </div>
              </div>
              {steps.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  style={{ ...iconBtnStyle, marginTop: "22px" }}
                  title="Remove"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addStep} icon={<Plus size={14} />}>
            Add Step
          </Button>
        </Card>

        <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end" }}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/kitchen/recipes")}
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
  width: 30,
  height: 30,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: colors.surface,
  color: colors.textMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.sm,
  cursor: "pointer",
  padding: 0,
};

const arrowBtnStyle: React.CSSProperties = {
  width: 24,
  height: 20,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: colors.surfaceAlt,
  color: colors.textSecondary,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.xs,
  cursor: "pointer",
  padding: 0,
};
