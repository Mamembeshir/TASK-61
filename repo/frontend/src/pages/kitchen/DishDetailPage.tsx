import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Utensils, Plus } from "lucide-react";
import { dishApi, allergenApi, type DishDetail, type DishVersionRead, type Allergen } from "@/api/foodservice";
import StatusBadge from "@/components/StatusBadge";
import {
  PageHeader, Button, Card, Table, Tr, Td,
  AlertBanner, Modal,
} from "@/components/ui";
import { colors, font, radius } from "@/styles/tokens";

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

  if (loading) {
    return (
      <div>
        <PageHeader title="Loading dish…" icon={<Utensils size={22} />} />
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <PageHeader title="Dish" icon={<Utensils size={22} />} />
        <AlertBanner type="error" message={error} />
      </div>
    );
  }
  if (!dish) return null;

  const av = dish.active_version;
  void allergens;

  return (
    <div>
      <PageHeader
        title={dish.name ?? "Dish"}
        subtitle={av ? `Active version v${av.version_number}` : "No active version yet"}
        icon={<Utensils size={22} />}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/kitchen/dishes")}
              icon={<ArrowLeft size={14} />}
            >
              Dishes
            </Button>
            {av ? <StatusBadge status="ACTIVE" size="md" /> : <StatusBadge status="DRAFT" size="md" />}
            <Button
              variant="primary"
              onClick={() => navigate(`/kitchen/dishes/${id}/versions/new`)}
              icon={<Plus size={16} />}
            >
              New Version
            </Button>
          </>
        }
      />

      {/* Active version card */}
      {av ? (
        <Card style={{ marginBottom: "1.5rem" }}>
          <h3 style={{
            margin: "0 0 1rem",
            fontSize: font.size.lg,
            fontWeight: font.weight.semibold,
            color: colors.text,
            letterSpacing: font.tracking.tight,
          }}>
            Active Version · v{av.version_number}
          </h3>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "0.85rem",
            marginBottom: "1.5rem",
          }}>
            <Stat
              label="Per-Serving Cost"
              value={`$${parseFloat(av.per_serving_cost).toFixed(2)}`}
              mono
            />
            <Stat label="Effective From" value={av.effective_from} />
          </div>

          {av.description && (
            <p style={{
              color: colors.textSecondary,
              fontSize: font.size.base,
              marginBottom: "1.25rem",
              lineHeight: 1.6,
            }}>
              {av.description}
            </p>
          )}

          {/* Allergens */}
          <Section title="Allergens">
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {av.allergens.length === 0 ? (
                <span style={{ color: colors.textMuted, fontSize: font.size.sm }}>None declared</span>
              ) : av.allergens.map((a) => (
                <span
                  key={a.id}
                  style={{
                    padding: "4px 11px",
                    borderRadius: radius.full,
                    fontSize: font.size.xs,
                    fontWeight: font.weight.semibold,
                    background: CHIP_COLORS[a.code] ?? "#e2e3e5",
                    color: colors.gray800,
                  }}
                >
                  {a.name}
                </span>
              ))}
            </div>
          </Section>

          {/* Nutrition */}
          <Section title="Nutrition">
            {av.has_nutrition ? (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(110px, 1fr))",
                gap: "0.75rem",
                maxWidth: "560px",
              }}>
                <NutStat label="Calories" value={`${av.calories}`} unit="kcal" />
                <NutStat label="Protein"  value={`${av.protein_g}`} unit="g" />
                <NutStat label="Carbs"    value={`${av.carbs_g}`} unit="g" />
                <NutStat label="Fat"      value={`${av.fat_g}`} unit="g" />
              </div>
            ) : (
              <span style={{ color: colors.textMuted, fontSize: font.size.sm }}>Not provided</span>
            )}
          </Section>

          {/* Portions */}
          {av.portions.length > 0 && (
            <Section title="Portions">
              <Table columns={["Label", "Size", "Price Multiplier"]}>
                {av.portions.map((p) => (
                  <Tr key={p.id}>
                    <Td style={{ fontWeight: font.weight.medium }}>{p.portion_label}</Td>
                    <Td style={{ color: colors.textSecondary }}>
                      {p.serving_size_qty} {p.serving_size_unit}
                    </Td>
                    <Td style={{
                      fontVariantNumeric: "tabular-nums",
                      fontFamily: font.familyMono,
                      fontSize: font.size.sm,
                    }}>
                      ×{p.price_multiplier}
                    </Td>
                  </Tr>
                ))}
              </Table>
            </Section>
          )}

          {/* Addons */}
          {av.addons.length > 0 && (
            <Section title="Add-ons" noBottomMargin>
              <Table columns={["Name", "Additional Cost", "Allergens"]}>
                {av.addons.map((a) => (
                  <Tr key={a.id}>
                    <Td style={{ fontWeight: font.weight.medium }}>{a.addon_name}</Td>
                    <Td style={{
                      fontVariantNumeric: "tabular-nums",
                      fontFamily: font.familyMono,
                      fontSize: font.size.sm,
                    }}>
                      ${parseFloat(a.additional_cost).toFixed(2)}
                    </Td>
                    <Td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        {a.allergens.map((al) => (
                          <span
                            key={al.id}
                            style={{
                              padding: "2px 8px",
                              borderRadius: radius.full,
                              fontSize: font.size.xs,
                              fontWeight: font.weight.semibold,
                              background: CHIP_COLORS[al.code] ?? "#e2e3e5",
                              color: colors.gray800,
                            }}
                          >
                            {al.name}
                          </span>
                        ))}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Table>
            </Section>
          )}
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
            No active version for this dish yet.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/kitchen/dishes/${id}/versions/new`)}
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

      <Table columns={["Ver.", "Name", "Status", "Effective From", "Cost", ""]}>
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
            <Td style={{ color: colors.textSecondary }}>{v.name}</Td>
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
            <Td>
              {v.status === "DRAFT" && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => { setActError(null); setActivating(v); }}
                  >
                    Activate
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
            <Button variant="secondary" onClick={() => setActivating(null)}>Cancel</Button>
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
    </div>
  );
}

function Section({ title, children, noBottomMargin }: {
  title: string;
  children: React.ReactNode;
  noBottomMargin?: boolean;
}) {
  return (
    <div style={{ marginBottom: noBottomMargin ? 0 : "1.5rem" }}>
      <h4 style={{
        margin: "0 0 0.6rem",
        fontSize: font.size.xs,
        fontWeight: font.weight.semibold,
        color: colors.textMuted,
        textTransform: "uppercase",
        letterSpacing: font.tracking.wider,
      }}>
        {title}
      </h4>
      {children}
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
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

function NutStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div style={{
      textAlign: "center",
      padding: "0.7rem 0.5rem",
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      background: colors.surfaceAlt,
    }}>
      <div style={{
        fontSize: font.size.xs,
        color: colors.textMuted,
        fontWeight: font.weight.semibold,
        textTransform: "uppercase",
        letterSpacing: font.tracking.wider,
      }}>
        {label}
      </div>
      <div style={{
        fontWeight: font.weight.bold,
        fontSize: font.size.lg,
        color: colors.text,
        marginTop: "3px",
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
        <span style={{
          fontSize: font.size.xs,
          color: colors.textMuted,
          fontWeight: font.weight.medium,
          marginLeft: "3px",
        }}>
          {unit}
        </span>
      </div>
    </div>
  );
}
