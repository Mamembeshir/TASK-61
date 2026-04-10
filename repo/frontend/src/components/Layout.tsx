/**
 * Layout — sticky sidebar + scrollable main content area.
 * Courier role always gets a bare layout (CourierPage has its own header).
 */
import { useAuth } from "@/hooks/useAuth";
import Sidebar from "@/components/Sidebar";
import { colors } from "@/styles/tokens";

interface LayoutProps {
  children: React.ReactNode;
  bare?: boolean;
}

export default function Layout({ children, bare = false }: LayoutProps) {
  const { currentUser } = useAuth();

  if (bare || currentUser?.role === "COURIER") {
    return <>{children}</>;
  }

  return (
    <div style={{
      display: "flex",
      minHeight: "100vh",
      background: colors.bg,
    }}>
      <Sidebar />
      <main style={{
        flex: 1,
        minWidth: 0,
        overflowY: "auto",
        padding: "2rem 2.5rem",
      }}>
        {children}
      </main>
    </div>
  );
}
