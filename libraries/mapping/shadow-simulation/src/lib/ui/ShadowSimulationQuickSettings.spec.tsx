import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SHADOW_ANIMATION_MODE } from "../contracts/shadow-simulation";
import {
  createInitialShadowDateState,
  createInitialShadowSimulationState,
} from "../core/create-shadow-simulation-state";
import { DEFAULT_SHADOW_SIMULATION_LOCATION } from "../core/solar-position";
import { ShadowSimulationQuickSettings } from "./ShadowSimulationQuickSettings";

afterEach(cleanup);

describe("shadow date and animation shortcuts", () => {
  it("updates the date without changing shadow display settings", () => {
    const location = DEFAULT_SHADOW_SIMULATION_LOCATION;
    const setState = vi.fn();
    const setDateState = vi.fn();
    const { getByRole } = render(
      <ShadowSimulationQuickSettings
        location={location}
        state={createInitialShadowSimulationState(undefined)}
        setState={setState}
        dateState={createInitialShadowDateState({ year: 2026 }, location)}
        setDateState={setDateState}
      />
    );
    fireEvent.click(getByRole("button", { name: "21. Juni" }));
    expect(setDateState).toHaveBeenCalledWith(
      expect.objectContaining({ dayOfYear: 172 })
    );
    expect(setState).not.toHaveBeenCalled();
  });

  it("starts the selected animation while preserving display settings", () => {
    const location = DEFAULT_SHADOW_SIMULATION_LOCATION;
    const state = {
      ...createInitialShadowSimulationState(undefined),
      showDisplaySettings: true,
      shadowIntensity: 0.42,
    };
    const setState = vi.fn();
    const setDateState = vi.fn();
    const { getByRole } = render(
      <ShadowSimulationQuickSettings
        location={location}
        state={state}
        setState={setState}
        dateState={createInitialShadowDateState(undefined, location)}
        setDateState={setDateState}
      />
    );
    fireEvent.click(getByRole("button", { name: "Jahresverlauf" }));
    expect(setState).toHaveBeenCalledWith({
      ...state,
      animationMode: SHADOW_ANIMATION_MODE.YEAR,
      isAnimating: true,
    });
    expect(setDateState).not.toHaveBeenCalled();
  });
});
