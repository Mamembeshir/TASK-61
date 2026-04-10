import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusBadge from "../StatusBadge";

describe("StatusBadge", () => {
  it.each([
    ["DRAFT",      "Draft",      "#F1F5F9", "#475569"],
    ["ACTIVE",     "Active",     "#D1FAE5", "#065F46"],
    ["SUPERSEDED", "Superseded", "#FEF3C7", "#92400E"],
    ["ARCHIVED",   "Archived",   "#FEE2E2", "#991B1B"],
    ["PUBLISHED",  "Published",  "#DBEAFE", "#1E40AF"],
    ["UNPUBLISHED","Unpublished","#E2E8F0", "#334155"],
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
    expect(badge).toHaveStyle({ display: "inline-flex" });
  });
});
