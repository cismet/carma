import { describe, expect, it, vi } from "vitest";
import {
  MAX_HELD_DEM_TILES,
  installTerrainOverscaledDemKeeper,
} from "./terrain-overscaled-dem-keeper";

type FakeId = {
  key: string;
  overscaledZ: number;
  canonical: { z: number; x: number };
  scaledTo: (zoom: number) => FakeId;
};

const tileId = (overscaledZ: number, z: number, x = 0): FakeId => ({
  key: `${overscaledZ}/${z}/${x}`,
  overscaledZ,
  canonical: { z, x },
  scaledTo: (zoom) => tileId(zoom, Math.min(zoom, z), x),
});

class FakeTile {
  dem?: unknown;
  aborted?: boolean;
  constructor(public tileID: FakeId, public size: number) {}
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const setup = () => {
  const listeners = new Map<string, Set<() => void>>();
  const pending: Array<{ tile: FakeTile; finish: (ok: boolean) => void }> = [];
  const source = {
    minzoom: 5,
    maxzoom: 16,
    tileSize: 512,
    hasTile: vi.fn(() => true),
    loadTile: vi.fn(
      (tile: FakeTile) =>
        new Promise<void>((resolve, reject) => {
          pending.push({
            tile,
            finish: (ok) => {
              if (ok) {
                tile.dem = {};
                resolve();
              } else reject(new Error("404"));
            },
          });
        })
    ),
    abortTile: vi.fn(() => Promise.resolve()),
    unloadTile: vi.fn(() => Promise.resolve()),
  };
  const coarse = new FakeTile(tileId(5, 5), 512);
  coarse.dem = {};
  const fallback = vi.fn((): FakeTile | undefined => coarse);
  const manager = { tileManager: { _source: source }, getSourceTile: fallback };
  const map = {
    terrain: { tileManager: manager } as { tileManager: unknown } | null,
    triggerRepaint: vi.fn(),
    on: (type: string, listener: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(listener);
    },
    off: (type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener);
    },
    fire: (type: string) => {
      for (const listener of [...(listeners.get(type) ?? [])]) listener();
    },
  };
  const dispose = installTerrainOverscaledDemKeeper(map as never);
  const lookup = (id: FakeId, searchForDEM = true) =>
    (
      manager.getSourceTile as unknown as (
        id: FakeId,
        searchForDEM?: boolean
      ) => FakeTile | undefined
    )(id, searchForDEM);
  return { map, manager, source, coarse, fallback, pending, lookup, dispose };
};

describe("terrain DEM for overscaled tiles", () => {
  it("answers an overscaled tile with the DEM tile of its own zoom once loaded", async () => {
    const { source, coarse, pending, lookup, map } = setup();
    const kita = tileId(20, 14, 8519);

    expect(lookup(kita)).toBe(coarse);
    expect(source.loadTile).toHaveBeenCalledTimes(1);
    expect(pending[0].tile.tileID.key).toBe("14/14/8519");
    expect(pending[0].tile.size).toBe(512);

    // No second request while the first is on its way.
    expect(lookup(kita)).toBe(coarse);
    expect(source.loadTile).toHaveBeenCalledTimes(1);

    pending[0].finish(true);
    await settle();
    expect(map.triggerRepaint).toHaveBeenCalled();
    expect(lookup(kita)).toBe(pending[0].tile);
  });

  it("leaves tiles alone that MapLibre pairs correctly itself", () => {
    const { source, coarse, fallback, lookup } = setup();
    // Not overscaled.
    expect(lookup(tileId(14, 14))).toBe(coarse);
    // Own zoom at or above the DEM's last zoom.
    expect(lookup(tileId(20, 16))).toBe(coarse);
    // Below the DEM's first zoom.
    expect(lookup(tileId(8, 4))).toBe(coarse);
    // Not asked to search.
    expect(lookup(tileId(20, 14), false)).toBe(coarse);
    // MapLibre found the tile's own zoom.
    const own = new FakeTile(tileId(14, 14, 7), 512);
    own.dem = {};
    fallback.mockReturnValueOnce(own);
    expect(lookup(tileId(20, 14, 7))).toBe(own);
    // Outside the DEM's bounds.
    source.hasTile.mockReturnValueOnce(false);
    expect(lookup(tileId(20, 14, 9))).toBe(coarse);
    expect(source.loadTile).not.toHaveBeenCalled();
  });

  it("does not repeat a failed request on every lookup", async () => {
    const { source, coarse, pending, lookup } = setup();
    const id = tileId(20, 14, 3);
    lookup(id);
    pending[0].finish(false);
    await settle();
    expect(lookup(id)).toBe(coarse);
    expect(source.loadTile).toHaveBeenCalledTimes(1);
  });

  it("holds a bounded number of tiles and unloads the least recently used", async () => {
    const { source, pending, lookup } = setup();
    for (let x = 0; x <= MAX_HELD_DEM_TILES; x++) {
      lookup(tileId(20, 14, x));
      pending[x].finish(true);
      await settle();
    }
    expect(source.unloadTile).toHaveBeenCalledTimes(1);
    expect(source.unloadTile).toHaveBeenCalledWith(pending[0].tile);
  });

  it("hands the lookup back and frees its tiles when terrain goes", async () => {
    const { map, manager, source, fallback, pending, lookup } = setup();
    lookup(tileId(20, 14, 1));
    pending[0].finish(true);
    await settle();
    lookup(tileId(20, 14, 2));

    map.terrain = null;
    map.fire("terrain");
    expect(manager.getSourceTile).toBe(fallback);
    expect(source.unloadTile).toHaveBeenCalledWith(pending[0].tile);
    expect(source.abortTile).toHaveBeenCalledWith(pending[1].tile);
    expect(pending[1].tile.aborted).toBe(true);
  });
});
