import { describe, expect, it, vi } from "vitest";

import {
  getSharedThreeTerrainElevation,
  isSharedThreeTerrainLoading,
  notifySharedThreeTerrainChanged,
  registerSharedThreeTerrainSampler,
  subscribeSharedThreeTerrain,
  subscribeSharedThreeTerrainLoading,
  suppressMapLibreTerrainRendering,
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

  it("keeps MapLibre terrain off until the final suppression is released", () => {
    const terrainSpec = { source: "terrain", exaggeration: 1 };
    const handlers = new Map<string, Set<() => void>>();
    let terrain: typeof terrainSpec | null = terrainSpec;
    const map = {
      getTerrain: vi.fn(() => terrain),
      isStyleLoaded: vi.fn(() => true),
      setTerrain: vi.fn((next: typeof terrainSpec | null) => {
        terrain = next;
        for (const handler of handlers.get("terrain") ?? []) handler();
      }),
      on: vi.fn((event: string, handler: () => void) => {
        const eventHandlers = handlers.get(event) ?? new Set();
        eventHandlers.add(handler);
        handlers.set(event, eventHandlers);
      }),
      off: vi.fn((event: string, handler: () => void) => {
        handlers.get(event)?.delete(handler);
      }),
    };

    const releaseFirst = suppressMapLibreTerrainRendering(map as never);
    const releaseSecond = suppressMapLibreTerrainRendering(map as never);
    expect(terrain).toBeNull();

    map.setTerrain({ source: "other", exaggeration: 2 });
    expect(terrain).toBeNull();

    releaseFirst();
    expect(terrain).toBeNull();
    releaseSecond();
    expect(terrain).toEqual(terrainSpec);
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
