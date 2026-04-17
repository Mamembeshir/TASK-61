import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/api/client", () => ({
  default: { get: mockGet, post: mockPost, patch: mockPatch, delete: mockDelete },
}));

const { integrationsApi } = await import("@/api/integrations");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("integrationsApi.alerts.list", () => {
  it("calls integrations/alerts/ with no params", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await integrationsApi.alerts.list();
    expect(mockGet).toHaveBeenCalledWith("integrations/alerts/", { params: undefined });
  });

  it("passes status and severity filter params", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await integrationsApi.alerts.list({ status: "OPEN", severity: "CRITICAL" });
    expect(mockGet).toHaveBeenCalledWith("integrations/alerts/", {
      params: { status: "OPEN", severity: "CRITICAL" },
    });
  });

  it("returns the response data", async () => {
    const alerts = [{ id: "1", status: "OPEN", severity: "WARNING" }];
    mockGet.mockResolvedValueOnce({ data: alerts });
    const result = await integrationsApi.alerts.list();
    expect(result).toEqual(alerts);
  });
});

describe("integrationsApi.alerts.get", () => {
  it("calls the correct alert detail URL", async () => {
    mockGet.mockResolvedValueOnce({ data: { id: "a1" } });
    await integrationsApi.alerts.get("a1");
    expect(mockGet).toHaveBeenCalledWith("integrations/alerts/a1/");
  });
});

describe("integrationsApi.alerts.acknowledge", () => {
  it("POSTs to the acknowledge endpoint", async () => {
    mockPost.mockResolvedValueOnce({ data: { id: "a1", status: "ACKNOWLEDGED" } });
    const result = await integrationsApi.alerts.acknowledge("a1");
    expect(mockPost).toHaveBeenCalledWith("integrations/alerts/a1/acknowledge/");
    expect(result).toMatchObject({ status: "ACKNOWLEDGED" });
  });
});

describe("integrationsApi.alerts.assign", () => {
  it("POSTs the assigned_to payload", async () => {
    mockPost.mockResolvedValueOnce({ data: { id: "a1", status: "ASSIGNED" } });
    await integrationsApi.alerts.assign("a1", "user-123");
    expect(mockPost).toHaveBeenCalledWith("integrations/alerts/a1/assign/", {
      assigned_to: "user-123",
    });
  });
});

describe("integrationsApi.alerts.close", () => {
  it("POSTs the resolution_note payload", async () => {
    mockPost.mockResolvedValueOnce({ data: { id: "a1", status: "CLOSED" } });
    await integrationsApi.alerts.close("a1", "Issue fully resolved after investigation.");
    expect(mockPost).toHaveBeenCalledWith("integrations/alerts/a1/close/", {
      resolution_note: "Issue fully resolved after investigation.",
    });
  });
});

describe("integrationsApi.webhooks.list", () => {
  it("calls integrations/webhooks/", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await integrationsApi.webhooks.list();
    expect(mockGet).toHaveBeenCalledWith("integrations/webhooks/");
  });
});

describe("integrationsApi.webhooks.create", () => {
  it("POSTs webhook creation payload", async () => {
    const payload = {
      url: "http://10.0.0.1/hook",
      secret: "secret123",
      events: ["alert.created"],
      is_active: true,
    };
    mockPost.mockResolvedValueOnce({ data: { id: "wh-1", ...payload } });
    await integrationsApi.webhooks.create(payload);
    expect(mockPost).toHaveBeenCalledWith("integrations/webhooks/", payload);
  });
});

describe("integrationsApi.webhooks.get", () => {
  it("calls the correct webhook detail URL", async () => {
    mockGet.mockResolvedValueOnce({ data: { id: "wh-1" } });
    await integrationsApi.webhooks.get("wh-1");
    expect(mockGet).toHaveBeenCalledWith("integrations/webhooks/wh-1/");
  });
});

describe("integrationsApi.webhooks.update", () => {
  it("PATCHes the webhook with partial data", async () => {
    mockPatch.mockResolvedValueOnce({ data: { id: "wh-1", is_active: false } });
    await integrationsApi.webhooks.update("wh-1", { is_active: false });
    expect(mockPatch).toHaveBeenCalledWith("integrations/webhooks/wh-1/", { is_active: false });
  });
});

describe("integrationsApi.webhooks.delete", () => {
  it("DELETEs the correct webhook URL", async () => {
    mockDelete.mockResolvedValueOnce({});
    await integrationsApi.webhooks.delete("wh-1");
    expect(mockDelete).toHaveBeenCalledWith("integrations/webhooks/wh-1/");
  });
});

describe("integrationsApi.webhooks.deliveries", () => {
  it("calls the deliveries endpoint for the given webhook id", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await integrationsApi.webhooks.deliveries("wh-1");
    expect(mockGet).toHaveBeenCalledWith("integrations/webhooks/wh-1/deliveries/");
  });
});
