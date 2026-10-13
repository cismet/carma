// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  acquireMapLibreTerrainDemandPause,
  acquireMapLibreTerrainZoomLimit,
} from "./maplibre-terrain-demand";

const createManager = (paused?: boolean, type = "raster-dem") => {
  const manager = {
    _paused: paused,
    pause: vi.fn(() => {
      manager._paused = true;
    }),
    resume: vi.fn(() => {
      manager._paused = false;
    }),
    getSource: () => ({ type }),
  };
  return manager;
};

const createMap = (manager?: unknown) => {
  const listeners = new Map<
    string,
    Set<(event: { sourceId?: string }) => void>
  >();
  const map = {
    style: { tileManagers: { dem: manager } as Record<string, unknown> },
    on: vi.fn((name: string, handler: (event: { sourceId?: string }) => void) => {
      const handlers = listeners.get(name) ?? new Set();
      handlers.add(handler);
      listeners.set(name, handlers);
    }),
    off: vi.fn((name: string, handler: (event: { sourceId?: string }) => void) => {
      listeners.get(name)?.delete(handler);
    }),
    setTerrain: vi.fn(),
    jumpTo: vi.fn(),
  };
  return {
    map,
    emit(name: string, event: { sourceId?: string } = {}) {
      for (const listener of listeners.get(name) ?? []) listener(event);
    },
  };
};

describe("native MapLibre terrain demand pause", () => {
  it("pauses only demand and resumes after the last idempotent release", () => {
    const manager = createManager();
    const { map } = createMap(manager);
    const first = acquireMapLibreTerrainDemandPause(map as never, "dem");
    const second = acquireMapLibreTerrainDemandPause(map as never, "dem");
    expect(manager.pause).toHaveBeenCalledOnce();
    first();
    first();
    expect(manager.resume).not.toHaveBeenCalled();
    second();
    expect(manager.resume).toHaveBeenCalledOnce();
    expect(map.setTerrain).not.toHaveBeenCalled();
    expect(map.jumpTo).not.toHaveBeenCalled();
    expect(map.off).toHaveBeenCalledTimes(3);
  });

  it("preserves a pause held before this consumer arrived", () => {
    const manager = createManager(true);
    const { map } = createMap(manager);
    const release = acquireMapLibreTerrainDemandPause(map as never, "dem");
    release();
    expect(manager.pause).not.toHaveBeenCalled();
    expect(manager.resume).not.toHaveBeenCalled();
    expect(manager._paused).toBe(true);
  });

  it("gates a new style manager without resuming its stale predecessor", () => {
    const old = createManager(false);
    const replacement = createManager(false);
    const fixture = createMap(old);
    const release = acquireMapLibreTerrainDemandPause(
      fixture.map as never,
      "dem"
    );
    fixture.map.style.tileManagers.dem = replacement;
    fixture.emit("styledata");
    expect(replacement.pause).toHaveBeenCalledOnce();
    release();
    expect(old.resume).not.toHaveBeenCalled();
    expect(replacement.resume).toHaveBeenCalledOnce();
  });

  it("pauses a late source and re-applies the gate after its tiles reset", () => {
    const fixture = createMap();
    const release = acquireMapLibreTerrainDemandPause(
      fixture.map as never,
      "dem"
    );
    const manager = createManager(false);
    fixture.map.style.tileManagers.dem = manager;
    fixture.emit("sourcedata", { sourceId: "other" });
    expect(manager.pause).not.toHaveBeenCalled();
    fixture.emit("sourcedata", { sourceId: "dem" });
    expect(manager.pause).toHaveBeenCalledOnce();
    manager._paused = false;
    fixture.emit("sourcedata", { sourceId: "dem" });
    expect(manager.pause).toHaveBeenCalledTimes(2);
    release();
    expect(manager.resume).toHaveBeenCalledOnce();
  });

  it("keeps leases for different source managers independent", () => {
    const first = createManager(false);
    const second = createManager(false);
    const { map } = createMap(first);
    map.style.tileManagers.otherDem = second;
    const releaseFirst = acquireMapLibreTerrainDemandPause(map as never, "dem");
    const releaseSecond = acquireMapLibreTerrainDemandPause(
      map as never,
      "otherDem"
    );
    releaseFirst();
    expect(first.resume).toHaveBeenCalledOnce();
    expect(second.resume).not.toHaveBeenCalled();
    releaseSecond();
    expect(second.resume).toHaveBeenCalledOnce();
  });

  it("never resumes a removed source or map", () => {
    const removedSource = createManager(false);
    const sourceFixture = createMap(removedSource);
    const sourceRelease = acquireMapLibreTerrainDemandPause(
      sourceFixture.map as never,
      "dem"
    );
    delete sourceFixture.map.style.tileManagers.dem;
    sourceRelease();
    expect(removedSource.resume).not.toHaveBeenCalled();

    const removedMap = createManager(false);
    const mapFixture = createMap(removedMap);
    const mapRelease = acquireMapLibreTerrainDemandPause(
      mapFixture.map as never,
      "dem"
    );
    mapFixture.emit("remove");
    mapRelease();
    expect(removedMap.resume).not.toHaveBeenCalled();
    expect(mapFixture.map.off).toHaveBeenCalledTimes(3);
  });

  it("safely ignores unsupported manager shapes and non-DEM sources", () => {
    const raster = createManager(false, "raster");
    const fixtures = [
      createMap({ pause: vi.fn(), resume: vi.fn() }),
      createMap(raster),
      createMap({ ...createManager(false), _paused: "unknown" }),
      createMap({
        ...createManager(false),
        getSource: () => {
          throw new Error("removed");
        },
      }),
    ];
    for (const { map } of fixtures) {
      const release = acquireMapLibreTerrainDemandPause(map as never, "dem");
      expect(() => release()).not.toThrow();
    }
    expect(raster.pause).not.toHaveBeenCalled();
    expect(raster.resume).not.toHaveBeenCalled();
  });
});

