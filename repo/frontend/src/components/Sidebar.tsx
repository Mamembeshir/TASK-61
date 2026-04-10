import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard, Users, Package, ChefHat, BookOpen, Utensils,
  ClipboardList, Calendar, CheckSquare, Bell, BarChart2, Webhook,
  Truck, LogOut, ChevronLeft, ChevronRight, Shield,
} from "lucide-react";
import { colors, radius, transition, font } from "@/styles/tokens";

// ---------------------------------------------------------------------------
// Nav item definition
// ---------------------------------------------------------------------------

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  children?: { label: string; to: string; icon?: React.ReactNode }[];
}

const ICON_SIZE = 18;

const ADMIN_NAV: NavItem[] = [
  { label: "Dashboard",  to: "/dashboard",      icon: <LayoutDashboard size={ICON_SIZE} /> },
  { label: "Users",      to: "/admin/users",    icon: <Users size={ICON_SIZE} /> },
  { label: "Assets",     to: "/assets",         icon: <Package size={ICON_SIZE} /> },
  {
    label: "Kitchen", to: "/kitchen", icon: <ChefHat size={ICON_SIZE} />,
    children: [
      { label: "Recipes", to: "/kitchen/recipes", icon: <BookOpen size={14} /> },
      { label: "Dishes",  to: "/kitchen/dishes",  icon: <Utensils size={14} /> },
      { label: "Menus",   to: "/kitchen/menus",   icon: <ClipboardList size={14} /> },
    ],
  },
  { label: "Meetings",   to: "/meetings",       icon: <Calendar size={ICON_SIZE} /> },
  { label: "Tasks",      to: "/meetings/tasks", icon: <CheckSquare size={ICON_SIZE} /> },
  { label: "Alerts",     to: "/alerts",         icon: <Bell size={ICON_SIZE} /> },
  { label: "Analytics",  to: "/analytics",      icon: <BarChart2 size={ICON_SIZE} /> },
  { label: "Webhooks",   to: "/webhooks",       icon: <Webhook size={ICON_SIZE} /> },
];

const STAFF_NAV: NavItem[] = [
  { label: "Dashboard",  to: "/dashboard",      icon: <LayoutDashboard size={ICON_SIZE} /> },
  { label: "Assets",     to: "/assets",         icon: <Package size={ICON_SIZE} /> },
  {
    label: "Kitchen", to: "/kitchen", icon: <ChefHat size={ICON_SIZE} />,
    children: [
      { label: "Recipes", to: "/kitchen/recipes", icon: <BookOpen size={14} /> },
      { label: "Dishes",  to: "/kitchen/dishes",  icon: <Utensils size={14} /> },
      { label: "Menus",   to: "/kitchen/menus",   icon: <ClipboardList size={14} /> },
    ],
  },
  { label: "Meetings",   to: "/meetings",       icon: <Calendar size={ICON_SIZE} /> },
  { label: "Tasks",      to: "/meetings/tasks", icon: <CheckSquare size={ICON_SIZE} /> },
  { label: "Alerts",     to: "/alerts",         icon: <Bell size={ICON_SIZE} /> },
  { label: "Analytics",  to: "/analytics",      icon: <BarChart2 size={ICON_SIZE} /> },
];

const COURIER_NAV: NavItem[] = [
  { label: "My Deliveries", to: "/courier", icon: <Truck size={ICON_SIZE} /> },
];

// ---------------------------------------------------------------------------
// Widths
// ---------------------------------------------------------------------------

const SIDEBAR_W = 224;
const SIDEBAR_COLLAPSED_W = 60;

// ---------------------------------------------------------------------------
// Role avatar (small colored circle with initial)
// ---------------------------------------------------------------------------

const ROLE_ACCENT: Record<string, string> = {
  ADMIN:   colors.primary,
  STAFF:   colors.info,
  COURIER: "#7C3AED",
};

