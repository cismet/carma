import { describe, expect, it, vi } from "vitest";
import {
  attachTerrainZoomBoundaryRefresh,
  crossesZoomBoundary,
} from "./terrain-zoom-boundary-rtt";

describe("crossesZoomBoundary", () => {
  it.each([
    [20.4, 20.9, false],
    [20.99, 21, true],
    [21, 20.99, true],
    [20.2, 22.5, true],
    [21, 21, false],
  ])("%s -> %s is %s", (from, to, expected) => {
    expect(crossesZoomBoundary(from, to)).toBe(expected);
  });

  it("knows fractional layer zooms", () => {
    expect(crossesZoomBoundary(20.2, 20.6, [20.5])).toBe(true);
    expect(crossesZoomBoundary(20.6, 20.8, [20.5])).toBe(false);
  });
});

describe("attachTerrainZoomBoundaryRefresh", () => {
  const fakeMap = (withTerrain: boolean) => {
    const handlers: Record<string, () => void> = {};
    let zoom = 20.5;
    const freeRtt = vi.fn();
    const map = {
      on: (type: string, fn: () => void) => (handlers[type] = fn),
      off: vi.fn(),
      getZoom: () => zoom,
      getLayersOrder: () => ["a"],
      getLayer: () => ({ minzoom: 19, maxzoom: 24 }),
      terrain: withTerrain ? { tileManager: { freeRtt } } : null,
    };
    const zoomTo = (z: number) => {
      zoom = z;
      handlers.zoom();
    };
    return { map, zoomTo, freeRtt, handlers };
  };

  it("frees the terrain texture cache once per crossed boundary", () => {
    const { map, zoomTo, freeRtt, handlers } = fakeMap(true);
    attachTerrainZoomBoundaryRefresh(map as never);
    handlers.styledata();
    zoomTo(20.9);
    expect(freeRtt).not.toHaveBeenCalled();
    zoomTo(21);
    zoomTo(21.4);
    expect(freeRtt).toHaveBeenCalledTimes(1);
  });

  it("does nothing without terrain", () => {
    const { map, zoomTo } = fakeMap(false);
    attachTerrainZoomBoundaryRefresh(map as never);
    expect(() => zoomTo(21)).not.toThrow();
  });
});
