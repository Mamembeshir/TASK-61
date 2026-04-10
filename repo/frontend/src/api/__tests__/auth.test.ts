import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the apiClient before importing authApi
const mockPost = vi.fn();
const mockGet = vi.fn();

vi.mock("../client", () => ({
  default: { post: mockPost, get: mockGet },
}));

// Import after mock is in place
const { authApi } = await import("../auth");

const fakeProfile = {
  id: "1",
  username: "alice",
  role: "STAFF",
  status: "ACTIVE",
  tenant_slug: "acme",
  legal_first_name: "Alice",
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe("authApi.login", () => {
  it("stores token in sessionStorage and returns mapped user", async () => {
    mockPost.mockResolvedValueOnce({
      data: { token: "tok123", profile: fakeProfile },
    });

    const user = await authApi.login("alice", "pass");

    expect(mockPost).toHaveBeenCalledWith("auth/login/", { username: "alice", password: "pass" });
    expect(sessionStorage.getItem("auth_token")).toBe("tok123");
    expect(user).toEqual({
      id: "1",
      username: "alice",
      role: "STAFF",
      status: "ACTIVE",
      tenantId: "acme",
      legalFirstName: "Alice",
      isSuperuser: false,
    });
  });

  it("does not set sessionStorage when response has no token", async () => {
    mockPost.mockResolvedValueOnce({ data: { profile: fakeProfile } });
    await authApi.login("alice", "pass");
    expect(sessionStorage.getItem("auth_token")).toBeNull();
  });

  it("propagates API errors", async () => {
    mockPost.mockRejectedValueOnce(new Error("Network error"));
    await expect(authApi.login("alice", "bad")).rejects.toThrow("Network error");
  });
});

describe("authApi.logout", () => {
  it("calls logout endpoint and clears token", async () => {
    sessionStorage.setItem("auth_token", "tok");
    mockPost.mockResolvedValueOnce({});

    await authApi.logout();

    expect(mockPost).toHaveBeenCalledWith("auth/logout/");
    expect(sessionStorage.getItem("auth_token")).toBeNull();
  });
});

describe("authApi.me", () => {
  it("maps API response to CurrentUser", async () => {
    mockGet.mockResolvedValueOnce({ data: fakeProfile });

    const user = await authApi.me();

    expect(mockGet).toHaveBeenCalledWith("auth/me/");
    expect(user).toEqual({
      id: "1",
      username: "alice",
      role: "STAFF",
      status: "ACTIVE",
      tenantId: "acme",
      legalFirstName: "Alice",
      isSuperuser: false,
    });
  });

  it("sets tenantId and legalFirstName to null when missing", async () => {
    mockGet.mockResolvedValueOnce({
      data: { id: "2", username: "bob", role: "COURIER", status: "PENDING_REVIEW" },
    });

    const user = await authApi.me();
    expect(user.tenantId).toBeNull();
    expect(user.legalFirstName).toBeNull();
  });
});

describe("authApi.register", () => {
  it("submits FormData with all required fields", async () => {
    mockPost.mockResolvedValueOnce({});

    await authApi.register({
      username: "alice",
      password: "pass",
      legalFirstName: "Alice",
      legalLastName: "Smith",
      employeeStudentId: "E001",
      tenantSlug: "acme",
    });

    expect(mockPost).toHaveBeenCalledOnce();
    const [url, body, opts] = mockPost.mock.calls[0];
    expect(url).toBe("auth/register/");
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("username")).toBe("alice");
    expect((body as FormData).get("tenant_slug")).toBe("acme");
    expect(opts.headers["Content-Type"]).toBe("multipart/form-data");
  });

  it("appends optional government_id and photo_id when provided", async () => {
    mockPost.mockResolvedValueOnce({});
    const file = new File(["img"], "id.png", { type: "image/png" });

    await authApi.register({
      username: "alice",
      password: "pass",
      legalFirstName: "Alice",
      legalLastName: "Smith",
      employeeStudentId: "E001",
      tenantSlug: "acme",
      governmentId: "GOV123",
      photoId: file,
    });

    const body = mockPost.mock.calls[0][1] as FormData;
    expect(body.get("government_id")).toBe("GOV123");
    expect(body.get("photo_id")).toBe(file);
  });

  it("omits government_id and photo_id when not provided", async () => {
    mockPost.mockResolvedValueOnce({});

    await authApi.register({
      username: "alice",
      password: "pass",
      legalFirstName: "Alice",
      legalLastName: "Smith",
      employeeStudentId: "E001",
      tenantSlug: "acme",
    });

    const body = mockPost.mock.calls[0][1] as FormData;
    expect(body.get("government_id")).toBeNull();
    expect(body.get("photo_id")).toBeNull();
  });
});