function RoleAvatar({ role, name }: { role: string; name: string }) {
  const bg = ROLE_ACCENT[role] ?? colors.primary;
  const initial = (name?.[0] ?? "?").toUpperCase();
  return (
    <div style={{
      width: 32, height: 32, borderRadius: radius.full,
      background: bg + "33",
      border: `1.5px solid ${bg}55`,
      color: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: font.weight.bold,
      fontSize: font.size.sm,
      flexShrink: 0,
    }}>
      {initial}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Sidebar() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(["Kitchen"]));

  const role = currentUser?.role ?? "STAFF";
  const navItems =
    role === "ADMIN"   ? ADMIN_NAV   :
    role === "COURIER" ? COURIER_NAV : STAFF_NAV;

  const displayName = currentUser?.legalFirstName ?? currentUser?.username ?? "User";

  function toggleGroup(label: string) {
    setOpenGroups(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const w = collapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_W;

  // Shared nav link style factory
  function linkStyle(isActive: boolean, extra?: React.CSSProperties): React.CSSProperties {
    return {
      display: "flex",
      alignItems: "center",
      gap: "0.625rem",
      padding: collapsed ? "9px 0" : "8px 12px",
      borderRadius: radius.md,
      color: isActive ? "#fff" : colors.sidebarText,
      textDecoration: "none",
      fontSize: font.size.sm,
      fontWeight: isActive ? font.weight.semibold : font.weight.normal,
      background: isActive ? colors.sidebarActive : "transparent",
      transition: `background ${transition.base}, color ${transition.base}`,
      cursor: "pointer",
      border: "none",
      width: "100%",
      textAlign: "left" as const,
      justifyContent: collapsed ? "center" : "flex-start",
      position: "relative" as const,
      ...extra,
    };
  }

  return (
    <aside style={{
      width: `${w}px`,
      minWidth: `${w}px`,
      height: "100vh",
      position: "sticky",
      top: 0,
      background: colors.sidebarBg,
      display: "flex",
      flexDirection: "column",
      transition: `width ${transition.slow}, min-width ${transition.slow}`,
      overflow: "hidden",
      zIndex: 100,
      flexShrink: 0,
    }}>

      {/* ── Brand header ─────────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        padding: collapsed ? "18px 0" : "18px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
        minHeight: 60,
      }}>
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div style={{
              width: 28, height: 28, borderRadius: radius.sm,
              background: colors.primary,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <Shield size={15} color="#fff" />
            </div>
            <span style={{
              fontWeight: font.weight.bold,
              fontSize: font.size.lg,
              color: "#fff",
              whiteSpace: "nowrap",
              letterSpacing: "-0.01em",
            }}>
              HarborOps
            </span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: radius.sm,
            color: colors.sidebarText,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 26,
            height: 26,
            flexShrink: 0,
            transition: `background ${transition.base}`,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
          onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
        >
          {collapsed
            ? <ChevronRight size={14} />
            : <ChevronLeft size={14} />
          }
        </button>
      </div>

      {/* ── Nav items ────────────────────────────────────────────────── */}
      <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto", overflowX: "hidden" }}>
        {navItems.map(item => {
          if (item.children) {
            const isOpen = openGroups.has(item.label);
            return (
              <div key={item.label} style={{ marginBottom: 2 }}>
                {/* Group header — clicking navigates and toggles */}
                <button
                  onClick={() => toggleGroup(item.label)}
                  title={collapsed ? item.label : undefined}
                  style={linkStyle(false)}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = colors.sidebarHover;
                    (e.currentTarget as HTMLElement).style.color = "#fff";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = colors.sidebarText;
                  }}
                >
                  <span style={{ flexShrink: 0, display: "flex" }}>{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      <span style={{
                        color: "rgba(255,255,255,0.3)",
                        transition: `transform ${transition.base}`,
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        display: "flex",
                      }}>
                        <ChevronRight size={13} />
                      </span>
                    </>
                  )}
                </button>

                {/* Sub-items */}
                {isOpen && !collapsed && (
                  <div style={{
                    paddingLeft: 30,
                    paddingBottom: 4,
                    borderLeft: "1.5px solid rgba(255,255,255,0.07)",
                    marginLeft: 21,
                    marginTop: 2,
                  }}>
                    {item.children.map(child => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        style={({ isActive }) => ({
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          padding: "6px 10px",
                          borderRadius: radius.sm,
                          color: isActive ? colors.sidebarTextActive : "rgba(255,255,255,0.5)",
                          fontSize: font.size.xs,
                          fontWeight: isActive ? font.weight.semibold : font.weight.normal,
                          background: isActive ? "rgba(99,102,241,0.15)" : "transparent",
                          textDecoration: "none",
                          transition: `background ${transition.base}, color ${transition.base}`,
                          marginBottom: 1,
                        })}
                        onMouseEnter={e => {
                          const el = e.currentTarget as HTMLElement;
                          if (!el.style.background.includes("99,102,241")) {
                            el.style.color = "#fff";
                          }
                        }}
                        onMouseLeave={e => {
                          const el = e.currentTarget as HTMLElement;
                          if (!el.style.background.includes("99,102,241")) {
                            el.style.color = "rgba(255,255,255,0.5)";
                          }
                        }}
                      >
                        {child.icon && <span style={{ opacity: 0.7 }}>{child.icon}</span>}
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/dashboard" || item.to === "/courier"}
              title={collapsed ? item.label : undefined}
              style={({ isActive }) => linkStyle(isActive)}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                if (!el.style.background.includes("99,102,241")) {
                  el.style.background = colors.sidebarHover;
                  el.style.color = "#fff";
                }
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                if (!el.style.background.includes("99,102,241")) {
                  el.style.background = "transparent";
                  el.style.color = colors.sidebarText;
                }
              }}
            >
              <span style={{ flexShrink: 0, display: "flex" }}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* ── User footer ──────────────────────────────────────────────── */}
      <div style={{
        borderTop: "1px solid rgba(255,255,255,0.06)",
        padding: collapsed ? "12px 0" : "12px 8px",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}>
        {/* User info row */}
        {!collapsed && currentUser && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "0.625rem",
            padding: "6px 10px",
            borderRadius: radius.md,
            marginBottom: 4,
          }}>
            <RoleAvatar role={role} name={displayName} />
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: font.size.sm,
                fontWeight: font.weight.semibold,
                color: colors.sidebarTextActive,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {displayName}
              </div>
              <div style={{
                fontSize: font.size.xs,
                color: "rgba(255,255,255,0.35)",
                textTransform: "capitalize",
                letterSpacing: "0.02em",
              }}>
                {role.toLowerCase()}
              </div>
            </div>
          </div>
        )}

        {/* Sign out button */}
        <button
          onClick={handleLogout}
          title={collapsed ? "Sign out" : undefined}
          style={linkStyle(false)}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.12)";
            (e.currentTarget as HTMLElement).style.color = "#FCA5A5";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = colors.sidebarText;
          }}
        >
          <span style={{ flexShrink: 0, display: "flex" }}><LogOut size={ICON_SIZE} /></span>
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
