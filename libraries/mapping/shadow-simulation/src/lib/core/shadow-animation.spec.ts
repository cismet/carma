import { describe, expect, it } from "vitest";

import {
  SHADOW_ANIMATION_MODE,
  type ShadowSimulationState,
} from "../contracts/shadow-simulation";
import { advanceShadowAnimationFrame } from "./shadow-animation";
import {
  createInitialShadowDateState,
  createInitialShadowSimulationState,
} from "./create-shadow-simulation-state";
import { DEFAULT_SHADOW_SIMULATION_LOCATION } from "./solar-position";

const initialDateState = createInitialShadowDateState(
  undefined,
  DEFAULT_SHADOW_SIMULATION_LOCATION,
  new Date("2026-06-21T10:00:00.000Z")
);

const createState = (
  patch: Partial<ShadowSimulationState>
): ShadowSimulationState => ({
  ...createInitialShadowSimulationState(undefined),
  enabled: true,
  isAnimating: true,
  ...patch,
});

describe("advanceShadowAnimationFrame", () => {
  it("advances the daily animation and wraps at sunset", () => {
    const state = createState({ animationSpeed: 4 });
    const dateState = {
      year: 2026,
      dayOfYear: 172,
      minutes: 24 * 60,
      timeZone: "Europe/Berlin",
    };
    const frame = advanceShadowAnimationFrame(
      state,
      dateState,
      initialDateState,
      DEFAULT_SHADOW_SIMULATION_LOCATION,
      0
    );

    expect(frame.dateState.minutes).toBeLessThan(12 * 60);
    expect(frame.yearDayProgress).toBe(0);
  });

  it("carries annual animation across year boundaries", () => {
    const state = createState({
      animationMode: SHADOW_ANIMATION_MODE.YEAR,
      animationSpeed: 4,
    });
    const dateState = {
      year: 2024,
      dayOfYear: 366,
      minutes: 12 * 60,
      timeZone: "Europe/Berlin",
    };
    const frame = advanceShadowAnimationFrame(
      state,
      dateState,
      initialDateState,
      DEFAULT_SHADOW_SIMULATION_LOCATION,
      0
    );

    expect(frame.dateState.year).toBe(2025);
    expect(frame.dateState.dayOfYear).toBe(2);
    expect(frame.yearDayProgress).toBe(0);
  });

  it("keeps fractional annual progress explicit", () => {
    const state = createState({
      animationMode: SHADOW_ANIMATION_MODE.YEAR,
      animationSpeed: 1,
    });
    const first = advanceShadowAnimationFrame(
      state,
      initialDateState,
      initialDateState,
      DEFAULT_SHADOW_SIMULATION_LOCATION,
      0
    );
    const second = advanceShadowAnimationFrame(
      state,
      first.dateState,
      initialDateState,
      DEFAULT_SHADOW_SIMULATION_LOCATION,
      first.yearDayProgress
    );

    expect(first.dateState).toBe(initialDateState);
    expect(first.yearDayProgress).toBe(0.5);
    expect(second.dateState.dayOfYear).toBe(initialDateState.dayOfYear + 1);
    expect(second.yearDayProgress).toBe(0);
  });

  it("keeps inactive date state unchanged", () => {
    const state = createState({ isAnimating: false });
    const frame = advanceShadowAnimationFrame(
      state,
      initialDateState,
      initialDateState,
      DEFAULT_SHADOW_SIMULATION_LOCATION,
      0.5
    );

    expect(frame).toEqual({
      dateState: initialDateState,
      yearDayProgress: 0.5,
    });
  });
});
