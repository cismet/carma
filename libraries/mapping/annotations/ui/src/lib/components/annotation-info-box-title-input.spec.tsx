// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
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
});
