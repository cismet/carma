import { describe, expect, it, vi } from "vitest";

import {
  getSharedThreeTerrainElevation,
  getSharedThreeTerrainElevations,
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

describe("shared terrain height batches", () => {
  it("dispatches once to a registered batch sampler and preserves scalar provider priority", () => {
    const map = {} as never,
      coordinates = new Float64Array([7, 51, 8, 52, 9, 53]);
    const scalar = vi.fn(() => 999);
    const batch = vi.fn((_coords: Float64Array, out?: Float64Array) => {
      out!.set([42, NaN, Infinity]);
      return out!;
    });
    const first = registerSharedThreeTerrainSampler(
      map,
      "batch",
      Object.assign(scalar, { sampleHeights: batch })
    );
    const fallback = vi.fn((longitude: number) =>
      longitude === 8 ? 0 : undefined
    );
    const second = registerSharedThreeTerrainSampler(map, "fallback", fallback);
    const out = new Float64Array(3).fill(99);
    expect(getSharedThreeTerrainElevations(map, coordinates, out)).toBe(out);
    expect([...out]).toEqual([42, 0, NaN]);
    expect(batch).toHaveBeenCalledOnce();
    expect(scalar).not.toHaveBeenCalled();
    expect(fallback.mock.calls.map(([longitude]) => longitude)).toEqual([8, 9]);
    first();
    second();
  });
  it("matches scalar fallback while retaining NaN for uncovered or invalid coordinates", () => {
    const map = {} as never;
    const unregister = registerSharedThreeTerrainSampler(
      map,
      "scalar",
      (lng, lat) => (lng < 8 ? lng + lat : undefined)
    );
    const coords = new Float64Array([7, 51, 8, 52, NaN, 53]);
    expect([...getSharedThreeTerrainElevations(map, coords)]).toEqual([
      getSharedThreeTerrainElevation(map, 7, 51),
      NaN,
      NaN,
    ]);
    unregister();
    expect([...getSharedThreeTerrainElevations(map, coords)]).toEqual([
      NaN,
      NaN,
      NaN,
    ]);
  });
  it("rejects incomplete coordinate pairs and mismatched output lengths", () => {
    const map = {} as never;
    expect(() =>
      getSharedThreeTerrainElevations(map, new Float64Array(3))
    ).toThrow(RangeError);
    expect(() =>
      getSharedThreeTerrainElevations(
        map,
        new Float64Array(4),
        new Float64Array(1)
      )
    ).toThrow(RangeError);
    expect(
      getSharedThreeTerrainElevations(map, new Float64Array())
    ).toHaveLength(0);
  });
});
