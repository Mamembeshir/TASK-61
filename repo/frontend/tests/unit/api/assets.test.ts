import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/api/client", () => ({
  default: { get: mockGet, post: mockPost, put: mockPut, delete: mockDelete },
}));

const { assetsApi } = await import("@/api/assets");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assetsApi.listSites", () => {
  it("calls the tenants/sites/ endpoint", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await assetsApi.listSites();
    expect(mockGet).toHaveBeenCalledWith("tenants/sites/");
  });

  it("returns the data from the response", async () => {
    const sites = [{ id: "1", name: "Site A", timezone: "UTC" }];
    mockGet.mockResolvedValueOnce({ data: sites });
    const result = await assetsApi.listSites();
    expect(result).toEqual(sites);
  });
});

describe("assetsApi.listClassifications", () => {
  it("calls the asset-classifications/ endpoint", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await assetsApi.listClassifications();
    expect(mockGet).toHaveBeenCalledWith("asset-classifications/");
  });
});

describe("assetsApi.getAsset", () => {
  it("calls the correct URL with the asset id", async () => {
    const asset = { id: "abc123", asset_code: "A001", name: "Laptop" };
    mockGet.mockResolvedValueOnce({ data: asset });
    const result = await assetsApi.getAsset("abc123");
    expect(mockGet).toHaveBeenCalledWith("assets/abc123/");
    expect(result).toEqual(asset);
  });
});

describe("assetsApi.createAsset", () => {
  it("POSTs to assets/ with the payload", async () => {
    const payload = {
      asset_code: "A002",
      name: "Chair",
      site_id: "site-1",
      classification_id: "cls-1",
    };
    const created = { id: "new-id", ...payload };
    mockPost.mockResolvedValueOnce({ data: created });
    const result = await assetsApi.createAsset(payload);
    expect(mockPost).toHaveBeenCalledWith("assets/", payload);
    expect(result).toEqual(created);
  });
});

describe("assetsApi.updateAsset", () => {
  it("PUTs to the correct asset URL", async () => {
    const payload = { name: "Updated Chair", classification_id: "cls-2", version_number: 1 };
    mockPut.mockResolvedValueOnce({ data: { id: "a1", ...payload } });
    await assetsApi.updateAsset("a1", payload);
    expect(mockPut).toHaveBeenCalledWith("assets/a1/", payload);
  });
});

describe("assetsApi.deleteAsset", () => {
  it("DELETEs the correct asset URL", async () => {
    mockDelete.mockResolvedValueOnce({});
    await assetsApi.deleteAsset("a1");
    expect(mockDelete).toHaveBeenCalledWith("assets/a1/");
  });
});

describe("assetsApi.getTimeline", () => {
  it("calls the timeline endpoint for the given asset id", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await assetsApi.getTimeline("a1");
    expect(mockGet).toHaveBeenCalledWith("assets/a1/timeline/");
  });
});
