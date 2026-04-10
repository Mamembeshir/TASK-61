/**
 * KitchenPage — hub overview for all foodservice resources.
 * Links to Recipes, Dishes, Menus with live counts + recent items.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Utensils, ClipboardList, Plus, ArrowRight, ChefHat } from "lucide-react";
import { recipeApi, dishApi, menuApi, RecipeListItem, DishListItem, MenuListItem } from "@/api/foodservice";
import { PageHeader, StatCard, SkeletonLine } from "@/components/ui";
import { colors, radius, font, shadows, transition } from "@/styles/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HubSection<T> {
  loading: boolean;
  items: T[];
  error: boolean;
}

// ---------------------------------------------------------------------------
// Hub card — links to a sub-section with icon, count, description, recent list
// ---------------------------------------------------------------------------

interface HubCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  accent: string;
  count: number | null;
  loading: boolean;
  recentItems: { label: string; sub?: string }[];
  onNavigate: () => void;
  onNew: () => void;
  newLabel: string;
}

function HubCard({
  icon, title, description, accent, count, loading,
  recentItems, onNavigate, onNew, newLabel,
}: HubCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: colors.surface,
        borderRadius: radius.lg,
        boxShadow: hovered ? shadows.lg : shadows.md,
        border: `1px solid ${colors.border}`,
        borderTop: `3px solid ${accent}`,
        overflow: "hidden",
        transition: `box-shadow ${transition.base}`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div style={{ padding: "1.25rem 1.5rem", borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <div style={{
            width: 44, height: 44, borderRadius: radius.md,
            background: accent + "18",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: accent,
          }}>
            {icon}
          </div>
          {loading ? (
            <SkeletonLine width="40px" height="28px" />
          ) : (
            <span style={{
              fontSize: "1.75rem",
              fontWeight: font.weight.bold,
              color: colors.text,
              lineHeight: 1,
            }}>
              {count ?? 0}
            </span>
          )}
        </div>
        <h3 style={{ margin: 0, fontSize: font.size.xl, fontWeight: font.weight.semibold, color: colors.text }}>
          {title}
        </h3>
        <p style={{ margin: "0.25rem 0 0", fontSize: font.size.sm, color: colors.textMuted }}>
          {description}
        </p>
      </div>

      {/* Recent items */}
      <div style={{ flex: 1, padding: "0.75rem 1.5rem" }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1, 2, 3].map(i => <SkeletonLine key={i} />)}
          </div>
        ) : recentItems.length === 0 ? (
          <p style={{ fontSize: font.size.sm, color: colors.textMuted, margin: 0, padding: "0.5rem 0" }}>
            No {title.toLowerCase()} yet.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {recentItems.slice(0, 4).map((item, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "5px 0",
                borderBottom: i < recentItems.slice(0, 4).length - 1 ? `1px solid ${colors.border}` : "none",
              }}>
                <span style={{ fontSize: font.size.sm, color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>
                  {item.label}
                </span>
                {item.sub && (
                  <span style={{ fontSize: font.size.xs, color: colors.textMuted }}>
                    {item.sub}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{
        padding: "1rem 1.5rem",
        borderTop: `1px solid ${colors.border}`,
        display: "flex",
        gap: "0.5rem",
      }}>
        <button
          onClick={onNavigate}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.375rem",
            padding: "7px 12px",
            borderRadius: radius.md,
            border: `1px solid ${colors.border}`,
            background: "transparent",
            color: colors.textSecondary,
            fontSize: font.size.sm,
            fontWeight: font.weight.medium,
            cursor: "pointer",
            transition: `all ${transition.base}`,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = colors.surfaceHover;
            (e.currentTarget as HTMLElement).style.color = colors.text;
            (e.currentTarget as HTMLElement).style.borderColor = colors.gray300;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = colors.textSecondary;
            (e.currentTarget as HTMLElement).style.borderColor = colors.border;
          }}
        >
          View all <ArrowRight size={13} />
        </button>
        <button
          onClick={onNew}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
            padding: "7px 12px",
            borderRadius: radius.md,
            border: "none",
            background: accent,
            color: "#fff",
            fontSize: font.size.sm,
            fontWeight: font.weight.medium,
            cursor: "pointer",
            transition: `opacity ${transition.base}`,
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = "0.88")}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = "1")}
        >
          <Plus size={14} /> {newLabel}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function KitchenPage() {
  const navigate = useNavigate();

  const [recipes,  setRecipes]  = useState<HubSection<RecipeListItem>>({ loading: true, items: [], error: false });
  const [dishes,   setDishes]   = useState<HubSection<DishListItem>>({ loading: true, items: [], error: false });
  const [menus,    setMenus]    = useState<HubSection<MenuListItem>>({ loading: true, items: [], error: false });

  useEffect(() => {
    recipeApi.list().then(items => setRecipes({ loading: false, items, error: false }))
      .catch(() => setRecipes({ loading: false, items: [], error: true }));
    dishApi.list().then(items => setDishes({ loading: false, items, error: false }))
      .catch(() => setDishes({ loading: false, items: [], error: true }));
    menuApi.list().then(items => setMenus({ loading: false, items, error: false }))
      .catch(() => setMenus({ loading: false, items: [], error: true }));
  }, []);

  const publishedMenus = menus.items.filter(m => m.published_version_number !== null).length;
  const activeRecipes  = recipes.items.length;
  const activeDishes   = dishes.items.length;

  return (
    <div>
      <PageHeader
        title="Kitchen"
        subtitle="Manage your recipes, dishes, and menus in one place"
        icon={<ChefHat size={22} />}
      />

      {/* Summary stats */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: "1rem",
        marginBottom: "2rem",
      }}>
        <StatCard
          label="Recipes"
          value={recipes.loading ? null : activeRecipes}
          icon={<BookOpen size={18} />}
          accent={colors.primary}
          loading={recipes.loading}
        />
        <StatCard
          label="Dishes"
          value={dishes.loading ? null : activeDishes}
          icon={<Utensils size={18} />}
          accent={colors.info}
          loading={dishes.loading}
        />
        <StatCard
          label="Published Menus"
          value={menus.loading ? null : publishedMenus}
          icon={<ClipboardList size={18} />}
          accent={colors.success}
          loading={menus.loading}
        />
        <StatCard
          label="Total Menus"
          value={menus.loading ? null : menus.items.length}
          icon={<ClipboardList size={18} />}
          accent={colors.warning}
          loading={menus.loading}
        />
      </div>

      {/* Hub cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: "1.5rem",
      }}>
        <HubCard
          icon={<BookOpen size={22} />}
          title="Recipes"
          description="Base ingredient specifications and preparation steps"
          accent={colors.primary}
          count={recipes.loading ? null : activeRecipes}
          loading={recipes.loading}
          recentItems={recipes.items.slice(0, 4).map(r => ({
            label: r.name,
            sub: r.per_serving_cost ? `$${parseFloat(r.per_serving_cost).toFixed(2)}/srv` : undefined,
          }))}
          onNavigate={() => navigate("/kitchen/recipes")}
          onNew={() => navigate("/kitchen/recipes/new")}
          newLabel="Recipe"
        />

        <HubCard
          icon={<Utensils size={22} />}
          title="Dishes"
          description="Menu items with nutrition, allergens, and pricing"
          accent={colors.info}
          count={dishes.loading ? null : activeDishes}
          loading={dishes.loading}
          recentItems={dishes.items.slice(0, 4).map(d => ({
            label: d.name ?? "Unnamed dish",
            sub: d.allergen_names.length > 0 ? d.allergen_names.slice(0, 2).join(", ") : undefined,
          }))}
          onNavigate={() => navigate("/kitchen/dishes")}
          onNew={() => navigate("/kitchen/dishes/new")}
          newLabel="Dish"
        />

        <HubCard
          icon={<ClipboardList size={22} />}
          title="Menus"
          description="Publish site-specific menus from versioned dish groups"
          accent={colors.success}
          count={menus.loading ? null : menus.items.length}
          loading={menus.loading}
          recentItems={menus.items.slice(0, 4).map(m => ({
            label: m.name,
            sub: m.published_version_number !== null ? `v${m.published_version_number} published` : "Draft",
          }))}
          onNavigate={() => navigate("/kitchen/menus")}
          onNew={() => navigate("/kitchen/menus/new")}
          newLabel="Menu"
        />
      </div>
    </div>
  );
}
