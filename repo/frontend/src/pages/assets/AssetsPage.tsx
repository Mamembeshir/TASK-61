import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { assetsApi, type AssetSummary, type Classification, type Site } from "@/api/assets";
import { useAuth } from "@/hooks/useAuth";
import SearchInput from "@/components/SearchInput";
import TreeSelect from "@/components/TreeSelect";

export default function AssetsPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "ADMIN";

  const [assets,   setAssets]   = useState<AssetSummary[]>([]);
  const [count,    setCount]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search,   setSearch]   = useState("");
  const [siteId,   setSiteId]   = useState("");
  const [clsId,    setClsId]    = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

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
        page,
        page_size: pageSize,
      });
      setAssets(res.results);
      setCount(res.count);
    } catch (e: any) {
      setError(e.message ?? "Failed to load assets.");
    } finally {
      setLoading(false);
    }
  }, [search, siteId, clsId, showDeleted, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

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

  return (
    <div style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>Asset Ledger</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={handleExport} disabled={exporting} style={outlineBtn}>
            {exporting ? "Exporting…" : "⬇ Export"}
          </button>
          <button onClick={() => navigate("/assets/import")} style={outlineBtn}>
            ⬆ Import
          </button>
          <button onClick={() => navigate("/assets/new")} style={primaryBtn}>
            + New Asset
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="Search code or name…"
        />

        <select
          value={siteId}
          onChange={(e) => { setSiteId(e.target.value); setPage(1); }}
          style={selectStyle}
        >
          <option value="">All Sites</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <TreeSelect
          classifications={classifications}
          value={clsId}
          onChange={(v) => { setClsId(v); setPage(1); }}
          placeholder="All Classifications"
        />

        {isAdmin && (
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.9rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => { setShowDeleted(e.target.checked); setPage(1); }}
            />
            Show deleted
          </label>
        )}

        <select
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          style={{ ...selectStyle, minWidth: "auto" }}
        >
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "#f8d7da", color: "#842029", padding: "10px 14px", borderRadius: "6px", marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p style={{ color: "#6c757d" }}>Loading…</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #dee2e6", textAlign: "left" }}>
              <th style={th}>Asset Code</th>
              <th style={th}>Name</th>
              <th style={th}>Classification</th>
              <th style={th}>Site</th>
              <th style={th}>Ver.</th>
              <th style={th}>Last Updated</th>
              {showDeleted && <th style={th}>Status</th>}
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 ? (
              <tr>
                <td colSpan={showDeleted ? 7 : 6} style={{ padding: "1.5rem", textAlign: "center", color: "#6c757d" }}>
                  No assets found.
                </td>
              </tr>
            ) : assets.map((a) => (
              <tr
                key={a.id}
                onClick={() => navigate(`/assets/${a.id}`)}
                style={{ borderBottom: "1px solid #dee2e6", cursor: "pointer", opacity: a.is_deleted ? 0.55 : 1 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fa")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                <td style={td}><code style={{ fontWeight: 600 }}>{a.asset_code}</code></td>
                <td style={td}>{a.name}</td>
                <td style={td}>{a.classification_name}</td>
                <td style={td}>{a.site_name}</td>
                <td style={{ ...td, textAlign: "center" }}>{a.current_version_number ?? "—"}</td>
                <td style={td}>{a.updated_at ? new Date(a.updated_at).toLocaleDateString() : "—"}</td>
                {showDeleted && (
                  <td style={td}>
                    {a.is_deleted && (
                      <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "0.75rem", fontWeight: 600, background: "#e2e3e5", color: "#41464b" }}>
                        Deleted
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={pagBtn}>← Prev</button>
          <span style={{ fontSize: "0.9rem", color: "#6c757d" }}>
            Page {page} / {totalPages} ({count} total)
          </span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pagBtn}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const selectStyle: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid #ced4da",
  borderRadius: "6px",
  fontSize: "0.9rem",
};

const primaryBtn: React.CSSProperties = {
  padding: "8px 16px",
  background: "#0d6efd",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 600,
};

const outlineBtn: React.CSSProperties = {
  padding: "8px 14px",
  background: "#fff",
  color: "#0d6efd",
  border: "1px solid #0d6efd",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 500,
};

const th: React.CSSProperties = {
  padding: "10px 12px",
  fontWeight: 600,
  fontSize: "0.82rem",
  color: "#495057",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const td: React.CSSProperties = {
  padding: "10px 12px",
  verticalAlign: "middle",
};

const pagBtn: React.CSSProperties = {
  padding: "5px 12px",
  border: "1px solid #ced4da",
  borderRadius: "6px",
  background: "#fff",
  cursor: "pointer",
  fontSize: "0.85rem",
};
