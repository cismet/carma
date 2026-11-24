import { describe, expect, it, vi } from "vitest";
import type maplibregl from "maplibre-gl";

import { installTerrainDrapeTransitionRefresh } from "./terrain-drape-transition-refresh";

const fakeMap = (state: { terrain: boolean; transitioning: boolean }) => {
  const freeRtt = vi.fn();
  let onRender = () => {};
  const map = {
    on: (_event: string, handler: () => void) => {
      onRender = handler;
    },
    get terrain() {
      return state.terrain ? { tileManager: { freeRtt } } : null;
    },
    style: { hasTransitions: () => state.transitioning },
  };
  installTerrainDrapeTransitionRefresh(map as unknown as maplibregl.Map);
  return { freeRtt, render: () => onRender() };
};

describe("installTerrainDrapeTransitionRefresh", () => {
  it("frees the draped textures only while a transition runs on terrain", () => {
    const state = { terrain: true, transitioning: true };
    const { freeRtt, render } = fakeMap(state);

    render();
    expect(freeRtt).toHaveBeenCalledTimes(1);

    state.transitioning = false;
    render();
    expect(freeRtt).toHaveBeenCalledTimes(1);

    state.transitioning = true;
    state.terrain = false;
    render();
    expect(freeRtt).toHaveBeenCalledTimes(1);
  });
});
