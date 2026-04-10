import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";

// Pages
import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import PendingPage from "@/pages/auth/PendingPage";
import SuspendedPage from "@/pages/auth/SuspendedPage";
import DashboardPage from "@/pages/DashboardPage";
import AssetsPage from "@/pages/assets/AssetsPage";
import AssetCreatePage from "@/pages/assets/AssetCreatePage";
import AssetDetailPage from "@/pages/assets/AssetDetailPage";
import AssetImportPage from "@/pages/assets/AssetImportPage";
import KitchenPage from "@/pages/kitchen/KitchenPage";
import RecipesPage from "@/pages/kitchen/RecipesPage";
import RecipeCreatePage from "@/pages/kitchen/RecipeCreatePage";
import RecipeDetailPage from "@/pages/kitchen/RecipeDetailPage";
import RecipeVersionCreatePage from "@/pages/kitchen/RecipeVersionCreatePage";
import DishesPage from "@/pages/kitchen/DishesPage";
import DishCreatePage from "@/pages/kitchen/DishCreatePage";
import DishDetailPage from "@/pages/kitchen/DishDetailPage";
import DishVersionCreatePage from "@/pages/kitchen/DishVersionCreatePage";
import MenusPage from "@/pages/kitchen/MenusPage";
import MenuBuilderPage from "@/pages/kitchen/MenuBuilderPage";
import MenuDetailPage from "@/pages/kitchen/MenuDetailPage";
import MeetingsPage from "@/pages/meetings/MeetingsPage";
import MeetingDetailPage from "@/pages/meetings/MeetingDetailPage";
import MyTasksPage from "@/pages/meetings/MyTasksPage";
import AnalyticsPage from "@/pages/analytics/AnalyticsPage";
import AlertsPage from "@/pages/alerts/AlertsPage";
import WebhooksPage from "@/pages/webhooks/WebhooksPage";
import AdminUsersPage from "@/pages/admin/AdminUsersPage";
import AdminUserDetailPage from "@/pages/admin/AdminUserDetailPage";
import CreateCourierPage from "@/pages/admin/CreateCourierPage";
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import AdminTenantsPage from "@/pages/admin/AdminTenantsPage";
import AdminTenantDetailPage from "@/pages/admin/AdminTenantDetailPage";
import CourierPage from "@/pages/courier/CourierPage";

// ---------------------------------------------------------------------------
// Global error / status pages
// ---------------------------------------------------------------------------

function AccessDeniedPage() {
  const navigate = useNavigate();
  return (
    <Layout>
      <div style={centeredBox}>
        <div style={{ fontSize: "2.5rem" }}>🚫</div>
        <h2 style={boxTitle}>Access Denied</h2>
        <p style={boxDesc}>You don't have permission to view this page.</p>
        <button onClick={() => navigate(-1)} style={btnSecondary}>Go back</button>
      </div>
    </Layout>
  );
}

function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Layout>
      <div style={centeredBox}>
        <div style={{ fontSize: "2.5rem" }}>🔍</div>
        <h2 style={boxTitle}>Page Not Found</h2>
        <p style={boxDesc}>The page you're looking for doesn't exist.</p>
        <button onClick={() => navigate(-1)} style={btnSecondary}>Go back</button>
      </div>
    </Layout>
  );
}

function ServerErrorPage() {
  const navigate = useNavigate();
  return (
    <Layout>
      <div style={centeredBox}>
        <div style={{ fontSize: "2.5rem" }}>⚠️</div>
        <h2 style={boxTitle}>Something Went Wrong</h2>
        <p style={boxDesc}>A server error occurred. Please try again later.</p>
        <button onClick={() => navigate(-1)} style={btnSecondary}>Go back</button>
      </div>
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Route guards
// ---------------------------------------------------------------------------

/** Redirect unauthenticated users to /login, handle status-based routing */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { currentUser, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading || !currentUser) return;
    if (currentUser.status === "PENDING_REVIEW") navigate("/pending", { replace: true });
    else if (currentUser.status === "SUSPENDED") navigate("/suspended", { replace: true });
  }, [currentUser, isLoading, navigate]);

  if (isLoading) return <LoadingSpinner />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (currentUser.status === "PENDING_REVIEW") return <Navigate to="/pending" replace />;
  if (currentUser.status === "SUSPENDED") return <Navigate to="/suspended" replace />;
  return <>{children}</>;
}

