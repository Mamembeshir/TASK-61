import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmDialog from "../ConfirmDialog";

function setup(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      title="Delete item"
      message="Are you sure?"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />
  );
  return { onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("renders title and message", () => {
    setup();
    expect(screen.getByText("Delete item")).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  it("renders default button labels", () => {
    setup();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("renders custom button labels", () => {
    setup({ confirmLabel: "Yes, delete", cancelLabel: "Go back" });
    expect(screen.getByRole("button", { name: "Yes, delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const { onConfirm, onCancel } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const { onConfirm, onCancel } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onCancel when overlay backdrop is clicked", async () => {
    const { onCancel } = setup();
    // The overlay is the outermost div; clicking it should fire onCancel
    const overlay = screen.getByText("Delete item").closest("div")!.parentElement!;
    await userEvent.click(overlay);
    expect(onCancel).toHaveBeenCalled();
  });

  it("does not call onCancel when clicking inside the dialog box", async () => {
    const { onCancel } = setup();
    const box = screen.getByText("Delete item").closest("div")!;
    await userEvent.click(box);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("uses red background for danger variant confirm button", () => {
    setup({ confirmVariant: "danger" });
    const btn = screen.getByRole("button", { name: "Confirm" });
    expect(btn).toHaveStyle({ background: "#dc3545" });
  });

  it("uses blue background for primary variant confirm button", () => {
    setup({ confirmVariant: "primary" });
    const btn = screen.getByRole("button", { name: "Confirm" });
    expect(btn).toHaveStyle({ background: "#0d6efd" });
  });

  it("defaults to primary variant", () => {
    setup();
    const btn = screen.getByRole("button", { name: "Confirm" });
    expect(btn).toHaveStyle({ background: "#0d6efd" });
  });

  it("accepts ReactNode as message", () => {
    setup({ message: <strong>Bold warning</strong> });
    expect(screen.getByText("Bold warning")).toBeInTheDocument();
  });
});
