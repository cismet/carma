import { describe, expect, it } from "vitest";

import {
  createInitialShadowDateState,
  createInitialShadowSimulationState,
} from "./create-shadow-simulation-state";
import { DEFAULT_SHADOW_SIMULATION_LOCATION } from "./solar-position";

describe("initial shadow states", () => {
  it("builds stable independent defaults", () => {
    const state = createInitialShadowSimulationState(undefined);
    const dateState = createInitialShadowDateState(
      undefined,
      DEFAULT_SHADOW_SIMULATION_LOCATION,
      new Date("2026-06-21T10:00:00.000Z")
    );

    expect(state.enabled).toBe(false);
    expect(dateState.year).toBe(2026);
    expect(dateState.dayOfYear).toBe(172);
    expect(dateState.timeZone).toBe("Europe/Berlin");
    expect(state.showMapStyleContent).toBe(true);
  });

  it("honors configured date and terrain material defaults", () => {
    const config = {
      year: 2024,
      initialDayOfYear: 60,
      initialMinutes: 12 * 60,
      terrain: {
        url: "https://example.invalid/terrain.json",
        material: { color: "#123456" },
      },
    };
    const state = createInitialShadowSimulationState(config);
    const dateState = createInitialShadowDateState(
      config,
      DEFAULT_SHADOW_SIMULATION_LOCATION
    );

    expect(dateState).toEqual({
      year: 2024,
      dayOfYear: 60,
      minutes: 12 * 60,
      timeZone: "Europe/Berlin",
    });
    expect(state.terrainColor).toBe("#123456");
  });
});
