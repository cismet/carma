// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";

import { AnnotationInfoBoxTitleInput } from "./AnnotationInfoBoxTitleInput";

describe("AnnotationInfoBoxTitleInput", () => {
  it("sizes the title input from the placeholder when the current value is empty", () => {
    const placeholder = "Distanzmessung";

    render(
      <AnnotationInfoBoxTitleInput
        value=""
        placeholder={placeholder}
        onCommit={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(placeholder);

    expect(input).toHaveAttribute(
      "size",
      String(Math.min(18, placeholder.trim().length))
    );
    expect((input as HTMLInputElement).style.width).toBe(
      `calc(${Math.min(18, placeholder.trim().length)}ch + 0.5rem)`
    );
  });

  it("updates the title input width when committed content becomes longer than the placeholder", async () => {
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

    await waitFor(() => {
      expect(input.style.width).toBe("calc(18ch + 0.5rem)");
    });
  });
});
