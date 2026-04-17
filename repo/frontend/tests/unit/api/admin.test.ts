import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();

vi.mock("@/api/client", () => ({
  default: { get: mockGet, post: mockPost, patch: mockPatch },
}));

const { adminApi } = await import("@/api/admin");

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

describe("adminApi.listUsers", () => {
  it("calls admin/users/ endpoint", async () => {
    mockGet.mockResolvedValueOnce({ data: [], pagination: undefined });
    await adminApi.listUsers();
    expect(mockGet).toHaveBeenCalledWith("admin/users/", expect.anything());
  });
});

describe("adminApi.getUser", () => {
  it("calls the correct user detail URL", async () => {
    mockGet.mockResolvedValueOnce({ data: { id: "u1", username: "alice" } });
    const result = await adminApi.getUser("u1");
    expect(mockGet).toHaveBeenCalledWith("admin/users/u1/");
    expect(result).toMatchObject({ id: "u1" });
  });
});

describe("adminApi.transition", () => {
  it("POSTs to the transition endpoint with status and reason", async () => {
    mockPost.mockResolvedValueOnce({ data: { id: "u1", status: "SUSPENDED" } });
    await adminApi.transition("u1", "SUSPENDED", "Policy violation detected.");
    expect(mockPost).toHaveBeenCalledWith("admin/users/u1/transition/", {
      new_status: "SUSPENDED",
      reason: "Policy violation detected.",
    });
  });
});

describe("adminApi.reviewPhoto", () => {
  it("POSTs the photo review decision", async () => {
    mockPost.mockResolvedValueOnce({ data: { id: "u1" } });
    await adminApi.reviewPhoto("u1", "APPROVED");
    expect(mockPost).toHaveBeenCalledWith("admin/users/u1/review-photo/", {
      decision: "APPROVED",
    });
  });
});

describe("adminApi.assignRole", () => {
  it("POSTs role and site assignments", async () => {
    mockPost.mockResolvedValueOnce({ data: { id: "u1", role: "COURIER" } });
    await adminApi.assignRole("u1", "COURIER", ["site-1"]);
    expect(mockPost).toHaveBeenCalledWith("admin/users/u1/assign-role/", {
      role: "COURIER",
      site_ids: ["site-1"],
    });
  });
});

describe("adminApi.unlock", () => {
  it("POSTs to the unlock endpoint", async () => {
    mockPost.mockResolvedValueOnce({});
    await adminApi.unlock("u1");
    expect(mockPost).toHaveBeenCalledWith("admin/users/u1/unlock/");
  });
});

describe("adminApi.createCourier", () => {
  it("POSTs courier creation payload", async () => {
    const payload = {
      username: "new.courier",
      password: "Pass@1234",
      legal_first_name: "Fast",
      legal_last_name: "Driver",
      employee_student_id: "COR-001",
      site_ids: ["site-1"],
    };
    mockPost.mockResolvedValueOnce({ data: { id: "u2", role: "COURIER" } });
    await adminApi.createCourier(payload);
    expect(mockPost).toHaveBeenCalledWith("admin/users/create-courier/", payload);
  });
});

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

describe("adminApi.listSites", () => {
  it("calls admin/sites/", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await adminApi.listSites();
    expect(mockGet).toHaveBeenCalledWith("admin/sites/");
  });
});

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------

describe("adminApi.listTenants", () => {
  it("calls admin/tenants/", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await adminApi.listTenants();
    expect(mockGet).toHaveBeenCalledWith("admin/tenants/");
  });
});

describe("adminApi.createTenant", () => {
  it("POSTs tenant creation payload", async () => {
    const payload = { name: "Ocean University", slug: "ocean-university" };
    mockPost.mockResolvedValueOnce({ data: { id: "t1", ...payload } });
    await adminApi.createTenant(payload);
    expect(mockPost).toHaveBeenCalledWith("admin/tenants/", payload);
  });
});

describe("adminApi.getTenant", () => {
  it("calls the correct tenant detail URL", async () => {
    mockGet.mockResolvedValueOnce({ data: { id: "t1" } });
    await adminApi.getTenant("t1");
    expect(mockGet).toHaveBeenCalledWith("admin/tenants/t1/");
  });
});

describe("adminApi.updateTenant", () => {
  it("PATCHes the tenant", async () => {
    mockPatch.mockResolvedValueOnce({ data: { id: "t1", name: "Updated" } });
    await adminApi.updateTenant("t1", { name: "Updated" });
    expect(mockPatch).toHaveBeenCalledWith("admin/tenants/t1/", { name: "Updated" });
  });
});

describe("adminApi.listTenantSites", () => {
  it("calls the tenant sites URL", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await adminApi.listTenantSites("t1");
    expect(mockGet).toHaveBeenCalledWith("admin/tenants/t1/sites/");
  });
});

describe("adminApi.createTenantSite", () => {
  it("POSTs site creation under tenant", async () => {
    const payload = { name: "West Campus", timezone: "America/Chicago" };
    mockPost.mockResolvedValueOnce({ data: { id: "s1", ...payload } });
    await adminApi.createTenantSite("t1", payload);
    expect(mockPost).toHaveBeenCalledWith("admin/tenants/t1/sites/", payload);
  });
});
