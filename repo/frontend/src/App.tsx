import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";

// Pages
import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
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
import AnalyticsPage from "@/pages/analytics/AnalyticsPage";
import AdminUsersPage from "@/pages/admin/AdminUsersPage";
import AdminUserDetailPage from "@/pages/admin/AdminUserDetailPage";
import CreateCourierPage from "@/pages/admin/CreateCourierPage";
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import CourierPage from "@/pages/courier/CourierPage";

/** Redirect unauthenticated users to /login */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { currentUser, isLoading } = useAuth();
  if (isLoading) return <div>Loading…</div>;
  if (!currentUser) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Redirect authenticated users away from /login and /register */
function RedirectIfAuth({ children }: { children: React.ReactNode }) {
  const { currentUser, isLoading } = useAuth();
  if (isLoading) return <div>Loading…</div>;
  if (currentUser) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<RedirectIfAuth><LoginPage /></RedirectIfAuth>} />
      <Route path="/register" element={<RedirectIfAuth><RegisterPage /></RedirectIfAuth>} />

      {/* Protected */}
      <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="/assets/new"    element={<RequireAuth><AssetCreatePage /></RequireAuth>} />
      <Route path="/assets/import" element={<RequireAuth><AssetImportPage /></RequireAuth>} />
      <Route path="/assets/:id"    element={<RequireAuth><AssetDetailPage /></RequireAuth>} />
      <Route path="/assets"        element={<RequireAuth><AssetsPage /></RequireAuth>} />
      <Route path="/kitchen" element={<RequireAuth><KitchenPage /></RequireAuth>} />
      <Route path="/kitchen/recipes/new"                  element={<RequireAuth><RecipeCreatePage /></RequireAuth>} />
      <Route path="/kitchen/recipes/:id/versions/new"    element={<RequireAuth><RecipeVersionCreatePage /></RequireAuth>} />
      <Route path="/kitchen/recipes/:id"                 element={<RequireAuth><RecipeDetailPage /></RequireAuth>} />
      <Route path="/kitchen/recipes"                     element={<RequireAuth><RecipesPage /></RequireAuth>} />
      <Route path="/kitchen/dishes/new"                  element={<RequireAuth><DishCreatePage /></RequireAuth>} />
      <Route path="/kitchen/dishes/:id/versions/new"     element={<RequireAuth><DishVersionCreatePage /></RequireAuth>} />
      <Route path="/kitchen/dishes/:id"                  element={<RequireAuth><DishDetailPage /></RequireAuth>} />
      <Route path="/kitchen/dishes"                      element={<RequireAuth><DishesPage /></RequireAuth>} />
      <Route path="/kitchen/menus/new"            element={<RequireAuth><MenuBuilderPage /></RequireAuth>} />
      <Route path="/kitchen/menus/:id"            element={<RequireAuth><MenuDetailPage /></RequireAuth>} />
      <Route path="/kitchen/menus"                element={<RequireAuth><MenusPage /></RequireAuth>} />
      <Route path="/meetings" element={<RequireAuth><MeetingsPage /></RequireAuth>} />
      <Route path="/analytics" element={<RequireAuth><AnalyticsPage /></RequireAuth>} />
      <Route path="/admin/users/create-courier" element={<RequireAuth><CreateCourierPage /></RequireAuth>} />
      <Route path="/admin/users/:id" element={<RequireAuth><AdminUserDetailPage /></RequireAuth>} />
      <Route path="/admin/users" element={<RequireAuth><AdminUsersPage /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth><AdminDashboardPage /></RequireAuth>} />
      <Route path="/courier" element={<RequireAuth><CourierPage /></RequireAuth>} />

      {/* Default */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
