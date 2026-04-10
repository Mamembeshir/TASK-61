/**
 * DashboardPage — Staff home with summary cards + recent activity feed.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckSquare, Package, ClipboardList, Activity, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import apiClient from "@/api/client";
import { StatCard, Card, Badge, SkeletonLine } from "@/components/ui";
import { colors, font, radius, gradients } from "@/styles/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_username: string | null;
  timestamp: string;
}

interface SummaryData {
  openTasks: number;
  assetCount: number;
  publishedMenus: number;
  siteName: string;
}

// ---------------------------------------------------------------------------
// Action badge
// ---------------------------------------------------------------------------

const ACTION_COLORS: Record<string, { bg: string; text: string }> = {
  CREATE:  { bg: colors.infoLight,    text: colors.infoDark    },
  UPDATE:  { bg: colors.warningLight, text: colors.warningDark },
  DELETE:  { bg: colors.dangerLight,  text: colors.dangerDark  },
  PUBLISH: { bg: colors.successLight, text: colors.successDark },
  APPROVE: { bg: colors.successLight, text: colors.successDark },
  REJECT:  { bg: colors.dangerLight,  text: colors.dangerDark  },
  LOGIN:   { bg: colors.gray100,      text: colors.gray600     },
  LOGOUT:  { bg: colors.gray100,      text: colors.gray600     },
  EXPORT:  { bg: "#F3E8FF",           text: "#7C3AED"          },
};

function ActionBadge({ action }: { action: string }) {
  const style = ACTION_COLORS[action] ?? { bg: colors.gray100, text: colors.gray600 };
  return (
    <Badge
      size="sm"
      style={{ background: style.bg, color: style.text }}
    >
      {action}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Greeting block
// ---------------------------------------------------------------------------

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const firstName = currentUser?.legalFirstName ?? currentUser?.username ?? "there";

  const [summary,         setSummary]       = useState<SummaryData | null>(null);
  const [summaryLoading,  setSummaryLoading] = useState(true);
  const [activity,        setActivity]      = useState<AuditEntry[]>([]);
  const [activityLoading, setActLoading]    = useState(true);

  // Fetch summary counts
  useEffect(() => {
    async function load() {
      try {
        const [tasksRes, assetsRes, menusRes, sitesRes] = await Promise.allSettled([
          apiClient.get("meetings/tasks/mine/"),
          apiClient.get("assets/?page_size=1"),
          apiClient.get("foodservice/menus/?status=PUBLISHED&page_size=1"),
          apiClient.get("tenants/sites/"),
        ]);

        const openTasks = tasksRes.status === "fulfilled"
          ? (tasksRes.value.data as any[]).filter((t: any) =>
              t.status === "TODO" || t.status === "IN_PROGRESS" || t.status === "OVERDUE"
            ).length
          : 0;

        const assetCount = assetsRes.status === "fulfilled"
          ? (assetsRes.value.data.count ?? 0)
          : 0;

        const publishedMenus = menusRes.status === "fulfilled"
          ? (menusRes.value.data.count ?? 0)
          : 0;

        const siteName = sitesRes.status === "fulfilled"
          ? (sitesRes.value.data[0]?.name ?? "your site")
          : "your site";

        setSummary({ openTasks, assetCount, publishedMenus, siteName });
      } finally {
        setSummaryLoading(false);
      }
    }
    load();
  }, []);

  // Fetch recent activity
  useEffect(() => {
    apiClient.get("core/audit-log/")
      .then(r => setActivity(r.data.slice(0, 10)))
      .catch(() => setActivity([]))
      .finally(() => setActLoading(false));
  }, []);

  function fmtTime(ts: string) {
    return new Date(ts).toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return (
    <div>
      {/* ── Hero welcome banner ────────────────────────────────── */}
      <div style={{
        position: "relative",
        background: gradients.hero,
        borderRadius: radius.xl,
        padding: "2rem 2.25rem",
        marginBottom: "1.75rem",
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(15,23,42,0.1), 0 12px 32px -12px rgba(49,46,129,0.35)",
      }}>
        {/* Decorative mesh overlays */}
        <div aria-hidden style={{
          position: "absolute",
          top: -120, right: -60,
          width: 360, height: 360,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,58,237,0.28) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div aria-hidden style={{
          position: "absolute",
          bottom: -150, left: -80,
          width: 320, height: 320,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.22) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        {/* Subtle dotted grid */}
        <div aria-hidden style={{
          position: "absolute", inset: 0,
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)`,
          backgroundSize: "22px 22px",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <span style={{
            display: "inline-block",
            padding: "4px 11px",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: radius.full,
            color: "rgba(226,232,240,0.85)",
            fontSize: font.size.xs,
            fontWeight: font.weight.semibold,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            marginBottom: "0.9rem",
          }}>
            {today}
          </span>
          <h1 style={{
            margin: 0,
            fontSize: "1.875rem",
            fontWeight: font.weight.bold,
            color: "#fff",
            letterSpacing: font.tracking.tighter,
            lineHeight: 1.15,
          }}>
            {getGreeting()}, {firstName}.
          </h1>
          <p style={{
            margin: "0.5rem 0 0",
            color: "rgba(226,232,240,0.72)",
            fontSize: font.size.md,
            lineHeight: 1.6,
            maxWidth: 560,
          }}>
            Here's a snapshot of what's happening today
            {summary?.siteName ? ` at ${summary.siteName}` : ""}.
          </p>
        </div>
      </div>

      {/* ── Summary stat cards ─────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: "1.15rem",
        marginBottom: "1.75rem",
      }}>
        <div onClick={() => navigate("/meetings/tasks")} style={{ cursor: "pointer" }}>
          <StatCard
            label="Open Tasks"
            value={summary?.openTasks ?? 0}
            icon={<CheckSquare size={20} />}
            accent={colors.primary}
            loading={summaryLoading}
          />
        </div>
        <div onClick={() => navigate("/assets")} style={{ cursor: "pointer" }}>
          <StatCard
            label={summary ? `Assets · ${summary.siteName}` : "Assets"}
            value={summary?.assetCount ?? 0}
            icon={<Package size={20} />}
            accent={colors.warning}
            loading={summaryLoading}
          />
        </div>
        <div onClick={() => navigate("/kitchen/menus")} style={{ cursor: "pointer" }}>
          <StatCard
            label="Published Menus"
            value={summary?.publishedMenus ?? 0}
            icon={<ClipboardList size={20} />}
            accent={colors.success}
            loading={summaryLoading}
          />
        </div>
      </div>

      {/* ── Recent activity card ───────────────────────────────── */}
      <Card padding="0">
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1.1rem 1.5rem",
          borderBottom: `1px solid ${colors.border}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div style={{
              width: 32, height: 32, borderRadius: radius.md,
              background: gradients.primarySoft,
              color: colors.primary,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `inset 0 0 0 1px ${colors.primaryMid}55`,
            }}>
              <Activity size={15} />
            </div>
            <div>
              <div style={{
                fontWeight: font.weight.semibold,
                fontSize: font.size.md,
                color: colors.text,
                letterSpacing: font.tracking.tight,
              }}>
                Recent Activity
              </div>
              <div style={{
                fontSize: font.size.xs,
                color: colors.textMuted,
                marginTop: 1,
              }}>
                Latest actions across your workspace
              </div>
            </div>
          </div>
        </div>

        {activityLoading ? (
          <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: 14 }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                <SkeletonLine width="80px" height="20px" style={{ borderRadius: 10 }} />
                <SkeletonLine width="120px" height="14px" />
                <SkeletonLine width="100px" height="14px" />
                <SkeletonLine width="80px" height="14px" />
              </div>
            ))}
          </div>
        ) : activity.length === 0 ? (
          <div style={{
            padding: "3rem 2rem",
            textAlign: "center",
            color: colors.textMuted,
          }}>
            <div style={{
              width: 56, height: 56,
              borderRadius: radius.lg,
              background: gradients.primarySoft,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.5rem",
              marginBottom: "0.75rem",
            }}>
              📋
            </div>
            <div style={{ fontSize: font.size.md, color: colors.text, fontWeight: font.weight.semibold, marginBottom: 4 }}>
              No recent activity
            </div>
            <div style={{ fontSize: font.size.sm }}>
              Actions will show up here as your team uses HarborOps.
            </div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: font.size.sm }}>
            <thead>
              <tr style={{ background: colors.surfaceAlt }}>
                {["Action", "Entity", "Actor", "Time"].map(h => (
                  <th key={h} style={{
                    padding: "11px 18px",
                    textAlign: "left",
                    fontWeight: font.weight.semibold,
                    color: colors.textMuted,
                    fontSize: font.size.xs,
                    textTransform: "uppercase",
                    letterSpacing: font.tracking.wider,
                    whiteSpace: "nowrap",
                  }}>
                    {h}
                  </th>
                ))}
                <th style={{ width: 32, padding: "11px 18px" }} />
              </tr>
            </thead>
            <tbody>
              {activity.map((e, idx) => (
                <tr
                  key={e.id}
                  style={{
                    borderTop: `1px solid ${colors.border}`,
                    cursor: "default",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(el) => ((el.currentTarget as HTMLElement).style.background = colors.surfaceHover)}
                  onMouseLeave={(el) => ((el.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? colors.surface : colors.surfaceAlt)}
                  onFocus={() => {}}
                >
                  <td style={{ padding: "12px 18px" }}>
                    <ActionBadge action={e.action} />
                  </td>
                  <td style={{
                    padding: "12px 18px",
                    color: colors.text,
                    fontWeight: font.weight.medium,
                  }}>
                    {e.entity_type}
                  </td>
                  <td style={{ padding: "12px 18px", color: colors.textSecondary }}>
                    {e.actor_username ?? "—"}
                  </td>
                  <td style={{
                    padding: "12px 18px",
                    color: colors.textMuted,
                    whiteSpace: "nowrap",
                    fontSize: font.size.xs,
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {fmtTime(e.timestamp)}
                  </td>
                  <td style={{ padding: "12px 18px", textAlign: "right" }}>
                    <ArrowUpRight size={14} color={colors.textMuted} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
