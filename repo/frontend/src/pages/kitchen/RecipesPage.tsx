import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Plus } from "lucide-react";
import { recipeApi, type RecipeListItem } from "@/api/foodservice";
import SearchInput from "@/components/SearchInput";
import StatusBadge from "@/components/StatusBadge";
import {
  PageHeader, Button, Card, Table, Tr, Td, EmptyState,
  SkeletonTable, AlertBanner,
} from "@/components/ui";
import { colors, font } from "@/styles/tokens";

export default function RecipesPage() {
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
  const [search,  setSearch]  = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await recipeApi.list({ search: search || undefined });
      setRecipes(data);
    } catch (e: any) {
      setError(e.message ?? "Failed to load recipes.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader
        title="Recipes"
        subtitle={loading
          ? "Loading recipes…"
          : `${recipes.length} recipe${recipes.length === 1 ? "" : "s"} in your library`}
        icon={<BookOpen size={22} />}
        actions={
          <Button
            variant="primary"
            onClick={() => navigate("/kitchen/recipes/new")}
            icon={<Plus size={16} />}
          >
            New Recipe
          </Button>
        }
      />

      {/* Filters */}
      <Card padding="1rem 1.15rem" style={{ marginBottom: "1.15rem" }}>
        <div style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}>
          <div style={{ flex: "1 1 260px", minWidth: 240 }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Search recipes…" />
          </div>
          {search && (
            <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
              Clear
            </Button>
          )}
        </div>
      </Card>

      {error && <AlertBanner type="error" message={error} onClose={() => setError(null)} />}

      {loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : recipes.length === 0 ? (
        <Card padding="0">
          <EmptyState
            icon="📖"
            title="No recipes found"
            description={search
              ? "Try a different search term, or create a new recipe."
              : "Build your first recipe to start tracking ingredient specs and costs."}
            action={
              <Button variant="primary" onClick={() => navigate("/kitchen/recipes/new")} icon={<Plus size={16} />}>
                New Recipe
              </Button>
            }
          />
        </Card>
      ) : (
        <Table columns={["Name", "Active Ver.", "Effective From", "Per-Serving Cost", "Status"]}>
          {recipes.map((r) => (
            <Tr key={r.id} onClick={() => navigate(`/kitchen/recipes/${r.id}`)}>
              <Td style={{ fontWeight: font.weight.semibold, color: colors.text }}>
                {r.name}
              </Td>
              <Td style={{
                color: colors.textSecondary,
                fontVariantNumeric: "tabular-nums",
                textAlign: "center",
              }}>
                {r.active_version_number ?? "—"}
              </Td>
              <Td style={{ color: colors.textMuted, fontSize: font.size.sm, whiteSpace: "nowrap" }}>
                {r.effective_from ?? "—"}
              </Td>
              <Td style={{
                color: colors.text,
                fontVariantNumeric: "tabular-nums",
                fontFamily: font.familyMono,
                fontSize: font.size.sm,
              }}>
                {r.per_serving_cost ? `$${parseFloat(r.per_serving_cost).toFixed(2)}` : "—"}
              </Td>
              <Td>
                {r.active_version_number
                  ? <StatusBadge status="ACTIVE" />
                  : <StatusBadge status="DRAFT" />}
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