/** Redirect authenticated users away from /login and /register */
function RedirectIfAuth({ children }: { children: React.ReactNode }) {
  const { currentUser, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner />;
  if (currentUser) {
    if (currentUser.role === "ADMIN") return <Navigate to="/admin/users" replace />;
    if (currentUser.role === "COURIER") return <Navigate to="/courier" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

/** Only allow ADMIN role */
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  if (currentUser?.role !== "ADMIN") return <AccessDeniedPage />;
  return <>{children}</>;
}

/** Only allow superusers */
function RequireSuperuser({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  if (!currentUser?.isSuperuser) return <AccessDeniedPage />;
  return <>{children}</>;
}

/** Block COURIER from accessing non-courier pages */
function BlockCourier({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  if (currentUser?.role === "COURIER") return <Navigate to="/courier" replace />;
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Loading spinner
// ---------------------------------------------------------------------------

function LoadingSpinner() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#f4f6fb", fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{ textAlign: "center", color: "#6c757d" }}>
        <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>⏳</div>
        <div>Loading…</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App routes
// ---------------------------------------------------------------------------

function AppRoutes() {
  return (
    <Routes>
      {/* ------------------------------------------------------------------ */}
      {/* Public                                                               */}
      {/* ------------------------------------------------------------------ */}
      <Route path="/login"    element={<RedirectIfAuth><LoginPage /></RedirectIfAuth>} />
      <Route path="/register" element={<RedirectIfAuth><RegisterPage /></RedirectIfAuth>} />
      <Route path="/pending"  element={<PendingPage />} />
      <Route path="/suspended" element={<SuspendedPage />} />

      {/* ------------------------------------------------------------------ */}
      {/* Courier (standalone — no sidebar)                                    */}
      {/* ------------------------------------------------------------------ */}
      <Route path="/courier" element={
        <RequireAuth><CourierPage /></RequireAuth>
      } />

      {/* ------------------------------------------------------------------ */}
      {/* Staff + Admin pages (wrapped in Layout with sidebar)                 */}
      {/* ------------------------------------------------------------------ */}
      <Route path="/dashboard" element={
        <RequireAuth><BlockCourier>
          <Layout><DashboardPage /></Layout>
        </BlockCourier></RequireAuth>
      } />

      {/* Assets */}
      <Route path="/assets/new" element={
        <RequireAuth><BlockCourier><Layout><AssetCreatePage /></Layout></BlockCourier></RequireAuth>
      } />
      <Route path="/assets/import" element={
        <RequireAuth><BlockCourier><Layout><AssetImportPage /></Layout></BlockCourier></RequireAuth>
      } />
      <Route path="/assets/:id" element={
        <RequireAuth><BlockCourier><Layout><AssetDetailPage /></Layout></BlockCourier></RequireAuth>
      } />
      <Route path="/assets" element={
        <RequireAuth><BlockCourier><Layout><AssetsPage /></Layout></BlockCourier></RequireAuth>
      } />

      {/* Kitchen */}
      <Route path="/kitchen" element={
        <RequireAuth><BlockCourier><Layout><KitchenPage /></Layout></BlockCourier></RequireAuth>
      } />
      <Route path="/kitchen/recipes/new" element={
        <RequireAuth><BlockCourier><Layout><RecipeCreatePage /></Layout></BlockCourier></RequireAuth>
      } />
      <Route path="/kitchen/recipes/:id/versions/new" element={
        <RequireAuth><BlockCourier><Layout><RecipeVersionCreatePage /></Layout></BlockCourier></RequireAuth>
      } />
      <Route path="/kitchen/recipes/:id" element={
        <RequireAuth><BlockCourier><Layout><RecipeDetailPage /></Layout></BlockCourier></RequireAuth>
      } />
      <Route path="/kitchen/recipes" element={
        <RequireAuth><BlockCourier><Layout><RecipesPage /></Layout></BlockCourier></RequireAuth>
      } />
      <Route path="/kitchen/dishes/new" element={
        <RequireAuth><BlockCourier><Layout><DishCreatePage /></Layout></BlockCourier></RequireAuth>
      } />
      <Route path="/kitchen/dishes/:id/versions/new" element={
        <RequireAuth><BlockCourier><Layout><DishVersionCreatePage /></Layout></BlockCourier></RequireAuth>
      } />
      <Route path="/kitchen/dishes/:id" element={
        <RequireAuth><BlockCourier><Layout><DishDetailPage /></Layout></BlockCourier></RequireAuth>
      } />
      <Route path="/kitchen/dishes" element={
        <RequireAuth><BlockCourier><Layout><DishesPage /></Layout></BlockCourier></RequireAuth>
      } />
      <Route path="/kitchen/menus/new" element={
        <RequireAuth><BlockCourier><Layout><MenuBuilderPage /></Layout></BlockCourier></RequireAuth>
      } />
      <Route path="/kitchen/menus/:id" element={
        <RequireAuth><BlockCourier><Layout><MenuDetailPage /></Layout></BlockCourier></RequireAuth>
      } />
      <Route path="/kitchen/menus" element={
        <RequireAuth><BlockCourier><Layout><MenusPage /></Layout></BlockCourier></RequireAuth>
      } />

      {/* Meetings */}
      <Route path="/meetings/tasks" element={
        <RequireAuth><BlockCourier><Layout><MyTasksPage /></Layout></BlockCourier></RequireAuth>
      } />
      <Route path="/meetings/:id" element={
        <RequireAuth><BlockCourier><Layout><MeetingDetailPage /></Layout></BlockCourier></RequireAuth>
      } />
      <Route path="/meetings" element={
        <RequireAuth><BlockCourier><Layout><MeetingsPage /></Layout></BlockCourier></RequireAuth>
      } />

      {/* Analytics / Alerts / Webhooks (ADMIN only for Webhooks) */}
      <Route path="/analytics" element={
        <RequireAuth><BlockCourier><Layout><AnalyticsPage /></Layout></BlockCourier></RequireAuth>
      } />
      <Route path="/alerts" element={
        <RequireAuth><BlockCourier><Layout><AlertsPage /></Layout></BlockCourier></RequireAuth>
      } />
      <Route path="/webhooks" element={
        <RequireAuth><BlockCourier><RequireAdmin><Layout><WebhooksPage /></Layout></RequireAdmin></BlockCourier></RequireAuth>
      } />

      {/* Admin */}
      <Route path="/admin/users/create-courier" element={
        <RequireAuth><RequireAdmin><Layout><CreateCourierPage /></Layout></RequireAdmin></RequireAuth>
      } />
      <Route path="/admin/users/:id" element={
        <RequireAuth><RequireAdmin><Layout><AdminUserDetailPage /></Layout></RequireAdmin></RequireAuth>
      } />
      <Route path="/admin/users" element={
        <RequireAuth><RequireAdmin><Layout><AdminUsersPage /></Layout></RequireAdmin></RequireAuth>
      } />
      <Route path="/admin" element={
        <RequireAuth><RequireAdmin><Layout><AdminDashboardPage /></Layout></RequireAdmin></RequireAuth>
      } />

      {/* Superuser — tenant management */}
      <Route path="/admin/tenants/:id" element={
        <RequireAuth><RequireSuperuser><Layout><AdminTenantDetailPage /></Layout></RequireSuperuser></RequireAuth>
      } />
      <Route path="/admin/tenants" element={
        <RequireAuth><RequireSuperuser><Layout><AdminTenantsPage /></Layout></RequireSuperuser></RequireAuth>
      } />

      {/* Error pages */}
      <Route path="/403" element={<AccessDeniedPage />} />
      <Route path="/500" element={<ServerErrorPage />} />

      {/* Default */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const centeredBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "60vh",
  textAlign: "center",
  gap: "0.75rem",
};

const boxTitle: React.CSSProperties = {
  margin: 0, fontSize: "1.3rem", fontWeight: 700, color: "#1a1a2e",
};

const boxDesc: React.CSSProperties = {
  margin: 0, color: "#6c757d", fontSize: "0.9rem",
};

const btnSecondary: React.CSSProperties = {
  padding: "8px 20px",
  background: "#6c757d",
  color: "#fff",
  border: "none",
  borderRadius: "7px",
  fontSize: "0.9rem",
  fontWeight: 600,
  cursor: "pointer",
};
