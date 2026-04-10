import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Package, Download, Upload, Plus } from "lucide-react";
import { assetsApi, type AssetSummary, type Classification, type Site } from "@/api/assets";
import { useAuth } from "@/hooks/useAuth";
import SearchInput from "@/components/SearchInput";
import TreeSelect from "@/components/TreeSelect";
import {
  PageHeader, Button, Table, Tr, Td, Badge, EmptyState,
  SkeletonTable, AlertBanner, Card,
} from "@/components/ui";
import { selectStyle } from "@/styles/forms";
import { colors, font, radius } from "@/styles/tokens";

export default function AssetsPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "ADMIN";

  const [assets,     setAssets]     = useState<AssetSummary[]>([]);
  const [count,      setCount]      = useState(0);
  const [cursor,     setCursor]     = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [prevCursor, setPrevCursor] = useState<string | null>(null);
  const [pageSize,   setPageSize]   = useState(25);
  const [search,     setSearch]     = useState("");
  const [siteId,     setSiteId]     = useState("");
  const [clsId,      setClsId]      = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [exporting,  setExporting]  = useState(false);

  const [sites, setSites]                   = useState<Site[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);

  // Load filter options once
  useEffect(() => {
    assetsApi.listSites().then(setSites).catch(() => {});
    assetsApi.listClassifications().then(setClassifications).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await assetsApi.listAssets({
        search:             search      || undefined,
        site_id:            siteId      || undefined,
        classification_id:  clsId       || undefined,
        include_deleted:    showDeleted || undefined,
        cursor:             cursor      || undefined,
        page_size:          pageSize,
      });
      setAssets(res.results);
      setCount(res.count);
      setNextCursor(res.next_cursor);
      setPrevCursor(res.previous_cursor);
    } catch (e: any) {
      setError(e.message ?? "Failed to load assets.");
    } finally {
      setLoading(false);
    }
  }, [search, siteId, clsId, showDeleted, cursor, pageSize]);

  useEffect(() => { load(); }, [load]);

  async function handleExport() {
    setExporting(true);
    try {
      await assetsApi.downloadExport({ site_id: siteId || undefined, file_format: "xlsx" });
    } catch {
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  const columns = showDeleted
    ? ["Asset Code", "Name", "Classification", "Site", "Ver.", "Last Updated", "Status"]
    : ["Asset Code", "Name", "Classification", "Site", "Ver.", "Last Updated"];

  return (
    <div>
      <PageHeader
        title="Asset Ledger"
        subtitle={count > 0 ? `${count.toLocaleString()} asset${count === 1 ? "" : "s"} tracked` : "Track and manage all physical assets"}
        icon={<Package size={22} />}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={handleExport}
              loading={exporting}
              icon={<Download size={15} />}
            >
              Export
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate("/assets/import")}
              icon={<Upload size={15} />}
            >
              Import
            </Button>
            <Button
              variant="primary"
              onClick={() => navigate("/assets/new")}
              icon={<Plus size={16} />}
            >
              New Asset
            </Button>
          </>
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
          <div style={{ flex: "1 1 240px", minWidth: 220 }}>
            <SearchInput
              value={search}
              onChange={(v) => { setSearch(v); setCursor(null); }}
              placeholder="Search code or name…"
            />
          </div>

          <select
            value={siteId}
            onChange={(e) => { setSiteId(e.target.value); setCursor(null); }}
            style={{ ...selectStyle, width: "auto", minWidth: 160 }}
          >
            <option value="">All Sites</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <TreeSelect
            classifications={classifications}
            value={clsId}
            onChange={(v) => { setClsId(v); setCursor(null); }}
            placeholder="All Classifications"
          />

          {isAdmin && (
            <label style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
              fontSize: font.size.sm,
              color: colors.textSecondary,
              fontWeight: font.weight.medium,
              cursor: "pointer",
              padding: "7px 12px",
              background: showDeleted ? colors.primaryLight : colors.gray50,
              border: `1px solid ${showDeleted ? colors.primaryMid : colors.border}`,
              borderRadius: radius.md,
              transition: "all 0.15s ease",
            }}>
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => { setShowDeleted(e.target.checked); setCursor(null); }}
                style={{ accentColor: colors.primary }}
              />
              Show deleted
            </label>
          )}

          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setCursor(null); }}
            style={{ ...selectStyle, width: "auto" }}
          >
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
        </div>
      </Card>

      {/* Error */}
      {error && <AlertBanner type="error" message={error} onClose={() => setError(null)} />}

      {/* Table */}
      {loading ? (
        <SkeletonTable rows={6} cols={columns.length} />
      ) : assets.length === 0 ? (
        <Card padding="0">
          <EmptyState
            icon="📦"
            title="No assets found"
            description="Try adjusting your filters, or add a new asset to get started."
            action={
              <Button variant="primary" onClick={() => navigate("/assets/new")} icon={<Plus size={16} />}>
                New Asset
              </Button>
            }
          />
        </Card>
      ) : (
        <Table columns={columns}>
          {assets.map((a) => (
            <Tr key={a.id} onClick={() => navigate(`/assets/${a.id}`)} muted={a.is_deleted}>
              <Td>
                <code style={{
                  fontWeight: font.weight.semibold,
                  color: colors.primary,
                  background: colors.primaryLight,
                  padding: "2px 8px",
                  borderRadius: radius.sm,
                  fontSize: font.size.xs,
                }}>
                  {a.asset_code}
                </code>
              </Td>
              <Td style={{ fontWeight: font.weight.medium }}>{a.name}</Td>
              <Td style={{ color: colors.textSecondary }}>{a.classification_name}</Td>
              <Td style={{ color: colors.textSecondary }}>{a.site_name}</Td>
              <Td style={{ textAlign: "center", color: colors.textMuted, fontVariantNumeric: "tabular-nums" }}>
                {a.current_version_number ?? "—"}
              </Td>
              <Td style={{ color: colors.textMuted, fontSize: font.size.sm, whiteSpace: "nowrap" }}>
                {a.updated_at ? new Date(a.updated_at).toLocaleDateString() : "—"}
              </Td>
              {showDeleted && (
                <Td>
                  {a.is_deleted && (
                    <Badge bg={colors.gray200} text={colors.gray700} label="Deleted" size="sm" />
                  )}
                </Td>
              )}
            </Tr>
          ))}
        </Table>
      )}

      {/* Pagination */}
      {(prevCursor || nextCursor) && (
        <div style={{
          marginTop: "1.15rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.6rem",
        }}>
          <span style={{ fontSize: font.size.sm, color: colors.textMuted }}>
            {count.toLocaleString()} total
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button variant="secondary" size="sm" disabled={!prevCursor} onClick={() => setCursor(prevCursor)}>
              ← Prev
            </Button>
            <Button variant="secondary" size="sm" disabled={!nextCursor} onClick={() => setCursor(nextCursor)}>
              Next →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
