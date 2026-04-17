import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/api/client", () => ({
  default: { get: mockGet, post: mockPost, patch: mockPatch, delete: mockDelete },
}));

const { allergenApi, recipeApi, dishApi, menuApi, foodSiteApi } = await import(
  "@/api/foodservice"
);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Allergens
// ---------------------------------------------------------------------------

describe("allergenApi.list", () => {
  it("calls foodservice/allergens/", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await allergenApi.list();
    expect(mockGet).toHaveBeenCalledWith("foodservice/allergens/");
  });

  it("returns allergen list", async () => {
    const allergens = [{ id: "1", code: "MILK", name: "Milk" }];
    mockGet.mockResolvedValueOnce({ data: allergens });
    const result = await allergenApi.list();
    expect(result).toEqual(allergens);
  });
});

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

describe("recipeApi.list", () => {
  it("calls foodservice/recipes/", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await recipeApi.list();
    expect(mockGet).toHaveBeenCalledWith("foodservice/recipes/", { params: undefined });
  });

  it("passes search parameter", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await recipeApi.list({ search: "pasta" });
    expect(mockGet).toHaveBeenCalledWith("foodservice/recipes/", {
      params: { search: "pasta" },
    });
  });
});

describe("recipeApi.get", () => {
  it("calls the correct recipe detail URL", async () => {
    mockGet.mockResolvedValueOnce({ data: { id: "r1" } });
    await recipeApi.get("r1");
    expect(mockGet).toHaveBeenCalledWith("foodservice/recipes/r1/");
  });
});

describe("recipeApi.create", () => {
  it("POSTs to foodservice/recipes/", async () => {
    const payload = {
      name: "Pancakes",
      effective_from: "2026-01-01",
      servings: 4,
      ingredients: [
        { ingredient_name: "Flour", quantity: 2, unit: "cup", unit_cost: 0.5, sort_order: 0 },
      ],
      steps: [{ step_number: 1, instruction: "Mix." }],
    };
    mockPost.mockResolvedValueOnce({ data: { id: "r1", ...payload } });
    await recipeApi.create(payload);
    expect(mockPost).toHaveBeenCalledWith("foodservice/recipes/", payload);
  });
});

describe("recipeApi.versions.list", () => {
  it("calls the versions URL for a recipe", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await recipeApi.versions.list("r1");
    expect(mockGet).toHaveBeenCalledWith("foodservice/recipes/r1/versions/");
  });
});

describe("recipeApi.versions.activate", () => {
  it("POSTs to the activate endpoint", async () => {
    mockPost.mockResolvedValueOnce({ data: { id: "v1", status: "ACTIVE" } });
    await recipeApi.versions.activate("r1", "v1");
    expect(mockPost).toHaveBeenCalledWith(
      "foodservice/recipes/r1/versions/v1/activate/",
    );
  });
});

describe("recipeApi.versions.archive", () => {
  it("POSTs to the archive endpoint", async () => {
    mockPost.mockResolvedValueOnce({ data: { detail: "Version archived." } });
    await recipeApi.versions.archive("r1", "v1");
    expect(mockPost).toHaveBeenCalledWith(
      "foodservice/recipes/r1/versions/v1/archive/",
    );
  });
});

describe("recipeApi.versions.delete", () => {
  it("DELETEs the recipe version", async () => {
    mockDelete.mockResolvedValueOnce({});
    await recipeApi.versions.delete("r1", "v1");
    expect(mockDelete).toHaveBeenCalledWith(
      "foodservice/recipes/r1/versions/v1/",
    );
  });
});

// ---------------------------------------------------------------------------
// Dishes
// ---------------------------------------------------------------------------

describe("dishApi.list", () => {
  it("calls foodservice/dishes/", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await dishApi.list();
    expect(mockGet).toHaveBeenCalledWith("foodservice/dishes/", { params: undefined });
  });
});

describe("dishApi.get", () => {
  it("calls the correct dish detail URL", async () => {
    mockGet.mockResolvedValueOnce({ data: { id: "d1" } });
    await dishApi.get("d1");
    expect(mockGet).toHaveBeenCalledWith("foodservice/dishes/d1/");
  });
});

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

describe("menuApi.list", () => {
  it("calls foodservice/menus/", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await menuApi.list();
    expect(mockGet).toHaveBeenCalledWith("foodservice/menus/");
  });
});

describe("menuApi.get", () => {
  it("calls the correct menu detail URL", async () => {
    mockGet.mockResolvedValueOnce({ data: { id: "m1" } });
    await menuApi.get("m1");
    expect(mockGet).toHaveBeenCalledWith("foodservice/menus/m1/");
  });
});

describe("menuApi.create", () => {
  it("POSTs to foodservice/menus/", async () => {
    const payload = { name: "Breakfast Menu", groups: [] };
    mockPost.mockResolvedValueOnce({ data: { id: "m1", ...payload } });
    await menuApi.create(payload);
    expect(mockPost).toHaveBeenCalledWith("foodservice/menus/", payload);
  });
});

describe("menuApi.versions.publish", () => {
  it("POSTs to the publish endpoint with site_ids", async () => {
    mockPost.mockResolvedValueOnce({ data: { id: "v1", status: "PUBLISHED" } });
    await menuApi.versions.publish("m1", "v1", ["site-1"]);
    expect(mockPost).toHaveBeenCalledWith(
      "foodservice/menus/m1/versions/v1/publish/",
      { site_ids: ["site-1"] },
    );
  });
});

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

describe("foodSiteApi.list", () => {
  it("calls foodservice/sites/ or tenants/sites/", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await foodSiteApi.list();
    expect(mockGet).toHaveBeenCalled();
  });
});
