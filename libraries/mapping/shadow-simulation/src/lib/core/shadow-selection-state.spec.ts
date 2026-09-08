import { describe, expect, it } from "vitest";

import type {
  ShadowDateState,
  ShadowSimulationState,
} from "../contracts/shadow-simulation";

import {
  applyShadowHashSelection,
  resolveShadowHashSelection,
  shadowStateMatchesHashSelection,
  createShadowStartupState,
} from "./shadow-selection-state";

describe("shadow selection state", () => {
  it("validates leap days and integer years with the shared calendar", () => {
    const selection = { dayOfYear: 366, minutes: 720 };
    expect(
      resolveShadowHashSelection(selection, 2024, {}, "Europe/Berlin")
    ).not.toBeNull();
    expect(
      resolveShadowHashSelection(selection, 2026, {}, "Europe/Berlin")
    ).toBeNull();
    expect(
      resolveShadowHashSelection(selection, 2024.5, {}, "Europe/Berlin")
    ).toBeNull();
  });
  it("resolves enabled state and date before any map or addon mounts", () => {
    const state = createShadowStartupState(
      { year: 2026 },
      { dayOfYear: 172, minutes: 720 },
      { latitude: 51.27, longitude: 7.2 }
    );
    expect(state.shadowSimulation.enabled).toBe(true);
    expect(state.shadowDate).toMatchObject({
      year: 2026,
      dayOfYear: 172,
      minutes: 720,
      timeZone: "Europe/Berlin",
    });
    expect(
      createShadowStartupState(
        { year: 2025 },
        { dayOfYear: 366, minutes: 720 },
        {}
      ).shadowSimulation.enabled
    ).toBe(false);
    expect(
      createShadowStartupState(undefined, null, {}).shadowSimulation.enabled
    ).toBe(false);
  });
  it("matches enabled state and hash selection by value", () => {
    const selection = { dayOfYear: 172, minutes: 720 };
    expect(shadowStateMatchesHashSelection(true, selection, selection)).toBe(
      true
    );
    expect(shadowStateMatchesHashSelection(false, selection, null)).toBe(true);
  });

  it("rejects invalid dates and clamps valid night selections", () => {
    expect(
      resolveShadowHashSelection(
        { dayOfYear: 366, minutes: 720 },
        2025,
        { latitude: 51.256, longitude: 7.15 },
        "Europe/Berlin"
      )
    ).toBeNull();

    expect(
      resolveShadowHashSelection(
        { dayOfYear: 172, minutes: 0 },
        2026,
        { latitude: 51.256, longitude: 7.15 },
        "Europe/Berlin"
      )?.minutes
    ).toBeGreaterThan(0);
  });

  it("restores only the hash-owned state fields", () => {
    const state = {
      enabled: false,
      terrainColor: "#fff",
    } as ShadowSimulationState;
    const dateState: ShadowDateState = {
      year: 2026,
      dayOfYear: 172,
      minutes: 720,
      timeZone: "Europe/Berlin",
    };

    expect(
      applyShadowHashSelection(state, dateState, {
        dayOfYear: 173,
        minutes: 800,
      })
    ).toEqual({
      shadowState: { ...state, enabled: true },
      dateState: {
        year: 2026,
        dayOfYear: 173,
        minutes: 800,
        timeZone: "Europe/Berlin",
      },
    });
  });
});
