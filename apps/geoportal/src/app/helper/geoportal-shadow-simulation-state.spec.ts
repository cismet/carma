import { describe, expect, it } from "vitest";

import type {
  ShadowDateState,
  ShadowSimulationState,
} from "@carma-mapping/shadow-simulation";

import {
  applyShadowHashSelection,
  resolveGeoportalShadowHashSelection,
  shadowStateMatchesHashSelection,
} from "./geoportal-shadow-simulation-state";

describe("geoportal shadow simulation state", () => {
  it("matches enabled state and hash selection by value", () => {
    const selection = { dayOfYear: 172, minutes: 720 };
    expect(shadowStateMatchesHashSelection(true, selection, selection)).toBe(
      true
    );
    expect(shadowStateMatchesHashSelection(false, selection, null)).toBe(true);
  });

  it("rejects invalid dates and clamps valid night selections", () => {
    expect(
      resolveGeoportalShadowHashSelection(
        { dayOfYear: 366, minutes: 720 },
        2025,
        { latitude: 51.256, longitude: 7.15 },
        "Europe/Berlin"
      )
    ).toBeNull();

    expect(
      resolveGeoportalShadowHashSelection(
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
