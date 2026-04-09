import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  menuApi, foodSiteApi,
  type MenuDetail, type MenuVersionRead, type FoodSite,
} from "@/api/foodservice";
import { useAuth } from "@/hooks/useAuth";
import StatusBadge from "@/components/StatusBadge";

type Tab = "detail" | "history";

export default function MenuDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [menu,     setMenu]     = useState<MenuDetail | null>(null);
  const [sites,    setSites]    = useState<FoodSite[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [tab,      setTab]      = useState<Tab>("detail");

  // Publish modal
  const [publishTarget,  setPublishTarget]  = useState<MenuVersionRead | null>(null);
  const [selectedSites,  setSelectedSites]  = useState<Set<string>>(new Set());
  const [publishing,     setPublishing]     = useState(false);
  const [publishError,   setPublishError]   = useState<string | null>(null);

  // Unpublish confirm
  const [unpubTarget,  setUnpubTarget]  = useState<MenuVersionRead | null>(null);
  const [unpublishing, setUnpublishing] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [m, s] = await Promise.all([menuApi.get(id), foodSiteApi.list()]);
      setMenu(m);
      setSites(s);
    } catch (e: any) {
      setError(e.message ?? "Menu not found.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  const publishedVersion = menu?.versions.find((v) => v.status === "PUBLISHED") ?? null;
  const latestVersion    = menu?.versions[0] ?? null;

  function openPublish(v: MenuVersionRead) {
    setPublishError(null);
    setSelectedSites(new Set());
    setPublishTarget(v);
  }

  async function handlePublish() {
    if (!id || !publishTarget) return;
    if (selectedSites.size === 0) { setPublishError("Select at least one site."); return; }
    setPublishing(true);
    setPublishError(null);
    try {
      await menuApi.versions.publish(id, publishTarget.id, Array.from(selectedSites));
      setPublishTarget(null);
      await load();
    } catch (e: any) {
      setPublishError(e.message ?? "Publish failed.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleUnpublish(v: MenuVersionRead) {
    if (!id) return;
    setUnpublishing(true);
    try {
      await menuApi.versions.unpublish(id, v.id);
      setUnpubTarget(null);
      await load();
    } catch (e: any) {
      alert(e.message ?? "Unpublish failed.");
    } finally {
      setUnpublishing(false);
    }
  }

  async function handleArchive(v: MenuVersionRead) {
    if (!id || !window.confirm(`Archive version v${v.version_number}? This cannot be undone.`)) return;
    try {
      await menuApi.versions.archive(id, v.id);
      await load();
    } catch (e: any) {
      alert(e.message ?? "Archive failed.");
    }
  }

  async function handleNewVersion() {
    if (!id) return;
    try {
      const v = await menuApi.versions.create(id, { description: "New version", groups: [] });
      await load();
      setTab("history");
    } catch (e: any) {
      alert(e.message ?? "Failed to create new version.");
    }
  }

  if (loading) return <div style={{ padding: "1.5rem" }}>Loading…</div>;
  if (error)   return <div style={{ padding: "1.5rem", color: "#842029" }}>{error}</div>;
  if (!menu)   return null;

  // STAFF only sees assigned sites — the backend enforces this on publish; here we just show all
  const displaySites = sites;

  return (
    <div style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif", maxWidth: "960px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <button onClick={() => navigate("/kitchen/menus")} style={backBtn}>← Menus</button>
        <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>{menu.name}</h2>
        {publishedVersion
          ? <StatusBadge status="PUBLISHED" />
          : <StatusBadge status="DRAFT" />}
        <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
          {publishedVersion && (
            <button onClick={() => setUnpubTarget(publishedVersion)} style={warnBtn}>Unpublish</button>
          )}
          {latestVersion?.status === "DRAFT" && (
            <button onClick={() => openPublish(latestVersion)} style={primaryBtn}>Publish…</button>
          )}
          <button onClick={handleNewVersion} style={outlineBtn}>New Version</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0", borderBottom: "2px solid #dee2e6", marginBottom: "1.5rem" }}>
        {(["detail", "history"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 18px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontWeight: tab === t ? 700 : 400,
              borderBottom: tab === t ? "2px solid #0d6efd" : "2px solid transparent",
              marginBottom: "-2px",
              color: tab === t ? "#0d6efd" : "#495057",
              fontSize: "0.9rem",
            }}
          >
            {t === "detail" ? "Current Version" : "Version History"}
          </button>
        ))}
      </div>

      {tab === "detail" && (
        <>
          {publishedVersion ? (
            <VersionDetail version={publishedVersion} />
          ) : latestVersion ? (
            <div>
              <div style={{ color: "#6c757d", fontSize: "0.9rem", marginBottom: "1rem" }}>
                Showing latest draft (v{latestVersion.version_number}) — not yet published.
              </div>
              <VersionDetail version={latestVersion} />
            </div>
          ) : (
            <p style={{ color: "#6c757d" }}>No versions yet.</p>
          )}
        </>
      )}

      {tab === "history" && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #dee2e6" }}>
              <th style={th}>Ver.</th>
              <th style={th}>Status</th>
              <th style={th}>Groups</th>
              <th style={th}>Sites</th>
              <th style={th}>Created</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {menu.versions.map((v) => (
              <tr key={v.id} style={{ borderBottom: "1px solid #dee2e6" }}>
                <td style={td}>v{v.version_number}</td>
                <td style={td}><StatusBadge status={v.status} /></td>
                <td style={td}>{v.groups.length}</td>
                <td style={td}>{v.site_releases.length}</td>
                <td style={td}>{new Date(v.created_at).toLocaleDateString()}</td>
                <td style={{ ...td, display: "flex", gap: "0.5rem" }}>
                  {v.status === "DRAFT" && (
                    <button onClick={() => openPublish(v)} style={publishBtn}>Publish…</button>
                  )}
                  {v.status === "PUBLISHED" && (
                    <button onClick={() => setUnpubTarget(v)} style={warnBtn}>Unpublish</button>
                  )}
                  {v.status === "UNPUBLISHED" && currentUser?.role === "ADMIN" && (
                    <button onClick={() => handleArchive(v)} style={archiveBtn}>Archive</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Publish modal */}
      {publishTarget && (
        <div style={overlay} onClick={() => setPublishTarget(null)}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 0.5rem" }}>Publish v{publishTarget.version_number}</h3>
            <p style={{ color: "#856404", background: "#fff3cd", padding: "8px 12px", borderRadius: "6px", fontSize: "0.85rem", margin: "0 0 1rem" }}>
              Publishing will unpublish any previous version at selected sites.
            </p>
            <p style={{ fontWeight: 500, margin: "0 0 0.5rem", fontSize: "0.9rem" }}>Select sites:</p>
            {displaySites.length === 0 ? (
              <p style={{ color: "#6c757d" }}>No sites available.</p>
            ) : (
              <div style={{ maxHeight: "220px", overflowY: "auto", border: "1px solid #dee2e6", borderRadius: "6px", marginBottom: "1rem" }}>
                {displaySites.map((s) => (
                  <label
                    key={s.id}
                    style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSites.has(s.id)}
                      onChange={() => {
                        setSelectedSites((prev) => {
                          const next = new Set(prev);
                          next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                          return next;
                        });
                      }}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
            {publishError && (
              <div style={{ background: "#f8d7da", color: "#842029", padding: "8px 12px", borderRadius: "6px", marginBottom: "0.75rem", fontSize: "0.85rem" }}>
                {publishError}
              </div>
            )}
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button onClick={() => setPublishTarget(null)} style={outlineBtn}>Cancel</button>
              <button onClick={handlePublish} disabled={publishing} style={primaryBtn}>
                {publishing ? "Publishing…" : "Publish"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unpublish confirm */}
      {unpubTarget && (
        <div style={overlay} onClick={() => setUnpubTarget(null)}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 0.75rem" }}>Unpublish v{unpubTarget.version_number}?</h3>
            <p style={{ color: "#495057", fontSize: "0.9rem" }}>
              This menu version will no longer be visible at its released sites.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
              <button onClick={() => setUnpubTarget(null)} style={outlineBtn}>Cancel</button>
              <button onClick={() => handleUnpublish(unpubTarget)} disabled={unpublishing} style={warnBtn}>
                {unpublishing ? "Unpublishing…" : "Unpublish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VersionDetail({ version }: { version: MenuVersionRead }) {
  if (version.groups.length === 0) {
    return <p style={{ color: "#6c757d" }}>No groups in this version.</p>;
  }

  return (
    <div>
      {version.groups.map((g) => (
        <div key={g.id} style={{ marginBottom: "1.5rem", border: "1px solid #dee2e6", borderRadius: "8px", overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", background: "#f8f9fa", borderBottom: "1px solid #dee2e6" }}>
            <span style={{ fontWeight: 600, fontSize: "1rem" }}>{g.name}</span>
            {g.availability_start && g.availability_end && (
              <span style={{ marginLeft: "12px", color: "#6c757d", fontSize: "0.85rem" }}>
                · {fmtTime(g.availability_start)} – {fmtTime(g.availability_end)}
              </span>
            )}
          </div>
          {g.items.length === 0 ? (
            <p style={{ padding: "12px 16px", color: "#6c757d", fontSize: "0.88rem", margin: 0 }}>No items.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #dee2e6", background: "#fafafa" }}>
                  <th style={th}>Dish</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={td}>{item.dish_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
      {version.site_releases.length > 0 && (
        <div style={{ fontSize: "0.85rem", color: "#6c757d" }}>
          Released at {version.site_releases.length} site(s).
        </div>
      )}
    </div>
  );
}

function fmtTime(t: string): string {
  // "HH:MM:SS" → "H:MM AM/PM"
  try {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12  = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  } catch {
    return t;
  }
}

const primaryBtn: React.CSSProperties = { padding: "8px 16px", background: "#0d6efd", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 };
const outlineBtn: React.CSSProperties = { padding: "7px 14px", background: "#fff", color: "#0d6efd", border: "1px solid #0d6efd", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem" };
const warnBtn: React.CSSProperties    = { padding: "7px 14px", background: "#fff", color: "#856404", border: "1px solid #ffc107", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem" };
const archiveBtn: React.CSSProperties = { padding: "4px 10px", background: "#fff", color: "#6c757d", border: "1px solid #ced4da", borderRadius: "5px", cursor: "pointer", fontSize: "0.8rem" };
const publishBtn: React.CSSProperties = { padding: "4px 10px", background: "#0d6efd", color: "#fff", border: "none", borderRadius: "5px", cursor: "pointer", fontSize: "0.8rem" };
const backBtn: React.CSSProperties    = { padding: "6px 12px", background: "#fff", color: "#6c757d", border: "1px solid #ced4da", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem" };
const th: React.CSSProperties         = { padding: "8px 14px", fontWeight: 600, fontSize: "0.78rem", color: "#495057", textTransform: "uppercase" as const, textAlign: "left" as const };
const td: React.CSSProperties         = { padding: "8px 14px", verticalAlign: "middle" };
const overlay: React.CSSProperties    = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 };
const modalBox: React.CSSProperties   = { background: "#fff", borderRadius: "10px", padding: "1.5rem", maxWidth: "480px", width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.18)", maxHeight: "80vh", overflowY: "auto" };
