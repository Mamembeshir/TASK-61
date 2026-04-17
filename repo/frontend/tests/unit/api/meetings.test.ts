import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/api/client", () => ({
  default: { get: mockGet, post: mockPost, patch: mockPatch, delete: mockDelete },
}));

const { meetingApi } = await import("@/api/meetings");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("meetingApi.list", () => {
  it("calls meetings/meetings/ with no params", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await meetingApi.list();
    expect(mockGet).toHaveBeenCalledWith("meetings/meetings/", { params: undefined });
  });

  it("passes status and site_id filter params", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await meetingApi.list({ status: "DRAFT", site_id: "site-1" });
    expect(mockGet).toHaveBeenCalledWith("meetings/meetings/", {
      params: { status: "DRAFT", site_id: "site-1" },
    });
  });
});

describe("meetingApi.get", () => {
  it("calls the correct meeting detail URL", async () => {
    mockGet.mockResolvedValueOnce({ data: { id: "m1" } });
    const result = await meetingApi.get("m1");
    expect(mockGet).toHaveBeenCalledWith("meetings/meetings/m1/");
    expect(result).toMatchObject({ id: "m1" });
  });
});

describe("meetingApi.create", () => {
  it("POSTs to meetings/meetings/ with the payload", async () => {
    const payload = { title: "Q3 Review", scheduled_at: "2026-07-01T10:00:00Z" };
    mockPost.mockResolvedValueOnce({ data: { id: "m2", ...payload, status: "DRAFT" } });
    const result = await meetingApi.create(payload);
    expect(mockPost).toHaveBeenCalledWith("meetings/meetings/", payload);
    expect(result).toMatchObject({ status: "DRAFT" });
  });
});

describe("meetingApi.update", () => {
  it("PATCHes the meeting with partial data", async () => {
    mockPatch.mockResolvedValueOnce({ data: { id: "m1", title: "Updated" } });
    await meetingApi.update("m1", { title: "Updated" });
    expect(mockPatch).toHaveBeenCalledWith("meetings/meetings/m1/", { title: "Updated" });
  });
});

describe("meetingApi.schedule", () => {
  it("POSTs to the schedule endpoint", async () => {
    mockPost.mockResolvedValueOnce({ data: { id: "m1", status: "SCHEDULED" } });
    const result = await meetingApi.schedule("m1");
    expect(mockPost).toHaveBeenCalledWith("meetings/meetings/m1/schedule/");
    expect(result).toMatchObject({ status: "SCHEDULED" });
  });
});

describe("meetingApi.start", () => {
  it("POSTs to the start endpoint", async () => {
    mockPost.mockResolvedValueOnce({ data: { id: "m1", status: "IN_PROGRESS" } });
    await meetingApi.start("m1");
    expect(mockPost).toHaveBeenCalledWith("meetings/meetings/m1/start/");
  });
});

describe("meetingApi.complete", () => {
  it("POSTs to the complete endpoint", async () => {
    mockPost.mockResolvedValueOnce({ data: { id: "m1", status: "COMPLETED" } });
    await meetingApi.complete("m1");
    expect(mockPost).toHaveBeenCalledWith("meetings/meetings/m1/complete/");
  });
});

describe("meetingApi.cancel", () => {
  it("POSTs to the cancel endpoint", async () => {
    mockPost.mockResolvedValueOnce({ data: { id: "m1", status: "CANCELLED" } });
    await meetingApi.cancel("m1");
    expect(mockPost).toHaveBeenCalledWith("meetings/meetings/m1/cancel/");
  });
});

describe("meetingApi.agenda.list", () => {
  it("GETs the agenda for a meeting", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await meetingApi.agenda.list("m1");
    expect(mockGet).toHaveBeenCalledWith("meetings/meetings/m1/agenda/");
  });
});

describe("meetingApi.agenda.create", () => {
  it("POSTs FormData to the agenda endpoint", async () => {
    const formData = new FormData();
    formData.append("title", "Agenda Item 1");
    mockPost.mockResolvedValueOnce({ data: { id: "ag1", title: "Agenda Item 1" } });
    await meetingApi.agenda.create("m1", formData);
    expect(mockPost).toHaveBeenCalledWith(
      "meetings/meetings/m1/agenda/",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
  });
});

describe("meetingApi.agenda.update", () => {
  it("PATCHes the agenda item", async () => {
    mockPatch.mockResolvedValueOnce({ data: { id: "ag1", title: "Updated" } });
    await meetingApi.agenda.update("m1", "ag1", { title: "Updated" });
    expect(mockPatch).toHaveBeenCalledWith(
      "meetings/meetings/m1/agenda/ag1/",
      { title: "Updated" }
    );
  });
});

describe("meetingApi.agenda.delete", () => {
  it("DELETEs the agenda item", async () => {
    mockDelete.mockResolvedValueOnce({});
    await meetingApi.agenda.delete("m1", "ag1");
    expect(mockDelete).toHaveBeenCalledWith("meetings/meetings/m1/agenda/ag1/");
  });
});

describe("meetingApi.attendance.list", () => {
  it("GETs the attendance list", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await meetingApi.attendance.list("m1");
    expect(mockGet).toHaveBeenCalledWith("meetings/meetings/m1/attendance/");
  });
});
