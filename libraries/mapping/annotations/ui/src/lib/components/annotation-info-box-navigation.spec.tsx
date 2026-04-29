// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { annotationInfoBoxVisualDefaults } from "../config/annotation-info-box-visual-defaults";
import { AnnotationInfoBoxNavigation } from "./AnnotationInfoBoxNavigation";

describe("AnnotationInfoBoxNavigation", () => {
  it("renders fly-to and paging controls as accessible buttons", () => {
    const onFlyToAllMeasurements = vi.fn();
    const onPreviousMeasurement = vi.fn();
    const onNextMeasurement = vi.fn();

    render(
      <AnnotationInfoBoxNavigation
        totalEntries={3}
        currentIndex={1}
        onFlyToAllMeasurements={onFlyToAllMeasurements}
        onPreviousMeasurement={onPreviousMeasurement}
        onNextMeasurement={onNextMeasurement}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "3 Messungen verfügbar" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Vorherige Messung" }));
    fireEvent.click(screen.getByRole("button", { name: "Nächste Messung" }));

    expect(onFlyToAllMeasurements).toHaveBeenCalledTimes(1);
    expect(onPreviousMeasurement).toHaveBeenCalledTimes(1);
    expect(onNextMeasurement).toHaveBeenCalledTimes(1);
  });

  it("can render plain paging labels without losing pointer behavior", () => {
    render(
      <AnnotationInfoBoxNavigation
        totalEntries={3}
        currentIndex={1}
        onPreviousMeasurement={vi.fn()}
        onNextMeasurement={vi.fn()}
        visualOptions={{
          ...annotationInfoBoxVisualDefaults,
          navigationControlLabels: {
            previous: "<<",
            next: ">>",
          },
        }}
      />
    );

    const previousButton = screen.getByRole("button", {
      name: "Vorherige Messung",
    });
    const nextButton = screen.getByRole("button", {
      name: "Nächste Messung",
    });

    expect(previousButton.textContent).toBe("<<");
    expect(nextButton.textContent).toBe(">>");
    expect(previousButton.getAttribute("class")).toContain("cursor-pointer");
    expect(previousButton.style.userSelect).toBe("none");
  });
});
