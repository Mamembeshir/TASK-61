import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock("@/api/client", () => ({
  default: { get: mockGet, post: mockPost },
}));

const { courierApi } = await import("@/api/courier");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("courierApi.listTasks", () => {
  it("calls courier/tasks/", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await courierApi.listTasks();
    expect(mockGet).toHaveBeenCalledWith("courier/tasks/");
  });

  it("returns the task list", async () => {
    const tasks = [
      {
        id: "t1",
        title: "Deliver supplies",
        status: "TODO",
        due_date: "2026-05-01",
        delivery_type: "DROP",
        delivery_type_display: "Drop-off",
        pickup_location: null,
        drop_location: "Building A",
        confirmed_at: null,
        created_at: "2026-04-01T10:00:00Z",
      },
    ];
    mockGet.mockResolvedValueOnce({ data: tasks });
    const result = await courierApi.listTasks();
    expect(result).toEqual(tasks);
  });
});

describe("courierApi.confirmTask", () => {
  it("POSTs to the confirm endpoint for the given task id", async () => {
    const confirmed = { id: "t1", confirmed_at: "2026-04-17T09:00:00Z" };
    mockPost.mockResolvedValueOnce({ data: confirmed });
    const result = await courierApi.confirmTask("t1");
    expect(mockPost).toHaveBeenCalledWith("courier/tasks/t1/confirm/");
    expect(result).toEqual(confirmed);
  });
});
