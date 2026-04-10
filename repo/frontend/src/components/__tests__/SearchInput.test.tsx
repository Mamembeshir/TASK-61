import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import SearchInput from "../SearchInput";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SearchInput", () => {
  it("renders with placeholder", () => {
    render(<SearchInput value="" onChange={vi.fn()} placeholder="Find…" />);
    expect(screen.getByPlaceholderText("Find…")).toBeInTheDocument();
  });

  it("uses default placeholder when none provided", () => {
    render(<SearchInput value="" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();
  });

  it("does not show clear button when value is empty", () => {
    render(<SearchInput value="" onChange={vi.fn()} />);
    expect(screen.queryByTitle("Clear")).not.toBeInTheDocument();
  });

  it("shows clear button when value is non-empty", () => {
    render(<SearchInput value="hello" onChange={vi.fn()} />);
    expect(screen.getByTitle("Clear")).toBeInTheDocument();
  });

  it("debounces onChange — fires after delay, not immediately", () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} debounceMs={300} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "a" } });

    expect(onChange).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(300); });

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("does not fire onChange before debounce delay has elapsed", () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} debounceMs={300} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a" } });
    act(() => { vi.advanceTimersByTime(299); });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("resets debounce timer on each keystroke", () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} debounceMs={300} />);

    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "a" } });
    act(() => { vi.advanceTimersByTime(100); });

    fireEvent.change(input, { target: { value: "ab" } });
    act(() => { vi.advanceTimersByTime(100); });

    expect(onChange).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(300); });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("ab");
  });

  it("clear button calls onChange with empty string immediately (no debounce)", () => {
    const onChange = vi.fn();
    render(<SearchInput value="hello" onChange={onChange} />);

    fireEvent.click(screen.getByTitle("Clear"));

    // onChange fires immediately on clear — no timer needed
    expect(onChange).toHaveBeenCalledWith("");
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("clear button hides itself after clearing", () => {
    const onChange = vi.fn();
    const { rerender } = render(<SearchInput value="hello" onChange={onChange} />);

    fireEvent.click(screen.getByTitle("Clear"));
    rerender(<SearchInput value="" onChange={onChange} />);

    expect(screen.queryByTitle("Clear")).not.toBeInTheDocument();
  });

  it("syncs local state when parent resets value prop", () => {
    const onChange = vi.fn();
    const { rerender } = render(<SearchInput value="old" onChange={onChange} />);
    rerender(<SearchInput value="" onChange={onChange} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
  });
});
