/**
 * Layout — sticky sidebar + scrollable main content area on desktop;
 * top app-bar + slide-in drawer sidebar on mobile/tablet.
 *
 * The desktop and mobile chromes both reuse the same `<Sidebar />` component
 * unchanged — on mobile it's wrapped inside a full-screen overlay so the
 * existing sticky/100vh sidebar styles work without modification.
 *
 * Couriers and explicit `bare` callers always get a chrome-free layout
 * (CourierPage has its own header).
 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Menu, Shield, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import Sidebar from "@/components/Sidebar";
import { colors, font, gradients, radius } from "@/styles/tokens";

interface LayoutProps {
  children: React.ReactNode;
  bare?: boolean;
}

export default function Layout({ children, bare = false }: LayoutProps) {
  const { currentUser } = useAuth();
  const { isCompact } = useBreakpoint();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Auto-close the drawer when the viewport grows past the breakpoint.
  useEffect(() => {
    if (!isCompact && drawerOpen) setDrawerOpen(false);
  }, [isCompact, drawerOpen]);

  // Auto-close the drawer on every navigation so tapping a nav link dismisses it.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Lock body scroll while the drawer is open so the page behind doesn't move.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [drawerOpen]);

  if (bare || currentUser?.role === "COURIER") {
    return <>{children}</>;
  }

  return (
    <div style={{
      display: "flex",
      minHeight: "100vh",
      background: colors.bg,
      // subtle dotted grid backdrop for depth (premium touch, very light)
      backgroundImage: `radial-gradient(circle at 1px 1px, rgba(15,23,42,0.035) 1px, transparent 0)`,
      backgroundSize: "24px 24px",
    }}>
      {/* ── Desktop sidebar (sticky, in flow) ──────────────────────── */}
      {!isCompact && <Sidebar />}

      {/* ── Mobile drawer overlay ──────────────────────────────────── */}
      {isCompact && drawerOpen && (
        <>
          <div
            className="hb-drawer-backdrop"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div
            className="hb-drawer-slide"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              bottom: 0,
              zIndex: 100,
              display: "flex",
              boxShadow: "0 24px 60px -16px rgba(15,23,42,0.55)",
            }}
          >
            <Sidebar />
            {/* Floating close button overlaid on top of the sidebar */}
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
              style={{
                position: "absolute",
                top: 16,
                right: 12,
                width: 32,
                height: 32,
                borderRadius: radius.md,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.16)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 1,
              }}
            >
              <X size={16} />
            </button>
          </div>
        </>
      )}

      <div style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
      }}>
        {/* ── Mobile top bar ─────────────────────────────────────── */}
        {isCompact && (
          <div className="hb-topbar">
            <button
              type="button"
              className="hb-topbar-button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.55rem",
              minWidth: 0,
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: radius.md,
                background: gradients.primary,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 4px 12px -3px rgba(79,70,229,0.45)",
              }}>
                <Shield size={15} color="#fff" />
              </div>
              <span style={{
                fontWeight: font.weight.bold,
                fontSize: font.size.md,
                color: colors.text,
                letterSpacing: font.tracking.tight,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                HarborOps
              </span>
            </div>
          </div>
        )}

        <main
          className="hb-fade-in hb-main"
          style={{
            flex: 1,
            minWidth: 0,
            overflowY: "auto",
            padding: "2.25rem 2.5rem 3rem",
            maxWidth: "100%",
          }}
        >
          <div style={{ maxWidth: 1480, margin: "0 auto" }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
