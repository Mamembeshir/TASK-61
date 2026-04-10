import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Plus } from "lucide-react";
import { menuApi, type MenuListItem } from "@/api/foodservice";
import StatusBadge from "@/components/StatusBadge";
import {
  PageHeader, Button, Table, Tr, Td, Card, EmptyState,
  SkeletonTable, AlertBanner,
} from "@/components/ui";
import { colors, font } from "@/styles/tokens";

export default function MenusPage() {
  const navigate = useNavigate();
  const [menus,   setMenus]   = useState<MenuListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setMenus(await menuApi.list());
    } catch (e: any) {
      setError(e.message ?? "Failed to load menus.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const publishedCount = menus.filter((m) => m.published_version_number).length;

  return (
    <div>
      <PageHeader
        title="Menus"
        subtitle={loading
          ? "Loading menus…"
          : `${menus.length} menu${menus.length === 1 ? "" : "s"} · ${publishedCount} published`}
        icon={<ClipboardList size={22} />}
        actions={
          <Button
            variant="primary"
            onClick={() => navigate("/kitchen/menus/new")}
            icon={<Plus size={16} />}
          >
            New Menu
          </Button>
        }
      />

      {error && <AlertBanner type="error" message={error} onClose={() => setError(null)} />}

      {loading ? (
        <SkeletonTable rows={6} cols={4} />
      ) : menus.length === 0 ? (
        <Card padding="0">
          <EmptyState
            icon="📋"
            title="No menus yet"
            description="Create a menu to group dishes and publish them to sites."
            action={
              <Button variant="primary" onClick={() => navigate("/kitchen/menus/new")} icon={<Plus size={16} />}>
                New Menu
              </Button>
            }
          />
        </Card>
      ) : (
        <Table columns={["Name", "Status", "Published Ver.", "Last Updated"]}>
          {menus.map((m) => (
            <Tr key={m.id} onClick={() => navigate(`/kitchen/menus/${m.id}`)}>
              <Td style={{ fontWeight: font.weight.semibold, color: colors.text }}>
                {m.name}
              </Td>
              <Td>
                {m.published_version_number
                  ? <StatusBadge status="PUBLISHED" />
                  : <StatusBadge status="DRAFT" />}
              </Td>
              <Td style={{
                color: colors.textSecondary,
                fontVariantNumeric: "tabular-nums",
                fontFamily: font.familyMono,
                fontSize: font.size.sm,
              }}>
                {m.published_version_number ? `v${m.published_version_number}` : "—"}
              </Td>
              <Td style={{ color: colors.textMuted, fontSize: font.size.sm, whiteSpace: "nowrap" }}>
                {new Date(m.updated_at).toLocaleDateString()}
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
