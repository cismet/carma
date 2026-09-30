import type { Map as MaplibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";
import {
  getTiles3dRuntimeHandles,
  registerTiles3dRuntimeHandle,
  subscribeTiles3dRuntimeHandles,
  unregisterTiles3dRuntimeHandle,
} from "./tiles3d-runtime-handles";
import type { ThreeTilesRuntime } from "./three-tiles-runtime-types";

describe("tiles3d runtime handles", () => {
  it("publishes stable snapshots per map and notifies subscribers", () => {
    const map = {} as MaplibreMap;
    const other = {} as MaplibreMap;
    const mesh = { scene: { id: "mesh" } } as unknown as ThreeTilesRuntime;
    const lod2 = { scene: { id: "lod2" } } as unknown as ThreeTilesRuntime;
    const listener = vi.fn();
    const unsubscribe = subscribeTiles3dRuntimeHandles(map, listener);
    const empty = getTiles3dRuntimeHandles(map);
    expect(empty).toEqual([]);
    expect(getTiles3dRuntimeHandles(map)).toBe(empty);

    registerTiles3dRuntimeHandle(map, "mesh", mesh);
    expect(listener).toHaveBeenCalledTimes(1);
    const one = getTiles3dRuntimeHandles(map);
    expect(one).toEqual([mesh]);
    expect(getTiles3dRuntimeHandles(map)).toBe(one);
    expect(getTiles3dRuntimeHandles(other)).toEqual([]);
    // Registering the same handle again is not a change.
    registerTiles3dRuntimeHandle(map, "mesh", mesh);
    expect(listener).toHaveBeenCalledTimes(1);

    registerTiles3dRuntimeHandle(map, "lod2", lod2);
    expect(getTiles3dRuntimeHandles(map)).toEqual([mesh, lod2]);
    unregisterTiles3dRuntimeHandle(map, "mesh");
    expect(getTiles3dRuntimeHandles(map)).toEqual([lod2]);
    expect(listener).toHaveBeenCalledTimes(3);
    unregisterTiles3dRuntimeHandle(map, "mesh");
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    unregisterTiles3dRuntimeHandle(map, "lod2");
    expect(listener).toHaveBeenCalledTimes(3);
    expect(getTiles3dRuntimeHandles(map)).toEqual([]);
  });
});
