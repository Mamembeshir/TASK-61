import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, Plus } from "lucide-react";
import { recipeApi, type RecipeDetail, type RecipeVersion, UNIT_LABELS } from "@/api/foodservice";
import StatusBadge from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  PageHeader, Button, Card, Table, Tr, Td,
  AlertBanner, Modal,
} from "@/components/ui";
import { colors, font, radius } from "@/styles/tokens";

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
    const params = new URLSearchParams({ prefill: v.id });
    navigate(`/kitchen/recipes/${id}/versions/new?${params}`);
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Loading recipe…" icon={<BookOpen size={22} />} />
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <PageHeader
          title="Recipe"
          icon={<BookOpen size={22} />}
          actions={
            <Button variant="ghost" size="sm" onClick={() => navigate("/kitchen/recipes")} icon={<ArrowLeft size={14} />}>
              Back
            </Button>
          }
        />
        <AlertBanner type="error" message={error} />
      </div>
    );
  }
  if (!recipe) return null;

  const av = recipe.active_version;

  return (
    <div>
      <PageHeader
        title={recipe.name}
        subtitle={av ? `Active version v${av.version_number}` : "No active version yet"}
        icon={<BookOpen size={22} />}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/kitchen/recipes")}
              icon={<ArrowLeft size={14} />}
            >
              Recipes
            </Button>
            {av ? <StatusBadge status="ACTIVE" size="md" /> : <StatusBadge status="DRAFT" size="md" />}
            {av ? (
              <Button variant="primary" onClick={prefillNewVersion} icon={<Plus size={16} />}>
                New Version
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => navigate(`/kitchen/recipes/${id}/versions/new`)}
                icon={<Plus size={16} />}
              >
                New Version
              </Button>
            )}
          </>
        }
      />

      {/* Active version card */}
      {av ? (
        <Card style={{ marginBottom: "1.5rem" }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "flex-start",
            marginBottom: "1.25rem",
          }}>
            <h3 style={{
              margin: 0,
              fontSize: font.size.lg,
              fontWeight: font.weight.semibold,
              color: colors.text,
              letterSpacing: font.tracking.tight,
            }}>
              Active Version · v{av.version_number}
            </h3>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "0.85rem",
            marginBottom: "1.5rem",
          }}>
            <Stat label="Servings" value={av.servings} />
            <Stat label="Effective From" value={av.effective_from} />
            <Stat
              label="Per-Serving Cost"
              value={`$${parseFloat(av.per_serving_cost).toFixed(2)}`}
              mono
            />
          </div>

          {/* Ingredients */}
          <SectionHead>Ingredients</SectionHead>
          <div style={{ marginBottom: "1.5rem" }}>
            <Table columns={["Ingredient", "Qty", "Unit", "Unit Cost", "Line Total"]}>
              {av.ingredients.map((ing) => (
                <Tr key={ing.id}>
                  <Td style={{ fontWeight: font.weight.medium, color: colors.text }}>
                    {ing.ingredient_name}
                  </Td>
                  <Td style={{ fontVariantNumeric: "tabular-nums", color: colors.textSecondary }}>
                    {ing.quantity}
                  </Td>
                  <Td style={{ color: colors.textMuted, fontSize: font.size.sm }}>
                    {UNIT_LABELS[ing.unit] ?? ing.unit}
                  </Td>
                  <Td style={{
                    fontVariantNumeric: "tabular-nums",
                    fontFamily: font.familyMono,
                    fontSize: font.size.sm,
                    color: colors.textSecondary,
                  }}>
                    ${parseFloat(ing.unit_cost).toFixed(4)}
                  </Td>
                  <Td style={{
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    fontFamily: font.familyMono,
                    fontWeight: font.weight.semibold,
                    color: colors.text,
                  }}>
                    ${(parseFloat(ing.quantity) * parseFloat(ing.unit_cost)).toFixed(2)}
                  </Td>
                </Tr>
              ))}
            </Table>
          </div>

          {/* Steps */}
          <SectionHead>Steps</SectionHead>
          <ol style={{
            paddingLeft: "1.25rem",
            margin: 0,
            color: colors.textSecondary,
            lineHeight: 1.65,
          }}>
            {av.steps.map((s) => (
              <li key={s.id} style={{
                marginBottom: "0.55rem",
                fontSize: font.size.base,
                color: colors.text,
              }}>
                {s.instruction}
              </li>
            ))}
          </ol>
        </Card>
      ) : (
        <Card style={{
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}>
          <span style={{ color: colors.textMuted, fontSize: font.size.base }}>
            No active version — activate a draft version to make it live.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/kitchen/recipes/${id}/versions/new`)}
            icon={<Plus size={14} />}
          >
            New Version
          </Button>
        </Card>
      )}

      {/* Version list */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        margin: "1.5rem 0 0.85rem",
      }}>
        <h3 style={{
          margin: 0,
          fontSize: font.size.lg,
          fontWeight: font.weight.semibold,
          color: colors.text,
          letterSpacing: font.tracking.tight,
        }}>
          Version History
        </h3>
        <span style={{ fontSize: font.size.sm, color: colors.textMuted }}>
          {versions.length} total
        </span>
      </div>

      <Table columns={["Ver.", "Status", "Effective From", "Per-Serving Cost", "Created", ""]}>
        {versions.map((v) => (
          <Tr key={v.id}>
            <Td style={{
              fontVariantNumeric: "tabular-nums",
              fontFamily: font.familyMono,
              fontWeight: font.weight.semibold,
              color: colors.text,
            }}>
              v{v.version_number}
            </Td>
            <Td><StatusBadge status={v.status} /></Td>
            <Td style={{ color: colors.textSecondary, fontSize: font.size.sm, whiteSpace: "nowrap" }}>
              {v.effective_from}
            </Td>
            <Td style={{
              fontVariantNumeric: "tabular-nums",
              fontFamily: font.familyMono,
              fontSize: font.size.sm,
              color: colors.text,
            }}>
              ${parseFloat(v.per_serving_cost).toFixed(2)}
            </Td>
            <Td style={{ color: colors.textMuted, fontSize: font.size.sm, whiteSpace: "nowrap" }}>
              {new Date(v.created_at).toLocaleDateString()}
            </Td>
            <Td>
              {v.status === "DRAFT" && (
                <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => { setActError(null); setActivating(v); }}
                  >
                    Activate
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setDeleting(v)}
                    style={{ color: colors.danger, borderColor: colors.dangerLight }}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </Td>
          </Tr>
        ))}
      </Table>

      {/* Activate modal */}
      <Modal
        open={!!activating}
        onClose={() => setActivating(null)}
        title={activating ? `Activate Version v${activating.version_number}?` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setActivating(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => activating && handleActivate(activating)}
              loading={actLoading}
            >
              Activate
            </Button>
          </>
        }
      >
        <p style={{ color: colors.textSecondary, fontSize: font.size.base, margin: "0 0 0.75rem" }}>
          This will supersede the current active version. Proceed?
        </p>
        {actError && <AlertBanner type="error" message={actError} />}
      </Modal>

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

function Stat({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div style={{
      padding: "0.85rem 1rem",
      borderRadius: radius.md,
      background: colors.surfaceAlt,
      border: `1px solid ${colors.border}`,
    }}>
      <div style={{
        fontSize: font.size.xs,
        color: colors.textMuted,
        textTransform: "uppercase",
        letterSpacing: font.tracking.wider,
        fontWeight: font.weight.semibold,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: font.size.lg,
        fontWeight: font.weight.bold,
        color: colors.text,
        marginTop: "4px",
        letterSpacing: font.tracking.tight,
        fontFamily: mono ? font.familyMono : font.family,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h4 style={{
      margin: "0 0 0.6rem",
      fontSize: font.size.xs,
      fontWeight: font.weight.semibold,
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: font.tracking.wider,
    }}>
      {children}
    </h4>
  );
}
