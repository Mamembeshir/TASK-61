/**
 * DashboardPage — Staff home with summary cards + recent activity feed.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckSquare, Package, ClipboardList, Activity } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import apiClient from "@/api/client";
import { StatCard, Card, Badge } from "@/components/ui";
import { colors, font } from "@/styles/tokens";

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
  LOGIN:   { bg: colors.gray100,      text: colors.gray500     },
  LOGOUT:  { bg: colors.gray100,      text: colors.gray500     },
  EXPORT:  { bg: "#F3E8FF",           text: "#7C3AED"          },
};

function ActionBadge({ action }: { action: string }) {
  const style = ACTION_COLORS[action] ?? { bg: colors.gray100, text: colors.gray600 };
  return (
    <Badge style={{ background: style.bg, color: style.text }}>
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

  return (
    <div>
      {/* Welcome banner */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{
          margin: 0,
          fontSize: font.size.h1,
          fontWeight: font.weight.bold,
          color: colors.text,
          letterSpacing: "-0.02em",
        }}>
          {getGreeting()}, {firstName} 👋
        </h1>
        <p style={{
          margin: "0.35rem 0 0",
          color: colors.textMuted,
          fontSize: font.size.base,
        }}>
          Here's a snapshot of what's happening today
          {summary?.siteName ? ` at ${summary.siteName}` : ""}.
        </p>
      </div>

      {/* Summary stat cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: "1rem",
        marginBottom: "2rem",
      }}>
        <div
          onClick={() => navigate("/meetings/tasks")}
          style={{ cursor: "pointer" }}
        >
          <StatCard
            label="Open Tasks"
            value={summary?.openTasks ?? null}
            icon={<CheckSquare size={18} />}
            accent={colors.primary}
            loading={summaryLoading}
          />
        </div>
        <div
          onClick={() => navigate("/assets")}
          style={{ cursor: "pointer" }}
        >
          <StatCard
            label={summary ? `Assets · ${summary.siteName}` : "Assets"}
            value={summary?.assetCount ?? null}
            icon={<Package size={18} />}
            accent={colors.warning}
            loading={summaryLoading}
          />
        </div>
        <div
          onClick={() => navigate("/kitchen/menus")}
          style={{ cursor: "pointer" }}
        >
          <StatCard
            label="Published Menus"
            value={summary?.publishedMenus ?? null}
            icon={<ClipboardList size={18} />}
            accent={colors.success}
            loading={summaryLoading}
          />
        </div>
      </div>

      {/* Recent activity table */}
      <Card padding="0">
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "1rem 1.5rem",
          borderBottom: `1px solid ${colors.border}`,
        }}>
          <Activity size={16} color={colors.primary} />
          <span style={{
            fontWeight: font.weight.semibold,
            fontSize: font.size.base,
            color: colors.text,
          }}>
            Recent Activity
          </span>
        </div>

        {activityLoading ? (
          <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ display: "flex", gap: "1rem" }}>
                <div style={{ height: 20, width: 80, background: colors.gray200, borderRadius: 10 }} />
                <div style={{ height: 20, width: 120, background: colors.gray100, borderRadius: 4 }} />
                <div style={{ height: 20, width: 100, background: colors.gray100, borderRadius: 4 }} />
                <div style={{ height: 20, width: 80, background: colors.gray100, borderRadius: 4 }} />
              </div>
            ))}
          </div>
        ) : activity.length === 0 ? (
          <div style={{
            padding: "3rem",
            textAlign: "center",
            color: colors.textMuted,
            fontSize: font.size.sm,
          }}>
            <div style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>📋</div>
            No recent activity to display.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: font.size.sm }}>
            <thead>
              <tr style={{ background: colors.gray50 }}>
                {["Action", "Entity", "Actor", "Time"].map(h => (
                  <th key={h} style={{
                    padding: "10px 16px",
                    textAlign: "left",
                    fontWeight: font.weight.semibold,
                    color: colors.textMuted,
                    fontSize: font.size.xs,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    whiteSpace: "nowrap",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activity.map((e, idx) => (
                <tr
                  key={e.id}
                  style={{
                    borderTop: `1px solid ${colors.border}`,
                    background: idx % 2 === 0 ? colors.surface : colors.gray50,
                  }}
                >
                  <td style={{ padding: "10px 16px" }}>
                    <ActionBadge action={e.action} />
                  </td>
                  <td style={{ padding: "10px 16px", color: colors.textSecondary, fontWeight: font.weight.medium }}>
                    {e.entity_type}
                  </td>
                  <td style={{ padding: "10px 16px", color: colors.textMuted }}>
                    {e.actor_username ?? "—"}
                  </td>
                  <td style={{ padding: "10px 16px", color: colors.textMuted, whiteSpace: "nowrap", fontSize: font.size.xs }}>
                    {fmtTime(e.timestamp)}
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
