import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusBadge from "../StatusBadge";

describe("StatusBadge", () => {
  it.each([
    ["DRAFT", "Draft", "#e2e3e5", "#41464b"],
    ["ACTIVE", "Active", "#d1e7dd", "#0f5132"],
    ["SUPERSEDED", "Superseded", "#fff3cd", "#664d03"],
    ["ARCHIVED", "Archived", "#f8d7da", "#842029"],
    ["PUBLISHED", "Published", "#cfe2ff", "#084298"],
    ["UNPUBLISHED", "Unpublished", "#e2e3e5", "#41464b"],
  ] as const)(
    "renders %s with correct label and colours",
    (status, label, bg, color) => {
      render(<StatusBadge status={status as any} />);
      const badge = screen.getByText(label);
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveStyle({ background: bg, color });
    }
  );

  it("falls back to raw status string for unknown values", () => {
    render(<StatusBadge status={"UNKNOWN" as any} />);
    expect(screen.getByText("UNKNOWN")).toBeInTheDocument();
  });

  it("renders as an inline-block span", () => {
    render(<StatusBadge status="ACTIVE" />);
    const badge = screen.getByText("Active");
    expect(badge.tagName).toBe("SPAN");
    expect(badge).toHaveStyle({ display: "inline-block" });
  });
});
