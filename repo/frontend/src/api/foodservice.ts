/**
 * Foodservice API client — recipes, dishes, menus.
 */
import apiClient from "@/api/client";

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------
export interface Allergen {
  id: string;
  code: string;
  name: string;
}

export type RecipeStatus = "DRAFT" | "ACTIVE" | "SUPERSEDED" | "ARCHIVED";
export type DishStatus   = "DRAFT" | "ACTIVE" | "SUPERSEDED" | "ARCHIVED";
export type MenuStatus   = "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED";

export const UNIT_LABELS: Record<string, string> = {
  oz:    "oz (Ounce)",
  lb:    "lb (Pound)",
  cup:   "Cup",
  tbsp:  "Tablespoon",
  tsp:   "Teaspoon",
  fl_oz: "fl oz (Fluid Ounce)",
  gal:   "Gallon",
  qt:    "Quart",
  pt:    "Pint",
  each:  "Each",
  pinch: "Pinch",
};

// ---------------------------------------------------------------------------
// Recipe
// ---------------------------------------------------------------------------
export interface RecipeIngredient {
  id: string;
  ingredient_name: string;
  quantity: string;
  unit: string;
  unit_cost: string;
  sort_order: number;
}

export interface RecipeStep {
  id: string;
  step_number: number;
  instruction: string;
}

export interface RecipeVersion {
  id: string;
  version_number: number;
  effective_from: string;
  effective_to: string | null;
  status: RecipeStatus;
  servings: string;
  per_serving_cost: string;
  created_by_id: string;
  created_at: string;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
}

