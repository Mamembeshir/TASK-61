import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard, Users, Package, ChefHat, BookOpen, Utensils,
  ClipboardList, Calendar, CheckSquare, Bell, BarChart2, Webhook,
  Truck, LogOut, ChevronLeft, ChevronRight, Shield, Building2,
} from "lucide-react";
import { colors, radius, transition, font, gradients } from "@/styles/tokens";

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

const SIDEBAR_W = 240;
const SIDEBAR_COLLAPSED_W = 68;

// ---------------------------------------------------------------------------
// Role avatar (small colored circle with initial)
// ---------------------------------------------------------------------------

const ROLE_ACCENT: Record<string, string> = {
  ADMIN:   "#818CF8",   // indigo-400, reads well on dark sidebar
  STAFF:   "#60A5FA",   // blue-400
  COURIER: "#A78BFA",   // violet-400
};

function RoleAvatar({ role, name }: { role: string; name: string }) {
  const bg = ROLE_ACCENT[role] ?? "#818CF8";
  const initial = (name?.[0] ?? "?").toUpperCase();
  return (
    <div style={{
      width: 34, height: 34, borderRadius: radius.full,
      background: `linear-gradient(135deg, ${bg}3a 0%, ${bg}1a 100%)`,
      border: `1px solid ${bg}55`,
      color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: font.weight.bold,
      fontSize: font.size.sm,
      flexShrink: 0,
      boxShadow: `0 2px 8px -2px ${bg}44`,
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
  const baseNav =
    role === "ADMIN"   ? ADMIN_NAV   :
    role === "COURIER" ? COURIER_NAV : STAFF_NAV;
  const navItems: NavItem[] = currentUser?.isSuperuser
    ? [...baseNav, { label: "Tenants", to: "/admin/tenants", icon: <Building2 size={ICON_SIZE} /> }]
    : baseNav;

  const displayName = currentUser?.legalFirstName ?? currentUser?.username ?? "User";

  function toggleGroup(label: string) {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
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
      gap: "0.7rem",
      padding: collapsed ? "10px 0" : "9px 12px",
      borderRadius: radius.md,
      color: isActive ? "#fff" : colors.sidebarText,
      textDecoration: "none",
      fontSize: font.size.sm,
      fontWeight: isActive ? font.weight.semibold : font.weight.medium,
      background: isActive
        ? "linear-gradient(135deg, rgba(99,102,241,0.22) 0%, rgba(124,58,237,0.18) 100%)"
        : "transparent",
      boxShadow: isActive ? "inset 0 0 0 1px rgba(129,140,248,0.22)" : "none",
      transition: `background ${transition.base}, color ${transition.base}, box-shadow ${transition.base}`,
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
    <aside
      className="hb-sidebar-scroll"
      style={{
        width: `${w}px`,
        minWidth: `${w}px`,
        height: "100vh",
        position: "sticky",
        top: 0,
        background: gradients.sidebar,
        display: "flex",
        flexDirection: "column",
        transition: `width ${transition.slow}, min-width ${transition.slow}`,
        overflow: "hidden",
        zIndex: 100,
        flexShrink: 0,
        borderRight: "1px solid rgba(255,255,255,0.04)",
    }}>

      {/* ── Brand header ─────────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        padding: collapsed ? "20px 0" : "20px 18px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        flexShrink: 0,
        minHeight: 68,
      }}>
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <div style={{
              width: 32, height: 32, borderRadius: radius.md,
              background: gradients.primary,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 4px 12px -2px rgba(79,70,229,0.5), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}>
              <Shield size={16} color="#fff" />
            </div>
            <span style={{
              fontWeight: font.weight.bold,
              fontSize: font.size.lg,
              color: "#fff",
              whiteSpace: "nowrap",
              letterSpacing: font.tracking.tight,
            }}>
              HarborOps
            </span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: radius.sm,
            color: "rgba(255,255,255,0.65)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            flexShrink: 0,
            transition: `background ${transition.base}, color ${transition.base}`,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.12)";
            (e.currentTarget as HTMLElement).style.color = "#fff";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.65)";
          }}
        >
          {collapsed
            ? <ChevronRight size={14} />
            : <ChevronLeft size={14} />
          }
        </button>
      </div>

      {/* ── Nav items ────────────────────────────────────────────────── */}
      <nav style={{ flex: 1, padding: "12px 10px", overflowY: "auto", overflowX: "hidden" }}>
        {navItems.map(item => {
          if (item.children) {
            const isOpen = openGroups.has(item.label);
            return (
              <div key={item.label} style={{ marginBottom: 3 }}>
                {/* Group header — clicking toggles */}
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
                        color: "rgba(255,255,255,0.32)",
                        transition: `transform ${transition.base}`,
                        transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
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
                    paddingLeft: 32,
                    paddingBottom: 4,
                    borderLeft: "1.5px solid rgba(255,255,255,0.06)",
                    marginLeft: 22,
                    marginTop: 3,
                  }}>
                    {item.children.map(child => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        style={({ isActive }) => ({
                          display: "flex",
                          alignItems: "center",
                          gap: "0.55rem",
                          padding: "6px 11px",
                          borderRadius: radius.sm,
                          color: isActive ? "#fff" : "rgba(255,255,255,0.5)",
                          fontSize: font.size.xs,
                          fontWeight: isActive ? font.weight.semibold : font.weight.medium,
                          background: isActive ? "rgba(99,102,241,0.18)" : "transparent",
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
                        {child.icon && <span style={{ opacity: 0.75 }}>{child.icon}</span>}
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
              style={({ isActive }) => ({ ...linkStyle(isActive), marginBottom: 3 })}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                if (!el.style.background.includes("99,102,241") && !el.style.background.includes("124,58,237")) {
                  el.style.background = colors.sidebarHover;
                  el.style.color = "#fff";
                }
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                if (!el.style.background.includes("99,102,241") && !el.style.background.includes("124,58,237")) {
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
        borderTop: "1px solid rgba(255,255,255,0.05)",
        padding: collapsed ? "12px 0" : "12px 10px",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        background: "rgba(0,0,0,0.18)",
      }}>
        {/* User info row */}
        {!collapsed && currentUser && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "0.7rem",
            padding: "8px 10px",
            borderRadius: radius.md,
            marginBottom: 4,
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.04)",
          }}>
            <RoleAvatar role={role} name={displayName} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: font.size.sm,
                fontWeight: font.weight.semibold,
                color: "#fff",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                lineHeight: 1.3,
              }}>
                {displayName}
              </div>
              <div style={{
                fontSize: font.size.xs,
                color: "rgba(255,255,255,0.42)",
                textTransform: "capitalize",
                letterSpacing: "0.02em",
                lineHeight: 1.3,
                marginTop: 1,
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
            (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.13)";
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
