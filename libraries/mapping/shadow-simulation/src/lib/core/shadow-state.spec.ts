import { describe, expect, it } from "vitest";

import { createInitialShadowSimulationState } from "./create-shadow-simulation-state";
import { resetShadowSimulationState } from "./shadow-state";

const initialState = createInitialShadowSimulationState(undefined);

describe("shadow state transitions", () => {
  it("resets transient display and animation state", () => {
    const state = resetShadowSimulationState({
      ...initialState,
      isAnimating: true,
      showProjectionDebugView: true,
      showMapStyleContent: false,
    });

    expect(state.isAnimating).toBe(false);
    expect(state.showProjectionDebugView).toBe(false);
    expect(state.showMapStyleContent).toBe(true);
  });
});
