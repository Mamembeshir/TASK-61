import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  assetsApi,
  type AssetDetail,
  type AssetVersion,
  type Classification,
} from "@/api/assets";
import { useAuth } from "@/hooks/useAuth";
import VersionTimeline from "@/components/VersionTimeline";
import FieldDiff from "@/components/FieldDiff";
import ConfirmDialog from "@/components/ConfirmDialog";
import TreeSelect from "@/components/TreeSelect";

type Tab = "overview" | "timeline" | "as-of";

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "ADMIN";

  const [asset,   setAsset]   = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [tab,     setTab]     = useState<Tab>("overview");

  // Edit modal state
  const [editing,     setEditing]     = useState(false);
  const [editName,    setEditName]    = useState("");
  const [editClsId,   setEditClsId]   = useState("");
  const [editFields,  setEditFields]  = useState<{ key: string; value: string }[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editError,   setEditError]   = useState<string | null>(null);
  const [classifications, setClassifications] = useState<Classification[]>([]);

  // Delete dialog
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Timeline
  const [timeline,         setTimeline]         = useState<AssetVersion[]>([]);
  const [timelineLoading,  setTimelineLoading]  = useState(false);

  // As-of
  const [asOfInput,   setAsOfInput]   = useState("");
  const [asOfVersion, setAsOfVersion] = useState<AssetVersion | null>(null);
  const [asOfLoading, setAsOfLoading] = useState(false);
  const [asOfError,   setAsOfError]   = useState<string | null>(null);

  async function loadAsset() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const a = await assetsApi.getAsset(id);
      setAsset(a);
    } catch (e: any) {
      setError(e.message ?? "Asset not found.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAsset(); }, [id]);

  useEffect(() => {
    assetsApi.listClassifications().then(setClassifications).catch(() => {});
  }, []);

  // Load timeline when tab switches
  useEffect(() => {
    if (tab !== "timeline" || !id) return;
    setTimelineLoading(true);
    assetsApi.getTimeline(id)
      .then(setTimeline)
      .catch(() => {})
      .finally(() => setTimelineLoading(false));
  }, [tab, id]);

  function openEdit() {
    if (!asset) return;
    setEditName(asset.name);
    setEditClsId(asset.classification.id);
    const snapshot = asset.data_snapshot ?? {};
    setEditFields(
      Object.entries(snapshot).map(([key, value]) => ({ key, value }))
    );
    if (editFields.length === 0) setEditFields([{ key: "", value: "" }]);
    setEditError(null);
    setEditing(true);
  }

  function buildCustomData(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const { key, value } of editFields) {
      if (key.trim()) out[key.trim()] = value;
    }
    return out;
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!asset || !id) return;
    if (!editName.trim()) { setEditError("Name is required."); return; }
    if (!editClsId)       { setEditError("Classification is required."); return; }

    setEditLoading(true);
    setEditError(null);
    try {
      const updated = await assetsApi.updateAsset(id, {
        name:              editName.trim(),
        classification_id: editClsId,
        custom_data:       buildCustomData(),
        version_number:    asset.current_version_number ?? 0,
      });
      setAsset(updated);
      setEditing(false);
    } catch (e: any) {
      if (e.status === 409 || e.response?.status === 409) {
        setEditError("This asset was modified by someone else. Please reload and try again.");
      } else {
        setEditError(e.message ?? "Failed to save changes.");
      }
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    try {
      await assetsApi.deleteAsset(id);
      navigate("/assets");
    } catch (e: any) {
      setError(e.message ?? "Delete failed.");
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  async function handleAsOf() {
    if (!id || !asOfInput) return;
    setAsOfLoading(true);
    setAsOfError(null);
    setAsOfVersion(null);
    try {
      const v = await assetsApi.getAsOf(id, new Date(asOfInput).toISOString());
      setAsOfVersion(v);
    } catch (e: any) {
      if (e.status === 404 || e.response?.status === 404) {
        setAsOfError("No version existed at that time.");
      } else {
        setAsOfError(e.message ?? "Failed to load snapshot.");
      }
    } finally {
      setAsOfLoading(false);
    }
  }

  if (loading) return <div style={{ padding: "2rem", color: "#6c757d" }}>Loading…</div>;
  if (error)   return (
    <div style={{ padding: "2rem" }}>
      <div style={{ background: "#f8d7da", color: "#842029", padding: "12px 16px", borderRadius: "6px" }}>{error}</div>
      <button onClick={() => navigate("/assets")} style={{ marginTop: "1rem", ...backBtn }}>← Back to Assets</button>
    </div>
  );
  if (!asset) return null;

  const snapshot = asset.data_snapshot ?? {};
  const customKeys = Object.keys(snapshot);

  return (
    <div style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif", maxWidth: "860px" }}>
      {/* Back + actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <button onClick={() => navigate("/assets")} style={backBtn}>← Asset Ledger</button>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {!asset.is_deleted && (
            <button onClick={openEdit} style={outlineBtn}>✏ Edit</button>
          )}
          {isAdmin && !asset.is_deleted && (
            <button onClick={() => setConfirmDelete(true)} style={dangerOutlineBtn}>🗑 Delete</button>
          )}
        </div>
      </div>

      {/* Header card */}
      <div style={{ background: "#fff", border: "1px solid #dee2e6", borderRadius: "10px", padding: "1.25rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
              <span style={{ fontFamily: "monospace", fontSize: "1.3rem", fontWeight: 700 }}>{asset.asset_code}</span>
              {asset.is_deleted && (
                <span style={{ padding: "2px 10px", borderRadius: "10px", fontSize: "0.78rem", fontWeight: 600, background: "#e2e3e5", color: "#41464b" }}>
                  Deleted
                </span>
              )}
            </div>
            <div style={{ fontSize: "1.1rem", color: "#212529", marginBottom: "0.5rem" }}>{asset.name}</div>
            <div style={{ fontSize: "0.85rem", color: "#6c757d" }}>
              <span style={{ marginRight: "1.25rem" }}>📁 {classPath(asset.classification)}</span>
              <span style={{ marginRight: "1.25rem" }}>🏢 {asset.site_name}</span>
              <span>v{asset.current_version_number ?? "—"}</span>
            </div>
          </div>
          <div style={{ fontSize: "0.8rem", color: "#6c757d", textAlign: "right" }}>
            <div>Created {new Date(asset.created_at).toLocaleDateString()}</div>
            {asset.updated_at && <div>Updated {new Date(asset.updated_at).toLocaleDateString()}</div>}
          </div>
        </div>

        {/* Custom fields in overview */}
        {customKeys.length > 0 && (
          <div style={{ marginTop: "1rem", borderTop: "1px solid #dee2e6", paddingTop: "1rem" }}>
            <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#6c757d", textTransform: "uppercase", marginBottom: "0.5rem" }}>Custom Fields</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.5rem" }}>
              {customKeys.map((k) => (
                <div key={k} style={{ background: "#f8f9fa", borderRadius: "6px", padding: "6px 10px" }}>
                  <div style={{ fontSize: "0.75rem", color: "#6c757d", textTransform: "uppercase" }}>{k}</div>
                  <div style={{ fontWeight: 500, color: "#212529" }}>{snapshot[k]}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0", borderBottom: "2px solid #dee2e6", marginBottom: "1.25rem" }}>
        {(["overview", "timeline", "as-of"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 18px",
              background: "none",
              border: "none",
              borderBottom: tab === t ? "2px solid #0d6efd" : "2px solid transparent",
              marginBottom: "-2px",
              cursor: "pointer",
              fontWeight: tab === t ? 700 : 400,
              color: tab === t ? "#0d6efd" : "#6c757d",
              fontSize: "0.9rem",
              textTransform: "capitalize",
            }}
          >
            {t === "as-of" ? "As-Of" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab: Overview (fingerprint & raw data) */}
      {tab === "overview" && (
        <div>
          <div style={{ fontSize: "0.82rem", color: "#6c757d" }}>
            Fingerprint: <code style={{ wordBreak: "break-all" }}>{asset.fingerprint}</code>
          </div>
          {customKeys.length === 0 && (
            <p style={{ color: "#6c757d", marginTop: "0.75rem" }}>No custom fields on this asset.</p>
          )}
        </div>
      )}

      {/* Tab: Timeline */}
      {tab === "timeline" && (
        <div>
          {timelineLoading ? (
            <p style={{ color: "#6c757d" }}>Loading timeline…</p>
          ) : (
            <VersionTimeline versions={timeline} />
          )}
        </div>
      )}

      {/* Tab: As-Of */}
      {tab === "as-of" && (
        <div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", marginBottom: "1rem", flexWrap: "wrap" }}>
            <div>
              <label style={{ display: "block", fontWeight: 600, fontSize: "0.88rem", marginBottom: "4px" }}>
                View asset state at date/time
              </label>
              <input
                type="datetime-local"
                value={asOfInput}
                onChange={(e) => setAsOfInput(e.target.value)}
                style={{ padding: "7px 10px", border: "1px solid #ced4da", borderRadius: "6px", fontSize: "0.9rem" }}
              />
            </div>
            <button onClick={handleAsOf} disabled={!asOfInput || asOfLoading} style={primaryBtn}>
              {asOfLoading ? "Loading…" : "Load Snapshot"}
            </button>
          </div>

          {asOfError && (
            <div style={{ background: "#f8d7da", color: "#842029", padding: "10px 14px", borderRadius: "6px", marginBottom: "1rem" }}>
              {asOfError}
            </div>
          )}

          {asOfVersion && (
            <div style={{ background: "#f8f9fa", border: "1px solid #dee2e6", borderRadius: "8px", padding: "1rem" }}>
              <div style={{ marginBottom: "0.75rem", color: "#6c757d", fontSize: "0.85rem" }}>
                Viewing as of {new Date(asOfInput).toLocaleString()} — Version {asOfVersion.version_number}
                {asOfVersion.changed_by_username && <span> · by {asOfVersion.changed_by_username}</span>}
              </div>
              <FieldDiff before={undefined} after={asOfVersion.data_snapshot} />
            </div>
          )}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div style={overlay} onClick={() => setEditing(false)}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 1rem", fontWeight: 700 }}>Edit Asset</h3>

            {editError && (
              <div style={{ background: "#f8d7da", color: "#842029", padding: "8px 12px", borderRadius: "6px", marginBottom: "0.75rem" }}>
                {editError}
                {editError.includes("someone else") && (
                  <button onClick={() => { setEditing(false); loadAsset(); }} style={{ marginLeft: "0.75rem", background: "none", border: "none", color: "#0d6efd", cursor: "pointer", textDecoration: "underline" }}>
                    Reload
                  </button>
                )}
              </div>
            )}

            <form onSubmit={handleEditSubmit}>
              <div style={fieldGroup}>
                <label style={labelStyle}>Name *</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={fieldGroup}>
                <label style={labelStyle}>Classification *</label>
                <TreeSelect
                  classifications={classifications}
                  value={editClsId}
                  onChange={setEditClsId}
                  style={inputStyle}
                />
              </div>

              <div style={fieldGroup}>
                <label style={labelStyle}>Custom Fields</label>
                {editFields.map((f, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.4rem" }}>
                    <input
                      value={f.key}
                      onChange={(e) => setEditFields((prev) => prev.map((x, i) => i === idx ? { ...x, key: e.target.value } : x))}
                      placeholder="Field name"
                      style={{ ...inputStyle, flex: "1" }}
                    />
                    <input
                      value={f.value}
                      onChange={(e) => setEditFields((prev) => prev.map((x, i) => i === idx ? { ...x, value: e.target.value } : x))}
                      placeholder="Value"
                      style={{ ...inputStyle, flex: "2" }}
                    />
                    <button type="button" onClick={() => setEditFields((prev) => prev.filter((_, i) => i !== idx))}
                      style={{ padding: "4px 10px", background: "#f8d7da", color: "#842029", border: "none", borderRadius: "6px", cursor: "pointer" }}>
                      ×
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setEditFields((prev) => [...prev, { key: "", value: "" }])}
                  style={{ padding: "4px 12px", background: "none", border: "1px dashed #ced4da", borderRadius: "6px", cursor: "pointer", color: "#6c757d", fontSize: "0.85rem" }}>
                  + Add field
                </button>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "1rem" }}>
                <button type="button" onClick={() => setEditing(false)} style={cancelBtn}>Cancel</button>
                <button type="submit" disabled={editLoading} style={submitBtn}>
                  {editLoading ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Asset"
          message={<span>Delete <strong>{asset.asset_code}</strong>? This cannot be undone.</span>}
          confirmLabel={deleting ? "Deleting…" : "Delete"}
          confirmVariant="danger"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classPath(cls: Classification): string {
  return cls.name;   // Could be enhanced to show parent chain
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const backBtn: React.CSSProperties = {
  background: "none", border: "none",
  color: "#0d6efd", cursor: "pointer",
  fontSize: "0.9rem", padding: 0,
};

const outlineBtn: React.CSSProperties = {
  padding: "7px 14px",
  background: "#fff",
  color: "#0d6efd",
  border: "1px solid #0d6efd",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 500,
};

const dangerOutlineBtn: React.CSSProperties = {
  padding: "7px 14px",
  background: "#fff",
  color: "#dc3545",
  border: "1px solid #dc3545",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 500,
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

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000,
};

const modalBox: React.CSSProperties = {
  background: "#fff",
  borderRadius: "10px",
  padding: "1.5rem",
  width: "560px",
  maxWidth: "95vw",
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
};

const fieldGroup: React.CSSProperties = { marginBottom: "1rem", display: "flex", flexDirection: "column", gap: "4px" };
const labelStyle: React.CSSProperties = { fontWeight: 600, fontSize: "0.88rem", color: "#212529" };
const inputStyle: React.CSSProperties = { padding: "7px 10px", border: "1px solid #ced4da", borderRadius: "6px", fontSize: "0.9rem", width: "100%", boxSizing: "border-box" };
const cancelBtn: React.CSSProperties  = { padding: "8px 18px", background: "#fff", border: "1px solid #ced4da", borderRadius: "6px", cursor: "pointer", fontWeight: 500 };
const submitBtn: React.CSSProperties  = { padding: "8px 20px", background: "#0d6efd", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 };
