import { describe, expect, it } from "vitest";

import {
  createInitialShadowDateState,
  createInitialShadowSimulationState,
  selectShadowQualityPreset,
} from "./create-shadow-simulation-state";
import { DEFAULT_SHADOW_SIMULATION_LOCATION } from "./solar-position";
import { SHADOW_BUFFER_LAYOUT } from "./shadow-types";

describe("initial shadow states", () => {
  it("resets manual quality overrides while keeping the selected buffer layout", () => {
    const previous = {
      ...createInitialShadowSimulationState(undefined),
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
      shadowMsaaSamples: 8 as const,
      shadowSunDiscSamples: 32 as const,
      shadowGroundTexelFit: false,
      terrainSourceId: "dem",
    };
    const next = selectShadowQualityPreset(previous, 256);
    expect(next).toMatchObject({
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
      shadowQuality: 256,
      meshErrorTarget: 0.25,
      terrainSourceId: "dem",
      showMapStyleContent: true,
    });
    expect(next.shadowMsaaSamples).toBeUndefined();
    expect(next.shadowSunDiscSamples).toBeUndefined();
    expect(next.shadowGroundTexelFit).toBeUndefined();
    expect(previous.shadowMsaaSamples).toBe(8);
  });
  it("builds stable independent defaults", () => {
    const state = createInitialShadowSimulationState(undefined);
    const dateState = createInitialShadowDateState(
      undefined,
      DEFAULT_SHADOW_SIMULATION_LOCATION,
      new Date("2026-06-21T10:00:00.000Z")
    );

    expect(state.enabled).toBe(false);
    expect(state.buildingColorMix).toBe(0);
    expect(state.meshTextureColorCorrection).toBe(true);
    expect(state.meshCacheBudgetBytes).toBe(24 * 1024 ** 3);
    expect(state.showDisplaySettings).toBe(false);
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
