import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Utensils, Plus, Check } from "lucide-react";
import { dishApi, allergenApi, type DishListItem, type Allergen } from "@/api/foodservice";
import SearchInput from "@/components/SearchInput";
import {
  PageHeader, Button, Card, Table, Tr, Td, EmptyState,
  SkeletonTable, AlertBanner,
} from "@/components/ui";
import { colors, font, radius } from "@/styles/tokens";

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
  const activeFilters = include.size + exclude.size + (search ? 1 : 0);

  return (
    <div>
      <PageHeader
        title="Dishes"
        subtitle={loading
          ? "Loading dishes…"
          : `${dishes.length} dish${dishes.length === 1 ? "" : "es"} in your catalogue`}
        icon={<Utensils size={22} />}
        actions={
          <Button
            variant="primary"
            onClick={() => navigate("/kitchen/dishes/new")}
            icon={<Plus size={16} />}
          >
            New Dish
          </Button>
        }
      />

      {/* Filters */}
      <Card padding="1rem 1.15rem" style={{ marginBottom: "1.15rem" }}>
        <div style={{ display: "flex", gap: "0.85rem", alignItems: "center", marginBottom: nonNone.length ? "0.85rem" : 0 }}>
          <div style={{ flex: "1 1 260px", minWidth: 240 }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Search dishes…" />
          </div>
          {activeFilters > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(""); setInclude(new Set()); setExclude(new Set()); }}
            >
              Clear all
            </Button>
          )}
        </div>

        {nonNone.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <AllergenFilterGroup
              label="Include allergens"
              hint="Show only dishes with these"
              accent={colors.primary}
              accentBg={colors.primaryLight}
              accentText={colors.primary}
              allergens={nonNone}
              selected={include}
              onToggle={(id) => setInclude(toggleFilter(include, id, exclude))}
            />
            <AllergenFilterGroup
              label="Exclude allergens"
              hint="Hide dishes with these"
              accent={colors.danger}
              accentBg={colors.dangerLight}
              accentText={colors.dangerDark}
              allergens={nonNone}
              selected={exclude}
              onToggle={(id) => setExclude(toggleFilter(exclude, id, include))}
            />
          </div>
        )}
      </Card>

      {error && <AlertBanner type="error" message={error} onClose={() => setError(null)} />}

      {loading ? (
        <SkeletonTable rows={6} cols={4} />
      ) : dishes.length === 0 ? (
        <Card padding="0">
          <EmptyState
            icon="🍽️"
            title="No dishes found"
            description={activeFilters > 0
              ? "Try adjusting your filters, or create a new dish."
              : "Create your first dish to start building menus."}
            action={
              <Button variant="primary" onClick={() => navigate("/kitchen/dishes/new")} icon={<Plus size={16} />}>
                New Dish
              </Button>
            }
          />
        </Card>
      ) : (
        <Table columns={["Name", "Per-Serving Cost", "Allergens", "Nutrition"]}>
          {dishes.map((d) => (
            <Tr key={d.id} onClick={() => navigate(`/kitchen/dishes/${d.id}`)}>
              <Td style={{ fontWeight: font.weight.semibold, color: colors.text }}>
                {d.name ?? "—"}
              </Td>
              <Td style={{
                color: colors.text,
                fontVariantNumeric: "tabular-nums",
                fontFamily: font.familyMono,
                fontSize: font.size.sm,
              }}>
                {d.per_serving_cost ? `$${parseFloat(d.per_serving_cost).toFixed(2)}` : "—"}
              </Td>
              <Td>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {d.allergen_names.length === 0 ? (
                    <span style={{ color: colors.textMuted, fontSize: font.size.sm }}>—</span>
                  ) : d.allergen_names.map((name) => {
                    const a = allergens.find((al) => al.name === name);
                    const bg = CHIP_COLORS[a?.code ?? ""] ?? "#e2e3e5";
                    return (
                      <span
                        key={name}
                        style={{
                          padding: "2px 9px",
                          borderRadius: radius.full,
                          fontSize: font.size.xs,
                          fontWeight: font.weight.semibold,
                          background: bg,
                          color: colors.gray800,
                        }}
                      >
                        {name}
                      </span>
                    );
                  })}
                </div>
              </Td>
              <Td>
                {d.has_nutrition ? (
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    color: colors.successDark,
                    fontWeight: font.weight.semibold,
                    fontSize: font.size.sm,
                  }}>
                    <Check size={14} /> Yes
                  </span>
                ) : (
                  <span style={{ color: colors.textMuted, fontSize: font.size.sm }}>—</span>
                )}
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function AllergenFilterGroup({
  label, hint, accent, accentBg, accentText, allergens, selected, onToggle,
}: {
  label: string;
  hint: string;
  accent: string;
  accentBg: string;
  accentText: string;
  allergens: Allergen[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <div style={{
        fontSize: font.size.xs,
        color: colors.textMuted,
        fontWeight: font.weight.semibold,
        textTransform: "uppercase",
        letterSpacing: font.tracking.wider,
        marginBottom: "4px",
      }}>
        {label} <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: font.weight.normal }}>· {hint}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
        {allergens.map((a) => {
          const on = selected.has(a.id);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onToggle(a.id)}
              style={{
                padding: "3px 11px",
                borderRadius: radius.full,
                border: `1px solid ${on ? accent : colors.border}`,
                background: on ? accentBg : colors.surfaceAlt,
                color: on ? accentText : colors.textSecondary,
                cursor: "pointer",
                fontSize: font.size.xs,
                fontWeight: on ? font.weight.semibold : font.weight.medium,
                transition: "all 0.15s",
              }}
            >
              {a.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
