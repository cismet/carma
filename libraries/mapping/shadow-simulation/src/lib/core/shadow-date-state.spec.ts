import { describe, expect, it } from "vitest";

import { createInitialShadowDateState } from "./create-shadow-simulation-state";
import {
  updateShadowCalendarDate,
  updateShadowToCurrentDate,
} from "./shadow-date-state";
import { DEFAULT_SHADOW_SIMULATION_LOCATION } from "./solar-position";

const initialState = createInitialShadowDateState(
  undefined,
  DEFAULT_SHADOW_SIMULATION_LOCATION,
  new Date("2026-06-21T10:00:00.000Z")
);

describe("shadow date state transitions", () => {
  it("updates the calendar date while preserving the time", () => {
    const state = updateShadowCalendarDate(
      initialState,
      2026,
      64,
      DEFAULT_SHADOW_SIMULATION_LOCATION
    );

    expect(state.year).toBe(2026);
    expect(state.dayOfYear).toBe(64);
    expect(state.minutes).toBe(initialState.minutes);
  });

  it("selects today's date while preserving the chosen time", () => {
    const state = updateShadowToCurrentDate(
      initialState,
      DEFAULT_SHADOW_SIMULATION_LOCATION,
      new Date("2025-01-02T10:00:00.000Z")
    );

    expect(state.year).toBe(2025);
    expect(state.dayOfYear).toBe(2);
    expect(state.minutes).toBe(initialState.minutes);
  });
});
