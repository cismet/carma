// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AnnotationInfoBoxTitleInput } from "./AnnotationInfoBoxTitleInput";

describe("AnnotationInfoBoxTitleInput", () => {
  it("uses CSS content sizing without the old computed width attributes", () => {
    const placeholder = "Distanzmessung";

    render(
      <AnnotationInfoBoxTitleInput
        value=""
        placeholder={placeholder}
        onCommit={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(placeholder);

    expect(input).not.toHaveAttribute("size");
    expect((input as HTMLInputElement).style.width).toBe("");
    expect((input as HTMLInputElement).style.minWidth).toBe("1ch");
    expect((input as HTMLInputElement).className).toContain(
      "[field-sizing:content]"
    );
  });

  it("keeps the current title value without restoring the old inline width calculation", () => {
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

    expect(input).not.toHaveAttribute("size");
    expect(input.style.width).toBe("");
    expect(input.style.minWidth).toBe("1ch");
  });
});