const createZoomMap = (maximumZoom = 16) => {
  const fixture = createMap();
  let source = { type: "raster-dem", maxzoom: maximumZoom };
  const loadedTiles = { tile: { dem: new Uint8Array([1, 2, 3]) } };
  const mapping = {
    getSource: () => source,
    _sourceTileCache: { high: "dem-16" } as Record<string, string>,
    _tiles: loadedTiles,
    freeRtt: vi.fn(),
    tileManager: { clearTiles: vi.fn(), reload: vi.fn() },
  };
  const map = {
    ...fixture.map,
    getSource: vi.fn(() => source),
    terrain: { tileManager: mapping } as { tileManager: typeof mapping } | null,
    triggerRepaint: vi.fn(),
  };
  return {
    ...fixture,
    map,
    mapping,
    source,
    loadedTiles,
    replaceSource(next: typeof source) {
      source = next;
    },
  };
};

describe("native MapLibre terrain source zoom limit", () => {
  it("caps source demand and invalidates only its derived DEM lookup", () => {
    const fixture = createZoomMap();
    const previousMapping = fixture.mapping._sourceTileCache;
    const release = acquireMapLibreTerrainZoomLimit(fixture.map as never, "dem");
    expect(fixture.source.maxzoom).toBe(13);
    expect(fixture.mapping._sourceTileCache).toEqual({});
    expect(fixture.mapping._sourceTileCache).not.toBe(previousMapping);
    expect(fixture.mapping._tiles).toBe(fixture.loadedTiles);
    expect(fixture.mapping.tileManager.clearTiles).not.toHaveBeenCalled();
    expect(fixture.mapping.tileManager.reload).not.toHaveBeenCalled();
    expect(fixture.mapping.freeRtt).not.toHaveBeenCalled();
    expect(fixture.map.setTerrain).not.toHaveBeenCalled();
    expect(fixture.map.jumpTo).not.toHaveBeenCalled();
    release();
    expect(fixture.source.maxzoom).toBe(16);
    expect(fixture.map.triggerRepaint).toHaveBeenCalledTimes(2);
    expect(fixture.mapping._tiles).toBe(fixture.loadedTiles);
  });

  it("applies the strongest active cap and restores the exact original limit", () => {
    const fixture = createZoomMap(15);
    const first = acquireMapLibreTerrainZoomLimit(fixture.map as never, "dem", 13);
    const second = acquireMapLibreTerrainZoomLimit(fixture.map as never, "dem", 12);
    expect(fixture.source.maxzoom).toBe(12);
    second();
    second();
    expect(fixture.source.maxzoom).toBe(13);
    first();
    expect(fixture.source.maxzoom).toBe(15);
  });

  it("adopts a TileJSON maxzoom update and gates a replacement source", () => {
    const fixture = createZoomMap();
    const release = acquireMapLibreTerrainZoomLimit(fixture.map as never, "dem");
    fixture.source.maxzoom = 18;
    fixture.emit("sourcedata", { sourceId: "dem" });
    expect(fixture.source.maxzoom).toBe(13);
    const replacement = { type: "raster-dem", maxzoom: 17 };
    fixture.replaceSource(replacement);
    fixture.mapping._sourceTileCache = { next: "dem-17" };
    fixture.emit("styledata");
    expect(replacement.maxzoom).toBe(13);
    expect(fixture.mapping._sourceTileCache).toEqual({});
    release();
    expect(replacement.maxzoom).toBe(17);
    // The detached source is not made active again or reloaded.
    expect(fixture.source.maxzoom).toBe(13);
    expect(fixture.mapping.tileManager.reload).not.toHaveBeenCalled();
  });

  it("retains a lower authored limit and later external changes", () => {
    const lower = createZoomMap(11);
    const lowerRelease = acquireMapLibreTerrainZoomLimit(lower.map as never, "dem");
    expect(lower.source.maxzoom).toBe(11);
    expect(lower.map.triggerRepaint).not.toHaveBeenCalled();
    lowerRelease();
    expect(lower.source.maxzoom).toBe(11);

    const changed = createZoomMap();
    const release = acquireMapLibreTerrainZoomLimit(changed.map as never, "dem");
    changed.source.maxzoom = 12;
    release();
    expect(changed.source.maxzoom).toBe(12);
  });

  it("waits for the terrain and restores its source if terrain is detached first", () => {
    const fixture = createZoomMap();
    const terrain = fixture.map.terrain;
    fixture.map.terrain = null;
    const release = acquireMapLibreTerrainZoomLimit(fixture.map as never, "dem");
    expect(fixture.source.maxzoom).toBe(16);
    fixture.map.terrain = terrain;
    fixture.emit("terrain");
    expect(fixture.source.maxzoom).toBe(13);
    fixture.map.terrain = null;
    release();
    expect(fixture.source.maxzoom).toBe(16);
  });

  it("never restores removed maps or writes unsupported derivative shapes", () => {
    const removed = createZoomMap();
    const release = acquireMapLibreTerrainZoomLimit(removed.map as never, "dem");
    removed.emit("remove");
    release();
    expect(removed.source.maxzoom).toBe(13);
    expect(removed.map.off).toHaveBeenCalledTimes(4);

    const unsupported = createZoomMap();
    Object.defineProperty(unsupported.mapping, "_sourceTileCache", {
      writable: false,
    });
    const skip = acquireMapLibreTerrainZoomLimit(unsupported.map as never, "dem");
    expect(unsupported.source.maxzoom).toBe(16);
    skip();
    expect(unsupported.map.triggerRepaint).not.toHaveBeenCalled();
  });
});
