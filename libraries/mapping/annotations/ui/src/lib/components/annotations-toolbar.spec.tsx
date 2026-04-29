// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AnnotationsToolbar } from "./AnnotationsToolbar";

describe("AnnotationsToolbar", () => {
  it("does not call selection handlers for disabled tools", () => {
    const onToolSelect = vi.fn();

    render(
      <AnnotationsToolbar
        activeToolId="distance"
        onToolSelect={onToolSelect}
        tools={[
          {
            id: "select",
            label: "Auswahl",
            tooltip: "Messungen auswählen",
            disabled: true,
          },
          {
            id: "distance",
            label: "Distanz",
            tooltip: "Distanz messen",
          },
        ]}
      />
    );

    const selectButton = screen.getByRole("button", {
      name: "Messungen auswählen",
    });
    expect((selectButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(selectButton);
    expect(onToolSelect).not.toHaveBeenCalled();
  });
});
