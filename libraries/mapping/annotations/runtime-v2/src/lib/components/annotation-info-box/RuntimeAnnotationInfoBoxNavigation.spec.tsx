// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RuntimeAnnotationInfoBoxNavigation } from "./RuntimeAnnotationInfoBoxNavigation";

describe("RuntimeAnnotationInfoBoxNavigation", () => {
  it("renders fly-to and paging controls as accessible buttons", () => {
    const onFlyToAllMeasurements = vi.fn();
    const onPreviousMeasurement = vi.fn();
    const onNextMeasurement = vi.fn();

    render(
      <RuntimeAnnotationInfoBoxNavigation
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
});
