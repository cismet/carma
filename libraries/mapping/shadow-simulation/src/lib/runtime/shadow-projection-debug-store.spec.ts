import type { Map as MaplibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";

import {
  hasShadowProjectionDebugListeners,
  publishShadowProjectionDebugSnapshot,
  readShadowProjectionDebugSnapshot,
  subscribeShadowProjectionDebugDemand,
  subscribeShadowProjectionDebugSnapshot,
  type ShadowProjectionDebugSnapshot,
} from "./shadow-projection-debug-store";

describe("lazy projection debug demand", () => {
  it("captures on actual subscription and releases the snapshot on last close", () => {
    const map = {} as MaplibreMap;
    const demand = vi.fn();
    const stop = subscribeShadowProjectionDebugDemand(map, demand);
    const snapshot = { sunDiscSamples: 512 } as ShadowProjectionDebugSnapshot;
    publishShadowProjectionDebugSnapshot(map, snapshot);
    expect(demand).not.toHaveBeenCalled();
    expect(readShadowProjectionDebugSnapshot(map)).toBeNull();
    const first = subscribeShadowProjectionDebugSnapshot(map, vi.fn());
    const second = subscribeShadowProjectionDebugSnapshot(map, vi.fn());
    expect(demand).toHaveBeenCalledOnce();
    expect(demand).toHaveBeenCalledWith(true);
    publishShadowProjectionDebugSnapshot(map, snapshot);
    expect(readShadowProjectionDebugSnapshot(map)).toBe(snapshot);
    first();
    expect(hasShadowProjectionDebugListeners(map)).toBe(true);
    second();
    expect(demand.mock.calls).toEqual([[true], [false]]);
    expect(readShadowProjectionDebugSnapshot(map)).toBeNull();
    const reopen = subscribeShadowProjectionDebugSnapshot(map, vi.fn());
    expect(demand.mock.calls).toEqual([[true], [false], [true]]);
    reopen();
    stop();
  });

  it("notifies a late scene producer when the lazy panel is already open", () => {
    const map = {} as MaplibreMap;
    const close = subscribeShadowProjectionDebugSnapshot(map, vi.fn());
    const demand = vi.fn();
    const stop = subscribeShadowProjectionDebugDemand(map, demand);
    expect(demand).toHaveBeenCalledOnce();
    expect(demand).toHaveBeenCalledWith(true);
    stop();
    close();
    expect(demand).toHaveBeenCalledTimes(1);
  });
});
