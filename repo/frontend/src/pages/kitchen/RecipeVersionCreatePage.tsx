import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, BookOpen, Plus, X, ChevronUp, ChevronDown } from "lucide-react";
import { recipeApi, UNIT_LABELS, type RecipeDetail, type RecipeVersion } from "@/api/foodservice";
import CurrencyInput from "@/components/CurrencyInput";
import {
  PageHeader, Button, Card, Field, AlertBanner, SkeletonCard,
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
  return (parseFloat(ing.quantity) || 0) * (parseFloat(ing.unit_cost) || 0);
}

function perServingCost(ingredients: Ingredient[], servings: string): number {
  const s = parseFloat(servings) || 1;
  return ingredients.reduce((acc, i) => acc + lineTotal(i), 0) / s;
}

export default function RecipeVersionCreatePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillId = searchParams.get("prefill");

  const [recipe,  setRecipe]  = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [servings,     setServings]     = useState("1");
  const [effFrom,      setEffFrom]      = useState(TODAY);
  const [ingredients,  setIngredients]  = useState<Ingredient[]>([
    { ingredient_name: "", quantity: "", unit: "oz", unit_cost: "" },
  ]);
  const [steps, setSteps] = useState<Step[]>([{ instruction: "" }]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      recipeApi.get(id),
      prefillId ? recipeApi.versions.get(id, prefillId) : Promise.resolve(null),
    ])
      .then(([rec, prefillVer]) => {
        setRecipe(rec);
        const source: RecipeVersion | null = prefillVer ?? rec.active_version;
        if (source) {
          setServings(String(source.servings));
          setEffFrom(TODAY);
          setIngredients(
            source.ingredients.map((i) => ({
              ingredient_name: i.ingredient_name,
              quantity: String(i.quantity),
              unit: i.unit,
              unit_cost: String(i.unit_cost),
            }))
          );
          setSteps(source.steps.map((s) => ({ instruction: s.instruction })));
        }
      })
      .catch((e) => setError(e.message ?? "Failed to load recipe."))
      .finally(() => setLoading(false));
  }, [id, prefillId]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    if (!id) return;
    if (ingredients.length === 0) { setSaveError("At least one ingredient is required."); return; }
    if (steps.length === 0) { setSaveError("At least one step is required."); return; }

    setSaving(true);
    try {
      await recipeApi.versions.create(id, {
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
      navigate(`/kitchen/recipes/${id}`);
    } catch (e: any) {
      setSaveError(e.message ?? "Failed to create version.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Loading version…" icon={<BookOpen size={22} />} />
        <SkeletonCard />
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <PageHeader title="New Version" icon={<BookOpen size={22} />} />
        <AlertBanner type="error" message={error} />
      </div>
    );
  }

  const preview = perServingCost(ingredients, servings);

  return (
    <div>
      <PageHeader
        title="New Version"
        subtitle={recipe ? recipe.name : undefined}
        icon={<BookOpen size={22} />}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/kitchen/recipes/${id}`)}
            icon={<ArrowLeft size={14} />}
          >
            Back
          </Button>
        }
      />

      {saveError && <AlertBanner type="error" message={saveError} onClose={() => setSaveError(null)} />}

      <form onSubmit={handleSubmit}>
        <Card style={{ marginBottom: "1.25rem" }}>
          <SectionTitle>Version Details</SectionTitle>
          <div className="hb-stack-sm" style={{ display: "grid", gridTemplateColumns: "160px 200px", gap: "1rem" }}>
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
            onClick={() => navigate(`/kitchen/recipes/${id}`)}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
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
