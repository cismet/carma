import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AnnotationInfoBoxTitleInput } from "./AnnotationInfoBoxTitleInput";

describe("AnnotationInfoBoxTitleInput", () => {
  it("keeps the title input content-sized without forcing an inline width", () => {
    const placeholder = "Distanzmessung";

    render(
      <AnnotationInfoBoxTitleInput
        value=""
        placeholder={placeholder}
        onCommit={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(placeholder);

    const htmlInput = input as HTMLInputElement;

    expect(htmlInput.hasAttribute("size")).toBe(false);
    expect(htmlInput.style.width).toBe("");
    expect(htmlInput.style.minWidth).toBe("1ch");
  });

  it("does not add an inline width when the title value changes", () => {
    const placeholder = "Punktmessung";
    const value = "Relative Bezugshöhe";
    const { rerender } = render(
      <AnnotationInfoBoxTitleInput
        value=""
        placeholder={placeholder}
        onCommit={vi.fn()}
      />
    );

    rerender(
      <AnnotationInfoBoxTitleInput
        value={value}
        placeholder={placeholder}
        onCommit={vi.fn()}
      />
    );

    const input = screen.getByDisplayValue(value) as HTMLInputElement;

    expect(input.hasAttribute("size")).toBe(false);
    expect(input.style.width).toBe("");
    expect(input.style.minWidth).toBe("1ch");
  });

  it("lets the short-label badge input grow up to 64 characters", () => {
    const shortLabelValue = "LONG-BADGE-42";

    render(
      <AnnotationInfoBoxTitleInput
        value="Distanzmessung"
        placeholder="Distanzmessung"
        shortLabelValue={shortLabelValue}
        shortLabelPlaceholder="D1"
        onCommit={vi.fn()}
        onShortLabelCommit={vi.fn()}
      />
    );

    const input = screen.getByDisplayValue(
      shortLabelValue
    ) as HTMLInputElement;

    expect(input.maxLength).toBe(64);
    expect(input.style.width).toBe(`${shortLabelValue.length + 0.5}ch`);
    expect(input.style.minWidth).toBe("2.5ch");
    expect(input.style.maxWidth).toBe("min(64.5ch, 100%)");
  });

  it("truncates committed short-label badge input to 64 characters", () => {
    const onShortLabelCommit = vi.fn();
    const longValue = "A".repeat(80);

    render(
      <AnnotationInfoBoxTitleInput
        value="Distanzmessung"
        placeholder="Distanzmessung"
        shortLabelValue=""
        shortLabelPlaceholder="D1"
        onCommit={vi.fn()}
        onShortLabelCommit={onShortLabelCommit}
      />
    );

    const input = screen.getByPlaceholderText("D1") as HTMLInputElement;

    fireEvent.change(input, { target: { value: longValue } });
    fireEvent.blur(input);

    expect(input.value).toBe("A".repeat(64));
    expect(onShortLabelCommit).toHaveBeenCalledWith("A".repeat(64));
  });

  it("keeps internal whitespace while editing and committing short labels", () => {
    const onShortLabelCommit = vi.fn();

    render(
      <AnnotationInfoBoxTitleInput
        value="Distanzmessung"
        placeholder="Distanzmessung"
        shortLabelValue=""
        shortLabelPlaceholder="D1"
        onCommit={vi.fn()}
        onShortLabelCommit={onShortLabelCommit}
      />
    );

    const input = screen.getByPlaceholderText("D1") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "A " } });
    expect(input.value).toBe("A ");

    fireEvent.change(input, { target: { value: "A B" } });
    fireEvent.blur(input);

    expect(input.value).toBe("A B");
    expect(onShortLabelCommit).toHaveBeenCalledWith("A B");
  });
});
