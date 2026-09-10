import { describe, expect, it, vi } from "vitest";

import {
  getTileBounds,
  terrainTileKey,
} from "./raster-dem-tile";
import type { TerrainSelectionEntry } from "./terrain-selection";
import {
  planTerrainIdlePrefetch,
  planTerrainIdleShadowRegion,
  TERRAIN_IDLE_SHADOW_REASON,
  type TerrainIdlePrefetchInput,
  type TerrainIdleShadowPlanInput,
} from "./terrain-idle-prefetch";

const entry = (level: number, x: number, y: number): TerrainSelectionEntry => ({
  id: { level, x, y },
  kind: "source",
});
const visible = entry(5, 16, 12);
const input = (
  overrides: Partial<TerrainIdlePrefetchInput> = {}
): TerrainIdlePrefetchInput => ({
  visibleEntries: [visible],
  requiredEntries: [visible],
  source: {
    bounds: { west: -180, south: -85, east: 180, north: 85 },
    minzoom: 0,
    maxzoom: 18,
  },
  viewportBounds: getTileBounds(visible.id),
  ...overrides,
});
const keys = (entries: readonly TerrainSelectionEntry[]) =>
  entries.map(({ id }) => terrainTileKey(id));

describe("terrain idle shadow coverage planning", () => {
  const candidate = entry(4, 8, 6);
  const planInput = (
    overrides: Partial<TerrainIdleShadowPlanInput> = {}
  ): TerrainIdleShadowPlanInput => ({
    casterBounds: getTileBounds(candidate.id),
    terrainLevel: candidate.id.level,
    source: input().source,
    activeTiles: [],
    isAvailable: () => true,
    ...overrides,
  });

  it("loads an exact target-LOD corridor in deterministic grid order", () => {
    const topLeft = getTileBounds(entry(4, 7, 5).id);
    const bottomRight = getTileBounds(entry(4, 8, 6).id);
    const plan = planTerrainIdleShadowRegion(
      planInput({
        casterBounds: {
          ...topLeft,
          east: bottomRight.east,
          south: bottomRight.south,
        },
      })
    );
    expect(plan.reason).toBeUndefined();
    expect(keys(plan.entries)).toEqual(["4/7/5", "4/8/5", "4/7/6", "4/8/6"]);
  });

  it("rejects excessive corridors before enumerating or probing tiles", () => {
    const isAvailable = vi.fn(() => true);
    const plan = planTerrainIdleShadowRegion(
      planInput({
        terrainLevel: 30,
        source: { ...input().source, maxzoom: 30 },
        casterBounds: input().source.bounds,
        isAvailable,
      })
    );
    expect(plan).toEqual({
      entries: [],
      reason: TERRAIN_IDLE_SHADOW_REASON.budget,
    });
    expect(isAvailable).not.toHaveBeenCalled();
  });

  it("refuses unsupported levels and a corridor outside regional source bounds", () => {
    const bounds = getTileBounds(candidate.id);
    expect(
      planTerrainIdleShadowRegion(planInput({ terrainLevel: 19 })).reason
    ).toBe(TERRAIN_IDLE_SHADOW_REASON.unavailable);
    expect(
      planTerrainIdleShadowRegion(
        planInput({
          source: {
            ...input().source,
            bounds: { ...bounds, west: bounds.west + 0.1 },
          },
        })
      ).reason
    ).toBe(TERRAIN_IDLE_SHADOW_REASON.unavailable);
  });

  it("never silently wraps an antimeridian corridor or clamps a polar footprint", () => {
    for (const casterBounds of [
      { west: 179, east: -179, south: 10, north: 11 },
      { west: -181, east: -179, south: 10, north: 11 },
      { west: 10, east: 11, south: 85, north: 90 },
    ]) {
      expect(
        planTerrainIdleShadowRegion(planInput({ casterBounds })).reason
      ).toBe(TERRAIN_IDLE_SHADOW_REASON.unavailable);
    }
  });

  it("reuses an equal/coarser complete active tile without loading an overlay", () => {
    for (const id of [candidate.id, entry(3, 4, 3).id]) {
      const isAvailable = vi.fn(() => false);
      expect(
        planTerrainIdleShadowRegion(
          planInput({
            activeTiles: [{ id, complete: true }],
            isAvailable,
          })
        )
      ).toEqual({ entries: [] });
      expect(isAvailable).not.toHaveBeenCalled();
    }
  });

  it("accepts a complete fine cut but rejects a partial finer overlap", () => {
    const children = [
      entry(5, 16, 12),
      entry(5, 17, 12),
      entry(5, 16, 13),
      entry(5, 17, 13),
    ];
    const activeTiles = children.map(({ id }) => ({ id, complete: true }));
    expect(planTerrainIdleShadowRegion(planInput({ activeTiles }))).toEqual({
      entries: [],
    });
    expect(
      planTerrainIdleShadowRegion(
        planInput({ activeTiles: activeTiles.slice(1) })
      )
    ).toEqual({ entries: [], reason: TERRAIN_IDLE_SHADOW_REASON.overlap });
    // Duplicate/nested entries cannot make a partially covered tile look full.
    expect(
      planTerrainIdleShadowRegion(
        planInput({
          activeTiles: [
            activeTiles[0],
            activeTiles[0],
            { id: entry(6, 32, 24).id, complete: true },
          ],
        })
      ).reason
    ).toBe(TERRAIN_IDLE_SHADOW_REASON.overlap);
  });

  it("refuses incomplete active terrain and unavailable dependencies", () => {
    expect(
      planTerrainIdleShadowRegion(
        planInput({
          activeTiles: [{ id: candidate.id, complete: false }],
        })
      ).reason
    ).toBe(TERRAIN_IDLE_SHADOW_REASON.missing);
    for (const isAvailable of [
      () => false,
      () => {
        throw new Error("source unavailable");
      },
    ]) {
      expect(
        planTerrainIdleShadowRegion(planInput({ isAvailable })).reason
      ).toBe(TERRAIN_IDLE_SHADOW_REASON.missing);
    }
  });
});