export interface RecipeListItem {
  id: string;
  name: string;
  active_version_number: number | null;
  effective_from: string | null;
  per_serving_cost: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecipeDetail extends RecipeListItem {
  active_version: RecipeVersion | null;
}

// ---------------------------------------------------------------------------
// Dish
// ---------------------------------------------------------------------------
export interface DishPortionSpec {
  id: string;
  portion_label: string;
  serving_size_qty: string;
  serving_size_unit: string;
  price_multiplier: string;
}

export interface DishAddon {
  id: string;
  addon_name: string;
  additional_cost: string;
  allergens: { id: string; code: string; name: string }[];
}

export interface DishVersionRead {
  id: string;
  version_number: number;
  name: string;
  description: string;
  effective_from: string;
  effective_to: string | null;
  status: DishStatus;
  calories: string | null;
  protein_g: string | null;
  carbs_g: string | null;
  fat_g: string | null;
  has_nutrition: boolean;
  per_serving_cost: string;
  created_by_id: string;
  created_at: string;
  allergens: { id: string; code: string; name: string }[];
  portions: DishPortionSpec[];
  addons: DishAddon[];
}

export interface DishListItem {
  id: string;
  name: string | null;
  per_serving_cost: string | null;
  allergen_names: string[];
  has_nutrition: boolean;
  created_at: string;
}

export interface DishDetail extends DishListItem {
  recipe_id: string | null;
  active_version: DishVersionRead | null;
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
export interface MenuGroupItemRead {
  id: string;
  dish_version_id: string;
  dish_name: string;
  sort_order: number;
}

export interface MenuGroupRead {
  id: string;
  name: string;
  sort_order: number;
  availability_start: string | null;
  availability_end: string | null;
  items: MenuGroupItemRead[];
}

export interface MenuVersionRead {
  id: string;
  version_number: number;
  status: MenuStatus;
  description: string;
  created_by_id: string;
  created_at: string;
  groups: MenuGroupRead[];
  site_releases: { site_id: string; released_at: string }[];
}

export interface MenuListItem {
  id: string;
  name: string;
  published_version_number: number | null;
  created_at: string;
  updated_at: string;
}

export interface MenuDetail extends MenuListItem {
  versions: MenuVersionRead[];
}

// ---------------------------------------------------------------------------
// Site (needed for publish modal)
// ---------------------------------------------------------------------------
export interface FoodSite {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

// ── Allergens ──────────────────────────────────────────────────────────────
export const allergenApi = {
  list: (): Promise<Allergen[]> =>
    apiClient.get("foodservice/allergens/").then((r) => r.data),
};

// ── Recipes ────────────────────────────────────────────────────────────────
export const recipeApi = {
  list: (params?: { search?: string }): Promise<RecipeListItem[]> =>
    apiClient.get("foodservice/recipes/", { params }).then((r) => r.data),

  get: (id: string): Promise<RecipeDetail> =>
    apiClient.get(`foodservice/recipes/${id}/`).then((r) => r.data),

  create: (payload: {
    name: string;
    effective_from: string;
    servings: number;
    ingredients: { ingredient_name: string; quantity: number; unit: string; unit_cost: number; sort_order: number }[];
    steps: { step_number: number; instruction: string }[];
  }): Promise<RecipeDetail> =>
    apiClient.post("foodservice/recipes/", payload).then((r) => r.data),

  versions: {
    list: (recipeId: string): Promise<RecipeVersion[]> =>
      apiClient.get(`foodservice/recipes/${recipeId}/versions/`).then((r) => r.data),

    create: (
      recipeId: string,
      payload: {
        effective_from: string;
        servings: number;
        ingredients: { ingredient_name: string; quantity: number; unit: string; unit_cost: number; sort_order: number }[];
        steps: { step_number: number; instruction: string }[];
      }
    ): Promise<RecipeVersion> =>
      apiClient.post(`foodservice/recipes/${recipeId}/versions/`, payload).then((r) => r.data),

    get: (recipeId: string, versionId: string): Promise<RecipeVersion> =>
      apiClient.get(`foodservice/recipes/${recipeId}/versions/${versionId}/`).then((r) => r.data),

    activate: (recipeId: string, versionId: string): Promise<RecipeVersion> =>
      apiClient.post(`foodservice/recipes/${recipeId}/versions/${versionId}/activate/`).then((r) => r.data),

    archive: (recipeId: string, versionId: string): Promise<RecipeVersion> =>
      apiClient.post(`foodservice/recipes/${recipeId}/versions/${versionId}/archive/`).then((r) => r.data),

    delete: (recipeId: string, versionId: string): Promise<void> =>
      apiClient.delete(`foodservice/recipes/${recipeId}/versions/${versionId}/`).then(() => undefined),
  },
};

// ── Dishes ─────────────────────────────────────────────────────────────────
export const dishApi = {
  list: (params?: {
    allergen_include?: string;
    allergen_exclude?: string;
    search?: string;
  }): Promise<DishListItem[]> =>
    apiClient.get("foodservice/dishes/", { params }).then((r) => r.data),

  get: (id: string): Promise<DishDetail> =>
    apiClient.get(`foodservice/dishes/${id}/`).then((r) => r.data),

  create: (payload: object): Promise<DishDetail> =>
    apiClient.post("foodservice/dishes/", payload).then((r) => r.data),

  versions: {
    list: (dishId: string): Promise<DishVersionRead[]> =>
      apiClient.get(`foodservice/dishes/${dishId}/versions/`).then((r) => r.data),

    create: (dishId: string, payload: object): Promise<DishVersionRead> =>
      apiClient.post(`foodservice/dishes/${dishId}/versions/`, payload).then((r) => r.data),

    activate: (dishId: string, versionId: string): Promise<DishVersionRead> =>
      apiClient.post(`foodservice/dishes/${dishId}/versions/${versionId}/activate/`).then((r) => r.data),
  },
};

// ── Menus ──────────────────────────────────────────────────────────────────
export const menuApi = {
  list: (): Promise<MenuListItem[]> =>
    apiClient.get("foodservice/menus/").then((r) => r.data),

  get: (id: string): Promise<MenuDetail> =>
    apiClient.get(`foodservice/menus/${id}/`).then((r) => r.data),

  create: (payload: {
    name: string;
    description?: string;
    groups?: object[];
  }): Promise<MenuDetail> =>
    apiClient.post("foodservice/menus/", payload).then((r) => r.data),

  versions: {
    list: (menuId: string): Promise<MenuVersionRead[]> =>
      apiClient.get(`foodservice/menus/${menuId}/versions/`).then((r) => r.data),

    create: (menuId: string, payload: { description?: string; groups?: object[] }): Promise<MenuVersionRead> =>
      apiClient.post(`foodservice/menus/${menuId}/versions/`, payload).then((r) => r.data),

    publish: (menuId: string, versionId: string, siteIds: string[]): Promise<MenuVersionRead> =>
      apiClient.post(`foodservice/menus/${menuId}/versions/${versionId}/publish/`, { site_ids: siteIds }).then((r) => r.data),

    unpublish: (menuId: string, versionId: string): Promise<MenuVersionRead> =>
      apiClient.post(`foodservice/menus/${menuId}/versions/${versionId}/unpublish/`).then((r) => r.data),

    archive: (menuId: string, versionId: string): Promise<MenuVersionRead> =>
      apiClient.post(`foodservice/menus/${menuId}/versions/${versionId}/archive/`).then((r) => r.data),
  },

  activeForSite: (siteId: string): Promise<MenuVersionRead[]> =>
    apiClient.get(`foodservice/sites/${siteId}/active-menus/`).then((r) => r.data),
};

// ── Sites (for publish modal) ──────────────────────────────────────────────
export const foodSiteApi = {
  list: (): Promise<FoodSite[]> =>
    apiClient.get("tenants/sites/").then((r) => r.data),
};
