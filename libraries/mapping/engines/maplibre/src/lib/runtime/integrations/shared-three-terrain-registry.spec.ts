import { describe, expect, it, vi } from "vitest";

import {
  getSharedThreeTerrainElevation,
  isSharedThreeTerrainLoading,
  notifySharedThreeTerrainChanged,
  registerSharedThreeTerrainSampler,
  subscribeSharedThreeTerrain,
  subscribeSharedThreeTerrainLoading,
  setSharedThreeTerrainLoading,
} from "./shared-three-terrain-registry";

describe("shared Three terrain registry", () => {
  it("samples registered decoded terrain and notifies consumers", () => {
    const map = {} as never;
    const listener = vi.fn();
    const unsubscribe = subscribeSharedThreeTerrain(map, listener);
    const unregister = registerSharedThreeTerrainSampler(
      map,
      "terrain",
      () => 157.25
    );

    expect(getSharedThreeTerrainElevation(map, 7.15, 51.25)).toBe(157.25);
    expect(listener).toHaveBeenCalledOnce();

    notifySharedThreeTerrainChanged(map);
    expect(listener).toHaveBeenCalledTimes(2);

    unregister();
    expect(getSharedThreeTerrainElevation(map, 7.15, 51.25)).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });

  it("tracks terrain loading independently for every runtime", () => {
    const map = {} as never;
    const listener = vi.fn();
    const unsubscribe = subscribeSharedThreeTerrainLoading(map, listener);

    setSharedThreeTerrainLoading(map, "terrain-a", true);
    setSharedThreeTerrainLoading(map, "terrain-b", true);
    expect(isSharedThreeTerrainLoading(map)).toBe(true);

    setSharedThreeTerrainLoading(map, "terrain-a", false);
    expect(isSharedThreeTerrainLoading(map)).toBe(true);
    setSharedThreeTerrainLoading(map, "terrain-b", false);
    expect(isSharedThreeTerrainLoading(map)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(4);
    unsubscribe();
  });
});
