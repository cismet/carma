// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
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
            tooltip: "Messung auswählen",
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
      name: "Messung auswählen",
    });
    expect((selectButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(selectButton);
    expect(onToolSelect).not.toHaveBeenCalled();
  });

  it("renders optional tool button backdrops only for matching tools", () => {
    render(
      <AnnotationsToolbar
        activeToolId="distance"
        onToolSelect={vi.fn()}
        tools={[
          {
            id: "distance",
            label: "Distanz",
            tooltip: "Distanz messen",
          },
          {
            id: "area-planar",
            label: "Fläche",
            tooltip: "Fläche messen",
          },
        ]}
        renderToolButtonBackdrop={(tool) =>
          tool.id === "area-planar" ? (
            <span data-testid="area-planar-backdrop" />
          ) : null
        }
      />
    );

    const areaButton = screen.getByRole("button", {
      name: "Fläche messen",
    });
    const distanceButton = screen.getByRole("button", {
      name: "Distanz messen",
    });

    expect(
      within(areaButton).queryByTestId("area-planar-backdrop")
    ).not.toBeNull();
    expect(
      within(distanceButton).queryByTestId("area-planar-backdrop")
    ).toBeNull();
  });
});
