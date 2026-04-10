import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ClipboardList, Plus } from "lucide-react";
import {
  menuApi, foodSiteApi,
  type MenuDetail, type MenuVersionRead, type FoodSite,
} from "@/api/foodservice";
import { useAuth } from "@/hooks/useAuth";
import StatusBadge from "@/components/StatusBadge";
import {
  PageHeader, Button, Card, Table, Tr, Td,
  AlertBanner, Modal,
} from "@/components/ui";
import { colors, font, radius, transition } from "@/styles/tokens";

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
      await menuApi.versions.create(id, { description: "New version", groups: [] });
      await load();
      setTab("history");
    } catch (e: any) {
      alert(e.message ?? "Failed to create new version.");
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Loading menu…" icon={<ClipboardList size={22} />} />
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <PageHeader title="Menu" icon={<ClipboardList size={22} />} />
        <AlertBanner type="error" message={error} />
      </div>
    );
  }
  if (!menu) return null;

  const displaySites = sites;

  return (
    <div>
      <PageHeader
        title={menu.name}
        subtitle={publishedVersion
          ? `Published v${publishedVersion.version_number}`
          : latestVersion
            ? `Latest draft v${latestVersion.version_number}`
            : "No versions yet"}
        icon={<ClipboardList size={22} />}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/kitchen/menus")}
              icon={<ArrowLeft size={14} />}
            >
              Menus
            </Button>
            {publishedVersion
              ? <StatusBadge status="PUBLISHED" size="md" />
              : <StatusBadge status="DRAFT" size="md" />}
            {publishedVersion && (
              <Button variant="secondary" onClick={() => setUnpubTarget(publishedVersion)}>
                Unpublish
              </Button>
            )}
            {latestVersion?.status === "DRAFT" && (
              <Button variant="primary" onClick={() => openPublish(latestVersion)}>
                Publish…
              </Button>
            )}
            <Button variant="outline" onClick={handleNewVersion} icon={<Plus size={14} />}>
              New Version
            </Button>
          </>
        }
      />

      {/* Tabs */}
      <div style={{
        display: "flex",
        gap: 0,
        borderBottom: `1px solid ${colors.border}`,
        marginBottom: "1.5rem",
      }}>
        {(["detail", "history"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "10px 20px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontWeight: tab === t ? font.weight.semibold : font.weight.medium,
              borderBottom: tab === t
                ? `2px solid ${colors.primary}`
                : "2px solid transparent",
              marginBottom: "-1px",
              color: tab === t ? colors.primary : colors.textMuted,
              fontSize: font.size.base,
              fontFamily: font.family,
              letterSpacing: "0.005em",
              transition: `color ${transition.fast}, border-color ${transition.fast}`,
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
            <>
              <AlertBanner
                type="info"
                message={`Showing latest draft (v${latestVersion.version_number}) — not yet published.`}
              />
              <VersionDetail version={latestVersion} />
            </>
          ) : (
            <Card>
              <p style={{ color: colors.textMuted, margin: 0 }}>No versions yet.</p>
            </Card>
          )}
        </>
      )}

      {tab === "history" && (
        <Table columns={["Ver.", "Status", "Groups", "Sites", "Created", ""]}>
          {menu.versions.map((v) => (
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
              <Td style={{ fontVariantNumeric: "tabular-nums", color: colors.textSecondary }}>
                {v.groups.length}
              </Td>
              <Td style={{ fontVariantNumeric: "tabular-nums", color: colors.textSecondary }}>
                {v.site_releases.length}
              </Td>
              <Td style={{ color: colors.textMuted, fontSize: font.size.sm, whiteSpace: "nowrap" }}>
                {new Date(v.created_at).toLocaleDateString()}
              </Td>
              <Td>
                <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                  {v.status === "DRAFT" && (
                    <Button size="sm" variant="primary" onClick={() => openPublish(v)}>
                      Publish…
                    </Button>
                  )}
                  {v.status === "PUBLISHED" && (
                    <Button size="sm" variant="secondary" onClick={() => setUnpubTarget(v)}>
                      Unpublish
                    </Button>
                  )}
                  {v.status === "UNPUBLISHED" && currentUser?.role === "ADMIN" && (
                    <Button size="sm" variant="ghost" onClick={() => handleArchive(v)}>
                      Archive
                    </Button>
                  )}
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
      )}

      {/* Publish modal */}
      <Modal
        open={!!publishTarget}
        onClose={() => setPublishTarget(null)}
        title={publishTarget ? `Publish v${publishTarget.version_number}` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPublishTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handlePublish} loading={publishing}>
              Publish
            </Button>
          </>
        }
      >
        <AlertBanner
          type="warning"
          message="Publishing will unpublish any previous version at selected sites."
        />
        <p style={{
          fontWeight: font.weight.semibold,
          fontSize: font.size.sm,
          color: colors.textSecondary,
          margin: "0 0 0.5rem",
          textTransform: "uppercase",
          letterSpacing: font.tracking.wider,
        }}>
          Select sites
        </p>
        {displaySites.length === 0 ? (
          <p style={{ color: colors.textMuted, fontSize: font.size.sm }}>
            No sites available.
          </p>
        ) : (
          <div style={{
            maxHeight: "240px",
            overflowY: "auto",
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            marginBottom: "0.75rem",
            background: colors.surfaceAlt,
          }}>
            {displaySites.map((s, i) => (
              <label
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  padding: "10px 14px",
                  cursor: "pointer",
                  borderBottom: i < displaySites.length - 1 ? `1px solid ${colors.border}` : undefined,
                  fontSize: font.size.base,
                  color: colors.text,
                  transition: `background ${transition.fast}`,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = colors.surface)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
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
        {publishError && <AlertBanner type="error" message={publishError} />}
      </Modal>

      {/* Unpublish confirm */}
      <Modal
        open={!!unpubTarget}
        onClose={() => setUnpubTarget(null)}
        title={unpubTarget ? `Unpublish v${unpubTarget.version_number}?` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setUnpubTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => unpubTarget && handleUnpublish(unpubTarget)}
              loading={unpublishing}
            >
              Unpublish
            </Button>
          </>
        }
      >
        <p style={{ color: colors.textSecondary, fontSize: font.size.base, margin: 0 }}>
          This menu version will no longer be visible at its released sites.
        </p>
      </Modal>
    </div>
  );
}

function VersionDetail({ version }: { version: MenuVersionRead }) {
  if (version.groups.length === 0) {
    return (
      <Card>
        <p style={{ color: colors.textMuted, margin: 0 }}>No groups in this version.</p>
      </Card>
    );
  }

  return (
    <div>
      {version.groups.map((g) => (
        <Card key={g.id} padding="0" style={{ marginBottom: "1.25rem" }}>
          <div style={{
            padding: "14px 18px",
            background: colors.surfaceAlt,
            borderBottom: `1px solid ${colors.border}`,
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}>
            <span style={{
              fontWeight: font.weight.semibold,
              fontSize: font.size.md,
              color: colors.text,
              letterSpacing: font.tracking.tight,
            }}>
              {g.name}
            </span>
            {g.availability_start && g.availability_end && (
              <span style={{
                fontSize: font.size.xs,
                color: colors.textMuted,
                padding: "3px 9px",
                borderRadius: radius.full,
                background: colors.surface,
                border: `1px solid ${colors.border}`,
                fontWeight: font.weight.medium,
              }}>
                {fmtTime(g.availability_start)} – {fmtTime(g.availability_end)}
              </span>
            )}
            <span style={{
              marginLeft: "auto",
              fontSize: font.size.xs,
              color: colors.textMuted,
              fontWeight: font.weight.semibold,
              textTransform: "uppercase",
              letterSpacing: font.tracking.wider,
            }}>
              {g.items.length} item{g.items.length === 1 ? "" : "s"}
            </span>
          </div>
          {g.items.length === 0 ? (
            <p style={{
              padding: "14px 18px",
              color: colors.textMuted,
              fontSize: font.size.sm,
              margin: 0,
            }}>
              No items.
            </p>
          ) : (
            <div>
              {g.items.map((item, i) => (
                <div
                  key={item.id}
                  style={{
                    padding: "12px 18px",
                    borderBottom: i < g.items.length - 1 ? `1px solid ${colors.border}` : undefined,
                    fontSize: font.size.base,
                    color: colors.text,
                  }}
                >
                  {item.dish_name}
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
      {version.site_releases.length > 0 && (
        <div style={{
          fontSize: font.size.sm,
          color: colors.textMuted,
          textAlign: "center",
          padding: "0.5rem",
        }}>
          Released at {version.site_releases.length} site{version.site_releases.length === 1 ? "" : "s"}.
        </div>
      )}
    </div>
  );
}

function fmtTime(t: string): string {
  try {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12  = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  } catch {
    return t;
  }
}
