import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();

vi.mock("@/api/client", () => ({
  default: { get: mockGet },
}));

const { analyticsApi } = await import("@/api/analytics");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("analyticsApi.dashboard", () => {
  it("calls analytics/dashboard/", async () => {
    mockGet.mockResolvedValueOnce({ data: { metrics: {} } });
    await analyticsApi.dashboard();
    expect(mockGet).toHaveBeenCalledWith("analytics/dashboard/");
  });

  it("returns dashboard data", async () => {
    const dashboard = { metrics: { asset_count: [] } };
    mockGet.mockResolvedValueOnce({ data: dashboard });
    const result = await analyticsApi.dashboard();
    expect(result).toEqual(dashboard);
  });
});

describe("analyticsApi.exportCsv", () => {
  it("calls analytics/export/ with responseType blob", async () => {
    mockGet.mockResolvedValueOnce({ data: new Blob() });
    await analyticsApi.exportCsv();
    expect(mockGet).toHaveBeenCalledWith("analytics/export/", { responseType: "blob" });
  });
});
