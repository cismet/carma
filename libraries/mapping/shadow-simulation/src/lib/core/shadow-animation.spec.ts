import { describe, expect, it } from "vitest";
import type { Milliseconds } from "@carma-units";

import {
  SHADOW_ANIMATION_MODE,
  type ShadowSimulationState,
} from "../contracts/shadow-simulation";
import { advanceShadowAnimationFrame } from "./shadow-animation";
import {
  createInitialShadowDateState,
  createInitialShadowSimulationState,
} from "./create-shadow-simulation-state";
import {
  DEFAULT_SHADOW_SIMULATION_LOCATION,
  getDaylightWindow,
} from "./solar-position";

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
  it("loops a full day at midnight without changing the selected date", () => {
    const start = { ...initialDateState, minutes: 1439.5 };
    const frame = advanceShadowAnimationFrame(
      createState({ animationSpeed: 1, animationDaylightOnly: false }),
      start,
      start,
      DEFAULT_SHADOW_SIMULATION_LOCATION,
      0,
      { elapsedMs: 100 as Milliseconds }
    );
    expect(frame.dateState).toEqual({ ...start, minutes: 5.5 });
  });

  it("loops the realtime year at 60 days/s by default and preserves night time", () => {
    const start = {
      ...initialDateState,
      year: 2024,
      dayOfYear: 366,
      minutes: 30,
    };
    const state = createState({
      animationMode: SHADOW_ANIMATION_MODE.YEAR,
    });
    const first = advanceShadowAnimationFrame(
      state,
      start,
      start,
      DEFAULT_SHADOW_SIMULATION_LOCATION,
      0,
      { elapsedMs: (1000 / 120) as Milliseconds }
    );
    expect(first.dateState).toEqual(start);
    expect(first.yearDayProgress).toBeCloseTo(0.5, 8);
    const second = advanceShadowAnimationFrame(
      state,
      first.dateState,
      start,
      DEFAULT_SHADOW_SIMULATION_LOCATION,
      first.yearDayProgress,
      { elapsedMs: (1000 / 120) as Milliseconds }
    );
    expect(second.dateState).toEqual({ ...start, dayOfYear: 1 });
  });

  it.each([1, 4, 12])(
    "advances the realtime year at %s× independently of frame count",
    (animationSpeed) => {
      const state = createState({
        animationMode: SHADOW_ANIMATION_MODE.YEAR,
        animationSpeed,
      });
      const start = { ...initialDateState, dayOfYear: 1, minutes: 30 };
      for (const steps of [1, 30, 60, 120]) {
        let frame = { dateState: start, yearDayProgress: 0 };
        for (let i = 0; i < steps; i += 1) {
          frame = advanceShadowAnimationFrame(
            state,
            frame.dateState,
            start,
            DEFAULT_SHADOW_SIMULATION_LOCATION,
            frame.yearDayProgress,
            { elapsedMs: (1000 / steps) as Milliseconds }
          );
        }
        expect(frame.dateState.dayOfYear + frame.yearDayProgress).toBeCloseTo(
          1 + animationSpeed * 15,
          8
        );
        expect(frame.dateState.minutes).toBe(30);
      }
    }
  );

  it("advances one hour per second at 1× independently of frame count", () => {
    const state = createState({ animationSpeed: 1 });
    const start = { ...initialDateState, minutes: 600 };
    const run = (steps: number) => {
      let date = start;
      for (let i = 0; i < steps; i += 1) {
        date = advanceShadowAnimationFrame(
          state,
          date,
          start,
          DEFAULT_SHADOW_SIMULATION_LOCATION,
          0,
          { elapsedMs: (1000 / steps) as Milliseconds }
        ).dateState;
      }
      return date.minutes;
    };
    expect(run(60)).toBeCloseTo(660, 8);
    expect(run(30)).toBeCloseTo(660, 8);
    expect(run(4)).toBeCloseTo(660, 8);
    expect(run(1)).toBeCloseTo(660, 8);
  });

  it("preserves sub-minute steps and sunset overshoot at realtime speeds", () => {
    const start = { ...initialDateState, minutes: 600 };
    const fine = advanceShadowAnimationFrame(
      createState({ animationSpeed: 1 }),
      start,
      start,
      DEFAULT_SHADOW_SIMULATION_LOCATION,
      0,
      { elapsedMs: 5 as Milliseconds }
    );
    expect(fine.dateState.minutes).toBeCloseTo(600.3, 8);
    const daylight = getDaylightWindow(
      start,
      DEFAULT_SHADOW_SIMULATION_LOCATION
    );
    const late = { ...start, minutes: Math.floor(daylight.sunsetMinutes) - 1 };
    const wrapped = advanceShadowAnimationFrame(
      createState({ animationSpeed: 4 }),
      late,
      late,
      DEFAULT_SHADOW_SIMULATION_LOCATION,
      0,
      { elapsedMs: 100 as Milliseconds }
    );
    expect(wrapped.dateState.minutes).toBeCloseTo(
      Math.ceil(daylight.sunriseMinutes) + 23,
      8
    );
  });

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

  it("runs all 24 hours in one cycle length, whatever the speed", () => {
    const start = { ...initialDateState, minutes: 0 };
    const frame = advanceShadowAnimationFrame(
      createState({
        animationSpeed: 12,
        animationCycleSeconds: 60,
        animationDaylightOnly: false,
      }),
      start,
      start,
      DEFAULT_SHADOW_SIMULATION_LOCATION,
      0,
      { elapsedMs: 15_000 as Milliseconds }
    );
    // a quarter of the cycle is a quarter of the day
    expect(frame.dateState.minutes).toBeCloseTo(360);
  });

  it("runs the daylight window in one cycle length", () => {
    const daylight = getDaylightWindow(
      initialDateState,
      DEFAULT_SHADOW_SIMULATION_LOCATION
    );
    const start = {
      ...initialDateState,
      minutes: Math.ceil(daylight.sunriseMinutes),
    };
    const frame = advanceShadowAnimationFrame(
      createState({ animationCycleSeconds: 60 }),
      start,
      start,
      DEFAULT_SHADOW_SIMULATION_LOCATION,
      0,
      { elapsedMs: 30_000 as Milliseconds }
    );
    expect(frame.dateState.minutes - start.minutes).toBeCloseTo(
      (daylight.sunsetMinutes - daylight.sunriseMinutes) / 2
    );
  });

  it("runs a year in one cycle length", () => {
    const start = { ...initialDateState, year: 2026, dayOfYear: 1 };
    const frame = advanceShadowAnimationFrame(
      createState({
        animationMode: SHADOW_ANIMATION_MODE.YEAR,
        animationCycleSeconds: 73,
      }),
      start,
      start,
      DEFAULT_SHADOW_SIMULATION_LOCATION,
      0,
      { elapsedMs: 1_000 as Milliseconds }
    );
    // 365 days in 73 s are five days a second
    expect(frame.dateState.dayOfYear).toBe(6);
    expect(frame.yearDayProgress).toBeCloseTo(0);
  });

  it("ignores the cycle length without elapsed time", () => {
    const start = { ...initialDateState, minutes: 600 };
    const frame = advanceShadowAnimationFrame(
      createState({
        animationSpeed: 4,
        animationCycleSeconds: 60,
        animationDaylightOnly: false,
      }),
      start,
      start,
      DEFAULT_SHADOW_SIMULATION_LOCATION,
      0
    );
    expect(frame.dateState.minutes).toBe(604);
  });
});
