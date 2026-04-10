/**
 * AdminDashboardPage — admin overview with user stats, pending reviews,
 * asset totals, and recent audit log activity.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Package, AlertTriangle, Shield, Activity } from "lucide-react";
import { adminApi, AdminUserSummary } from "@/api/admin";
import apiClient from "@/api/client";
import { PageHeader, StatCard, Card, Badge } from "@/components/ui";
import { colors, radius, font, transition } from "@/styles/tokens";
import { roleColors } from "@/styles/tokens";

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

interface Stats {
  totalUsers: number;
  activeUsers: number;
  pendingReview: number;
  suspended: number;
  totalAssets: number;
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
// Pending user row
// ---------------------------------------------------------------------------

function PendingUserRow({ user, onView }: { user: AdminUserSummary; onView: () => void }) {
  const [hovered, setHovered] = useState(false);
  const roleStyle = roleColors[user.role] ?? { bg: colors.gray100, text: colors.gray600 };
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onView}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "10px 16px",
        borderBottom: `1px solid ${colors.border}`,
        cursor: "pointer",
        background: hovered ? colors.surfaceHover : "transparent",
        transition: `background ${transition.base}`,
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: radius.full,
        background: colors.primaryLight,
        color: colors.primary,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: font.weight.bold,
        fontSize: font.size.sm,
        flexShrink: 0,
      }}>
        {(user.legal_name ?? user.username)?.[0]?.toUpperCase() ?? "?"}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {user.legal_name ?? user.username}
        </div>
        <div style={{ fontSize: font.size.xs, color: colors.textMuted }}>
          @{user.username}
        </div>
      </div>

      <Badge style={{ background: roleStyle.bg, color: roleStyle.text, fontSize: font.size.xs }}>
        {user.role}
      </Badge>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminDashboardPage() {
  const navigate = useNavigate();

  const [stats, setStats]           = useState<Stats | null>(null);
  const [statsLoading, setStatsLoad] = useState(true);
  const [pending, setPending]       = useState<AdminUserSummary[]>([]);
  const [pendingLoading, setPendLoad] = useState(true);
  const [activity, setActivity]     = useState<AuditEntry[]>([]);
  const [actLoading, setActLoad]    = useState(true);

  useEffect(() => {
    // Load user stats
    Promise.allSettled([
      adminApi.listUsers({ page: 1 }),
      adminApi.listUsers({ status: "ACTIVE" }),
      adminApi.listUsers({ status: "PENDING_REVIEW" }),
      adminApi.listUsers({ status: "SUSPENDED" }),
      apiClient.get("assets/?page_size=1"),
    ]).then(([allRes, activeRes, pendRes, suspRes, assetsRes]) => {
      setStats({
        totalUsers:   allRes.status    === "fulfilled" ? allRes.value.count    : 0,
        activeUsers:  activeRes.status === "fulfilled" ? activeRes.value.count : 0,
        pendingReview: pendRes.status  === "fulfilled" ? pendRes.value.count   : 0,
        suspended:    suspRes.status   === "fulfilled" ? suspRes.value.count   : 0,
        totalAssets:  assetsRes.status === "fulfilled" ? (assetsRes.value.data.count ?? 0) : 0,
      });
    }).finally(() => setStatsLoad(false));

    // Load pending users (first 5)
    adminApi.listUsers({ status: "PENDING_REVIEW" })
      .then(r => setPending(r.results.slice(0, 5)))
      .catch(() => setPending([]))
      .finally(() => setPendLoad(false));

    // Load recent audit log
    apiClient.get("core/audit-log/")
      .then(r => setActivity(r.data.slice(0, 8)))
      .catch(() => setActivity([]))
      .finally(() => setActLoad(false));
  }, []);

  function fmtTime(ts: string) {
    return new Date(ts).toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <div>
      <PageHeader
        title="Admin Overview"
        subtitle="System-wide statistics and recent activity"
        icon={<Shield size={22} />}
        actions={
          <button
            onClick={() => navigate("/admin/users")}
            style={{
              display: "flex", alignItems: "center", gap: "0.375rem",
              padding: "8px 16px",
              borderRadius: radius.md,
              border: "none",
              background: colors.primary,
              color: "#fff",
              fontSize: font.size.sm,
              fontWeight: font.weight.medium,
              cursor: "pointer",
            }}
          >
            <Users size={15} /> Manage Users
          </button>
        }
      />

      {/* Stats row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: "1rem",
        marginBottom: "2rem",
      }}>
        <StatCard
          label="Total Users"
          value={stats?.totalUsers ?? null}
          icon={<Users size={18} />}
          accent={colors.primary}
          loading={statsLoading}
        />
        <StatCard
          label="Active Users"
          value={stats?.activeUsers ?? null}
          icon={<Users size={18} />}
          accent={colors.success}
          loading={statsLoading}
        />
        <StatCard
          label="Pending Review"
          value={stats?.pendingReview ?? null}
          icon={<AlertTriangle size={18} />}
          accent={colors.warning}
          loading={statsLoading}
        />
        <StatCard
          label="Suspended"
          value={stats?.suspended ?? null}
          icon={<AlertTriangle size={18} />}
          accent={colors.danger}
          loading={statsLoading}
        />
        <StatCard
          label="Total Assets"
          value={stats?.totalAssets ?? null}
          icon={<Package size={18} />}
          accent={colors.info}
          loading={statsLoading}
        />
      </div>

      {/* Two-column layout: Pending Reviews + Audit Log */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(280px, 1fr) minmax(400px, 2fr)",
        gap: "1.5rem",
        alignItems: "start",
      }}>

        {/* Pending Reviews panel */}
        <Card padding="0">
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem 1.25rem",
            borderBottom: `1px solid ${colors.border}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <AlertTriangle size={16} color={colors.warning} />
              <span style={{ fontWeight: font.weight.semibold, fontSize: font.size.base, color: colors.text }}>
                Pending Reviews
              </span>
              {stats && stats.pendingReview > 0 && (
                <Badge style={{ background: colors.warningLight, color: colors.warningDark }}>
                  {stats.pendingReview}
                </Badge>
              )}
            </div>
            <button
              onClick={() => navigate("/admin/users?status=PENDING_REVIEW")}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: colors.primary, fontSize: font.size.xs,
                fontWeight: font.weight.medium,
              }}
            >
              View all →
            </button>
          </div>

          {pendingLoading ? (
            <div style={{ padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: 10 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ width: 32, height: 32, borderRadius: radius.full, background: colors.gray200 }} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ height: 12, width: "60%", background: colors.gray200, borderRadius: 4 }} />
                    <div style={{ height: 10, width: "40%", background: colors.gray100, borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : pending.length === 0 ? (
            <div style={{
              padding: "2rem 1.25rem",
              textAlign: "center",
              color: colors.textMuted,
              fontSize: font.size.sm,
            }}>
              <div style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>✅</div>
              No pending reviews
            </div>
          ) : (
            <div>
              {pending.map(u => (
                <PendingUserRow
                  key={u.id}
                  user={u}
                  onView={() => navigate(`/admin/users/${u.id}`)}
                />
              ))}
            </div>
          )}
        </Card>

        {/* Audit log panel */}
        <Card padding="0">
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "1rem 1.25rem",
            borderBottom: `1px solid ${colors.border}`,
          }}>
            <Activity size={16} color={colors.primary} />
            <span style={{ fontWeight: font.weight.semibold, fontSize: font.size.base, color: colors.text }}>
              Recent Activity
            </span>
          </div>

          {actLoading ? (
            <div style={{ padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: 10 }}>
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "6px 0" }}>
                  <div style={{ height: 20, width: 70, background: colors.gray200, borderRadius: 10 }} />
                  <div style={{ height: 20, width: 100, background: colors.gray100, borderRadius: 4 }} />
                  <div style={{ height: 20, width: 120, background: colors.gray100, borderRadius: 4 }} />
                </div>
              ))}
            </div>
          ) : activity.length === 0 ? (
            <div style={{
              padding: "2rem",
              textAlign: "center",
              color: colors.textMuted,
              fontSize: font.size.sm,
            }}>
              No recent activity.
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
                    <td style={{ padding: "9px 16px" }}>
                      <ActionBadge action={e.action} />
                    </td>
                    <td style={{ padding: "9px 16px", color: colors.textSecondary, fontWeight: font.weight.medium }}>
                      {e.entity_type}
                    </td>
                    <td style={{ padding: "9px 16px", color: colors.textMuted }}>
                      {e.actor_username ?? "—"}
                    </td>
                    <td style={{ padding: "9px 16px", color: colors.textMuted, whiteSpace: "nowrap", fontSize: font.size.xs }}>
                      {fmtTime(e.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
