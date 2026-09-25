import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialShadowSimulationState } from "../core/create-shadow-simulation-state";
import { ShadowAnimationSpeedControl } from "./ShadowAnimationSpeedControl";
import { ShadowSimulationHeaderControlsView } from "./ShadowSimulationHeaderControlsView";

vi.mock("../runtime/hooks/use-map-center-solar-location", () => ({
  useMapCenterSolarLocation: () => ({ latitude: 51.25, longitude: 7.12 }),
}));
afterEach(cleanup);

describe("shared shadow time controls", () => {
  it("reports pointer, keyboard and cancelled time interactions", () => {
    const onTimeInteractionChange = vi.fn();
    const view = render(
      <ShadowSimulationHeaderControlsView
        libreMap={null}
        state={createInitialShadowSimulationState(undefined)}
        setState={vi.fn()}
        dateState={{
          year: 2026,
          dayOfYear: 267,
          minutes: 865,
          timeZone: "Europe/Berlin",
        }}
        setDateState={vi.fn()}
        onTimeInteractionChange={onTimeInteractionChange}
      />
    );
    const slider = view.getByRole("slider", { name: "Uhrzeit" });
    slider.setPointerCapture = vi.fn();
    fireEvent.pointerDown(slider, { pointerId: 1 });
    expect(onTimeInteractionChange).toHaveBeenLastCalledWith(true);
    fireEvent.pointerCancel(slider);
    expect(onTimeInteractionChange).toHaveBeenLastCalledWith(false);
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onTimeInteractionChange).toHaveBeenLastCalledWith(true);
    fireEvent.keyUp(slider, { key: "ArrowRight" });
    expect(onTimeInteractionChange).toHaveBeenLastCalledWith(false);
    fireEvent.pointerDown(slider, { pointerId: 1 });
    fireEvent.lostPointerCapture(slider);
    expect(onTimeInteractionChange).toHaveBeenLastCalledWith(false);
  });

  it("offers the same 1x, 4x and 12x speed selector to both addons", () => {
    const onChange = vi.fn();
    const view = render(
      <ShadowAnimationSpeedControl value={4} onChange={onChange} />
    );
    expect(
      view.getAllByRole("button").map((button) => button.textContent)
    ).toEqual(["1×", "4×", "12×"]);
    expect(
      view.getByRole("button", { name: "4×" }).getAttribute("aria-pressed")
    ).toBe("true");
    fireEvent.click(view.getByRole("button", { name: "12×" }));
    expect(onChange).toHaveBeenCalledWith(12);
  });
});
