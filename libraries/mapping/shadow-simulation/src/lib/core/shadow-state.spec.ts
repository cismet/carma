import { describe, expect, it } from "vitest";

import { createInitialShadowSimulationState } from "./create-shadow-simulation-state";
import { resetShadowSimulationState } from "./shadow-state";
import {
  resolveShadowRenderQuality,
  SHADOW_BUFFER_FORMAT,
  SHADOW_BUFFER_LAYOUT,
} from "./shadow-types";

const initialState = createInitialShadowSimulationState(undefined);

describe("shadow state transitions", () => {
  it("defaults scene geometry diagnostics on inside a closed debug panel", () => {
    for (const state of [initialState, resetShadowSimulationState(initialState)]) {
      expect(state.showProjectionDebugView).toBe(false);
      expect(state.showTileBounds).toBe(true);
      expect(state.showSunDebugVector).toBe(true);
    }
  });
  it("resets transient display and animation state", () => {
    const state = resetShadowSimulationState({
      ...initialState,
      isAnimating: true,
      showProjectionDebugView: true,
      showDisplaySettings: true,
      showMapStyleContent: false,
    });

    expect(state.isAnimating).toBe(false);
    expect(state.showProjectionDebugView).toBe(false);
    expect(state.showDisplaySettings).toBe(false);
    expect(state.showMapStyleContent).toBe(true);
  });

  it("resets experimental render settings to automatic defaults", () => {
    const state = resetShadowSimulationState({
      ...initialState,
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
      shadowBufferFormat: SHADOW_BUFFER_FORMAT.SDR_8,
      shadowSunDiscSamples: 512,
      shadowMsaaSamples: 0,
    });
    expect(resolveShadowRenderQuality(state)).toEqual(
      resolveShadowRenderQuality()
    );
    expect(state.shadowBufferLayout).toBeUndefined();
    expect(state.shadowSunDiscSamples).toBeUndefined();
  });
});