describe("terrain idle prefetch planning", () => {
  it("returns no work for an empty visible cut or zero budget", () => {
    expect(planTerrainIdlePrefetch(input({ visibleEntries: [] }))).toEqual([]);
    expect(planTerrainIdlePrefetch(input({ maximumTiles: 0 }))).toEqual([]);
  });

  it("plans exactly the eight parent neighbours, one LOD coarser", () => {
    const planned = planTerrainIdlePrefetch(input());
    expect(keys(planned).sort()).toEqual([
      "4/7/5",
      "4/7/6",
      "4/7/7",
      "4/8/5",
      "4/8/7",
      "4/9/5",
      "4/9/6",
      "4/9/7",
    ]);
    expect(planned.every(({ kind }) => kind === "source")).toBe(true);
  });

  it("deduplicates shared parents and never recursively expands neighbours", () => {
    const siblings = [visible, entry(5, 17, 12), visible];
    expect(
      planTerrainIdlePrefetch(
        input({ visibleEntries: siblings, requiredEntries: siblings })
      )
    ).toEqual(planTerrainIdlePrefetch(input()));
  });

  it("excludes cached tiles and all overlaps with required receiver/caster tiles", () => {
    const requiredEntries = [
      visible,
      entry(4, 7, 5),
      entry(5, 18, 10),
      entry(3, 3, 3),
    ];
    expect(
      keys(
        planTerrainIdlePrefetch(
          input({
            requiredEntries,
            cachedTileKeys: new Set(["4/8/5"]),
          })
        )
      ).sort()
    ).toEqual(["4/8/7", "4/9/6", "4/9/7"]);
  });

  it("does not seed expansion from offscreen required caster entries", () => {
    expect(
      planTerrainIdlePrefetch(
        input({ requiredEntries: [visible, entry(5, 28, 20)] })
      )
    ).toEqual(planTerrainIdlePrefetch(input()));
  });

  it("keeps mixed visible LODs exactly one level coarser per seed", () => {
    const visibleEntries = [visible, entry(6, 48, 32)];
    const planned = planTerrainIdlePrefetch(
      input({ visibleEntries, requiredEntries: visibleEntries })
    );
    expect(new Set(planned.map(({ id }) => id.level))).toEqual(new Set([4, 5]));
    expect(planned).toHaveLength(16);
  });

  it.each([
    [5, 18],
    [0, 3],
  ])("respects source levels %s through %s", (minzoom, maxzoom) => {
    expect(
      planTerrainIdlePrefetch(
        input({ source: { ...input().source, minzoom, maxzoom } })
      )
    ).toEqual([]);
  });

  it("clips neighbours to source bounds and excludes edge-only contact", () => {
    expect(
      planTerrainIdlePrefetch(
        input({
          source: {
            ...input().source,
            bounds: getTileBounds(entry(4, 8, 6).id),
          },
        })
      )
    ).toEqual([]);
  });

  it("wraps longitude at the global edge but never wraps the north pole", () => {
    const edge = entry(4, 0, 0);
    expect(
      keys(
        planTerrainIdlePrefetch(
          input({
            visibleEntries: [edge],
            requiredEntries: [edge],
            viewportBounds: getTileBounds(edge.id),
          })
        )
      ).sort()
    ).toEqual(["3/0/1", "3/1/0", "3/1/1", "3/7/0", "3/7/1"]);
  });

  it("skips wrapped candidates outside a regional source", () => {
    const edge = entry(5, 31, 12);
    const planned = planTerrainIdlePrefetch(
      input({
        visibleEntries: [edge],
        requiredEntries: [edge],
        viewportBounds: getTileBounds(edge.id),
        source: {
          ...input().source,
          bounds: { west: 160, south: -85, east: 180, north: 85 },
        },
      })
    );
    expect(keys(planned).sort()).toEqual(["4/15/5", "4/15/7"]);
  });

  it("supports an antimeridian source and ranks across the longitude seam", () => {
    const edge = entry(5, 31, 12);
    const latitudeBounds = getTileBounds(entry(4, 0, 6).id);
    const planned = planTerrainIdlePrefetch(
      input({
        visibleEntries: [edge],
        requiredEntries: [edge],
        viewportBounds: { ...latitudeBounds, west: 179, east: -160 },
        source: {
          ...input().source,
          bounds: { west: 170, south: -85, east: -170, north: 85 },
        },
      })
    );
    expect(keys(planned).sort()).toEqual([
      "4/0/5",
      "4/0/6",
      "4/0/7",
      "4/15/5",
      "4/15/7",
    ]);
    expect(terrainTileKey(planned[0].id)).toBe("4/0/6");
  });

  it("never requests an invalid ancestor below level zero", () => {
    const root = entry(0, 0, 0);
    expect(
      planTerrainIdlePrefetch(
        input({ visibleEntries: [root], requiredEntries: [root] })
      )
    ).toEqual([]);
  });

  it("hard-caps at 16 nearest tiles with deterministic input-order-independent ties", () => {
    const visibleEntries = [
      entry(7, 64, 64),
      entry(7, 80, 64),
      entry(7, 64, 80),
      entry(7, 80, 80),
    ];
    const snapshot = input({
      visibleEntries,
      requiredEntries: visibleEntries,
      viewportBounds: getTileBounds(visibleEntries[0].id),
    });
    const planned = planTerrainIdlePrefetch(snapshot);
    expect(planned).toHaveLength(16);
    expect(planTerrainIdlePrefetch({ ...snapshot, maximumTiles: 100 })).toEqual(
      planned
    );
    expect(
      planTerrainIdlePrefetch({
        ...snapshot,
        visibleEntries: [...visibleEntries].reverse(),
      })
    ).toEqual(planned);
    expect(planTerrainIdlePrefetch({ ...snapshot, maximumTiles: 3 })).toEqual(
      planned.slice(0, 3)
    );
    expect(
      planTerrainIdlePrefetch({
        ...snapshot,
        viewportBounds: getTileBounds(visibleEntries[3].id),
        maximumTiles: 3,
      })
    ).not.toEqual(planned.slice(0, 3));
  });

  it("does not mutate the selection snapshot or resident cache keys", () => {
    const cachedTileKeys = new Set(["4/8/5"]);
    const visibleEntries = Object.freeze([
      Object.freeze({ kind: "source" as const, id: Object.freeze(visible.id) }),
    ]);
    const snapshot = Object.freeze(
      input({ visibleEntries, requiredEntries: visibleEntries, cachedTileKeys })
    );
    expect(planTerrainIdlePrefetch(snapshot)).toHaveLength(7);
    expect([...cachedTileKeys]).toEqual(["4/8/5"]);
    expect(snapshot.visibleEntries).toBe(visibleEntries);
  });
});
