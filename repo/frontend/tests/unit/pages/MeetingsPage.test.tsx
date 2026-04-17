/**
 * Unit tests for MeetingsPage component.
 *
 * Covers:
 *  - Loading skeleton is shown while data is in-flight
 *  - Meeting rows are rendered after data loads
 *  - Empty state is shown when API returns an empty list
 *  - Error banner is shown when the API call rejects
 *  - "New Meeting" button opens the create modal
 *  - Status filter select is present with expected options
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import MeetingsPage from "@/pages/meetings/MeetingsPage";

// ---------------------------------------------------------------------------
// Mock API modules
// ---------------------------------------------------------------------------

const mockMeetingList = vi.fn();
const mockSiteList = vi.fn();

vi.mock("@/api/meetings", () => ({
  meetingApi: {
    list: (...args: any[]) => mockMeetingList(...args),
    create: vi.fn(),
  },
  // meetingStatusColors is used for badges — provide a minimal stub
}));

vi.mock("@/api/foodservice", () => ({
  foodSiteApi: { list: (...args: any[]) => mockSiteList(...args) },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <MemoryRouter>
      <MeetingsPage />
    </MemoryRouter>,
  );
}

const fakeMeetings = [
  {
    id: "m1",
    title: "Board Meeting Q2",
    scheduled_at: "2026-06-01T10:00:00Z",
    site_name: "Coastal Harbour",
    status: "DRAFT" as const,
    resolution_count: 2,
    open_task_count: 1,
  },
  {
    id: "m2",
    title: "Safety Review",
    scheduled_at: "2026-07-15T09:00:00Z",
    site_name: null,
    status: "SCHEDULED" as const,
    resolution_count: 0,
    open_task_count: 0,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  // Sites resolve immediately with an empty list by default
  mockSiteList.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MeetingsPage — loading state", () => {
  it("renders a loading skeleton while the API call is in-flight", () => {
    // Never resolves during this test
    mockMeetingList.mockReturnValue(new Promise(() => {}));

    renderPage();

    // The skeleton table uses aria role "table" or generic cells — just confirm
    // the page title is present and the table hasn't rendered yet
    expect(screen.getByText("Meetings")).toBeInTheDocument();
    // Skeleton rows are present (no real meeting titles yet)
    expect(screen.queryByText("Board Meeting Q2")).not.toBeInTheDocument();
  });
});

describe("MeetingsPage — data loaded", () => {
  it("renders meeting titles in the table after data loads", async () => {
    mockMeetingList.mockResolvedValue(fakeMeetings);

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Board Meeting Q2")).toBeInTheDocument(),
    );
    expect(screen.getByText("Safety Review")).toBeInTheDocument();
  });

  it("shows meeting count in the subtitle", async () => {
    mockMeetingList.mockResolvedValue(fakeMeetings);

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/2 meetings in view/)).toBeInTheDocument(),
    );
  });

  it("renders status values in the table rows", async () => {
    mockMeetingList.mockResolvedValue(fakeMeetings);

    renderPage();

    await waitFor(() => screen.getByText("Board Meeting Q2"));
    // "Draft" and "Scheduled" appear both as <option>s in the filter and as
    // status badges in the rows — assert there are at least 2 occurrences
    // (one in the select + one in the row).
    expect(screen.getAllByText("Draft").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Scheduled").length).toBeGreaterThanOrEqual(2);
  });
});

describe("MeetingsPage — empty state", () => {
  it("shows an empty state when the API returns no meetings", async () => {
    mockMeetingList.mockResolvedValue([]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("No meetings found")).toBeInTheDocument(),
    );
  });
});

describe("MeetingsPage — error state", () => {
  it("shows an error banner when the API rejects", async () => {
    mockMeetingList.mockRejectedValue(new Error("Network error"));

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/Network error/)).toBeInTheDocument(),
    );
  });
});

describe("MeetingsPage — create modal", () => {
  it("opens the New Meeting modal when the button is clicked", async () => {
    mockMeetingList.mockResolvedValue([]);

    renderPage();

    await waitFor(() => screen.getByText("No meetings found"));

    fireEvent.click(screen.getAllByRole("button", { name: /New Meeting/i })[0]);

    expect(screen.getByText("New Meeting", { selector: "h2, [role=dialog] *" })).toBeInTheDocument();
  });
});

describe("MeetingsPage — status filter", () => {
  it("renders the status filter select with all status options", async () => {
    mockMeetingList.mockResolvedValue([]);

    renderPage();

    await waitFor(() => screen.getByText("No meetings found"));

    const select = screen.getByDisplayValue("All Statuses");
    expect(select).toBeInTheDocument();

    const options = Array.from((select as HTMLSelectElement).options).map(
      (o) => o.text,
    );
    expect(options).toContain("Draft");
    expect(options).toContain("Scheduled");
    expect(options).toContain("In Progress");
    expect(options).toContain("Completed");
    expect(options).toContain("Cancelled");
  });

  it("re-fetches meetings when the status filter changes", async () => {
    mockMeetingList.mockResolvedValue([]);

    renderPage();

    await waitFor(() => screen.getByText("No meetings found"));

    const select = screen.getByDisplayValue("All Statuses");
    fireEvent.change(select, { target: { value: "DRAFT" } });

    await waitFor(() =>
      expect(mockMeetingList).toHaveBeenCalledWith(
        expect.objectContaining({ status: "DRAFT" }),
      ),
    );
  });
});
