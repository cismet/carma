// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";
import { OrthographicCamera } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TILE_REQUEST_NEED } from "../../core/tile-request-need";
import { mesh } from "../../core/mesh-tile-test-fixtures";
import { createThreeTilesRuntimeState } from "./three-tiles-runtime-state";
import { createThreeTilesPayloadQueues } from "./three-tiles-runtime-payload-queues";
import { makeRoomForThreeTilesRequest } from "./three-tiles-runtime-request-capacity";
import type { RuntimeTile } from "./three-tiles-runtime-types";

vi.hoisted(() =>
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:capacity-test",
  })
);
afterEach(() => vi.restoreAllMocks());

const fixture = () => {
  const state = createThreeTilesRuntimeState("mesh", "mesh.json", [7, 51], {
    providesTerrain: true,
  });
  state.tiles = new TilesRenderer();
  const removed: RuntimeTile[] = [];
  const priorities = new Map<RuntimeTile, number>();
  const reasons = new Map<
    RuntimeTile,
    (typeof TILE_REQUEST_NEED)[keyof typeof TILE_REQUEST_NEED]
  >();
  const coverage = new Set<RuntimeTile>();
  let free = false;
  vi.spyOn(state.tiles.lruCache, "isFull").mockImplementation(() => !free);
  vi.spyOn(state.tiles.lruCache, "remove").mockImplementation((tile) => {
    removed.push(tile as RuntimeTile);
    state.tiles!.loadingTiles.delete(tile);
    free = true;
    return true;
  });
  const dependencies = {
    resetMeshCameraObjectives: vi.fn(),
    getTileRequestPriority: (tile: RuntimeTile) => priorities.get(tile) ?? 1,
    getTileRequestNeed: (tile: RuntimeTile) =>
      reasons.get(tile) ?? TILE_REQUEST_NEED.CAMERA,
    isTileRequestNeeded: () => true,
    isTileNeededForMeshCoverage: (tile: RuntimeTile) => coverage.has(tile),
    recordTileRequestDecision: vi.fn(),
    getTileObserverDemand: () => ({ intersects: true, errorPixels: 24 }),
  };
  const candidate = (benefit: number, group = mesh()) => {
    const tile = mesh() as RuntimeTile;
    tile.internal.loadingState = 1;
    tile.meshRefinement = {
      group,
      benefit,
      errorBand: 1,
      currentErrorPixels: 24,
      nextErrorPixels: 12,
      visibleAreaPixels: 1,
      provisional: false,
    };
    state.tiles!.loadingTiles.add(tile);
    return tile;
  };
  return {
    state,
    removed,
    priorities,
    reasons,
    coverage,
    candidate,
    makeRoom: (tile: RuntimeTile) =>
      makeRoomForThreeTilesRequest(state, dependencies, tile),
    fillAgain: () => {
      free = false;
    },
  };
};

describe("current-camera reservation capacity", () => {
  it.each([false, true])(
    "refreshes capacity candidates before ordering by band and benefit (same band=%s)",
    (sameBand) => {
      const state = createThreeTilesRuntimeState("mesh", "mesh.json", [7, 51], {
        providesTerrain: true,
      });
      state.tiles = new TilesRenderer();
      const strong = mesh() as RuntimeTile;
      const weak = mesh() as RuntimeTile;
      const published = mesh() as RuntimeTile;
      const freshObjectives = new Map([
        [
          strong,
          {
            group: strong,
            currentErrorPixels: 24,
            nextErrorPixels: 12,
            visibleAreaPixels: 1,
            benefit: sameBand ? 1000 : 1,
            errorBand: sameBand ? 1 : 2,
            provisional: false,
          },
        ],
        [
          weak,
          {
            group: weak,
            currentErrorPixels: 24,
            nextErrorPixels: 12,
            visibleAreaPixels: 1,
            benefit: sameBand ? 1 : 1000,
            errorBand: 1,
            provisional: false,
          },
        ],
      ]);
      strong.meshRefinement = {
        ...freshObjectives.get(strong)!,
        benefit: 0,
        errorBand: 0,
      };
      weak.meshRefinement = {
        ...freshObjectives.get(weak)!,
        benefit: 10000,
        errorBand: 99,
      };
      for (const tile of [strong, weak, published]) {
        tile.internal.loadingState = 1;
        state.tiles.loadingTiles.add(tile);
      }
      state.committedMeshCasterFrontier.add(published);
      const removed: RuntimeTile[] = [];
      vi.spyOn(state.tiles.lruCache, "isFull").mockImplementation(
        () => removed.length === 0
      );
      vi.spyOn(state.tiles.lruCache, "remove").mockImplementation((tile) => {
        removed.push(tile as RuntimeTile);
        return true;
      });
      let fresh = false;
      const resetMeshCameraObjectives = vi.fn(() => {
        fresh = true;
      });
      const queues = createThreeTilesPayloadQueues(state, {
        getTileDebugProgress: () => undefined!,
        recordTileRequestDecision: vi.fn(),
        resetMeshCameraObjectives,
        getTileRequestPriority: (tile) => {
          expect(fresh).toBe(true);
          tile.meshRefinement = freshObjectives.get(tile);
          return freshObjectives.has(tile) ? 1 : 4;
        },
        getTileObserverDemand: () => ({ intersects: true, errorPixels: 24 }),
        getTileScreenError: () => 24,
        isTileNeededForMeshCoverage: () => false,
        getRetainedMeshAncestors: () => new Set(),
        isTileRequestNeeded: () => true,
        getTileRequestNeed: () => TILE_REQUEST_NEED.CAMERA,
        noteTileActivity: vi.fn(),
      });
      try {
        queues.makeRoomForRequest(mesh());
        expect(resetMeshCameraObjectives).toHaveBeenCalledOnce();
        expect(removed).toEqual([weak]);
        expect(state.committedMeshCasterFrontier.has(published)).toBe(true);
      } finally {
        vi.restoreAllMocks();
        queues.dispose();
        state.tiles.dispose();
      }
    }
  );

  it.each([
    TILE_REQUEST_NEED.CAMERA,
    TILE_REQUEST_NEED.SHADOW,
    TILE_REQUEST_NEED.SUPPORT,
  ])(
    "admits stronger %s work without a viewport hole and stops after one freed reservation",
    (reason) => {
      const f = fixture();
      const weak = f.candidate(1),
        other = f.candidate(2),
        requester = f.candidate(10);
      f.state.tiles!.loadingTiles.delete(requester);
      f.reasons.set(requester, reason);
      f.makeRoom(requester);
      expect(f.removed).toEqual([weak]);
      expect(f.state.tiles!.loadingTiles.has(other)).toBe(true);
      // Reversing arrival order cannot make the displaced weaker job evict the
      // stronger reservation and loop through abort/download cycles.
      f.state.tiles!.loadingTiles.add(requester);
      f.fillAgain();
      f.makeRoom(weak);
      expect(f.removed).toEqual([weak]);
      f.state.tiles!.dispose();
    }
  );

  it("does not reclaim for idle/history demand or a marginal improvement", () => {
    const f = fixture();
    f.candidate(100);
    const requester = f.candidate(125);
    f.state.tiles!.loadingTiles.delete(requester);
    f.makeRoom(requester);
    expect(f.removed).toEqual([]);
    requester.meshRefinement = { ...requester.meshRefinement!, benefit: 1000 };
    for (const reason of [
      TILE_REQUEST_NEED.IDLE,
      TILE_REQUEST_NEED.SHADOW_HISTORY,
    ]) {
      f.reasons.set(requester, reason);
      f.makeRoom(requester);
    }
    expect(f.removed).toEqual([]);
    f.state.tiles!.dispose();
  });

  it("preserves a shadow family before its camera objective is available", () => {
    const f = fixture();
    f.state.shadowView = {
      camera: new OrthographicCamera(),
      shadowMapSize: { width: 1024, height: 1024 },
    };
    f.state.meshCoverageRecovery = true;
    const published = mesh();
    const metadata = mesh();
    metadata.internal.hasRenderableContent = false;
    metadata.parent = published;
    const requester = f.candidate(1000),
      sibling = f.candidate(1);
    requester.parent = sibling.parent = metadata;
    requester.meshRefinement = sibling.meshRefinement = undefined;
    f.priorities.set(requester, 4);
    f.coverage.add(requester);
    f.state.displayedMeshFrontier.add(published);
    f.state.tiles!.loadingTiles.delete(requester);
    f.makeRoom(requester);
    expect(f.removed).toEqual([]);
    expect(f.state.tiles!.loadingTiles.has(sibling)).toBe(true);
    f.state.tiles!.dispose();
  });

  it.each([false, true])(
    "preserves atomic siblings and coverage reservations (shadows=%s)",
    (shadows) => {
      const f = fixture();
      f.state.shadowView = shadows
        ? {
            camera: new OrthographicCamera(),
            shadowMapSize: { width: 1024, height: 1024 },
          }
        : null;
      const group = mesh(),
        requester = f.candidate(1000, group);
      f.state.tiles!.loadingTiles.delete(requester);
      const sibling = f.candidate(1, group);
      const receiver = f.candidate(1),
        caster = f.candidate(1),
        visible = f.candidate(1);
      const metadata = f.candidate(1),
        parsed = f.candidate(1),
        loaded = f.candidate(1),
        gap = f.candidate(1);
      f.state.committedMeshReceiverFrontier.add(receiver);
      f.state.committedMeshCasterFrontier.add(caster);
      f.state.displayedMeshFrontier.add(visible);
      metadata.internal.hasUnrenderableContent = true;
      parsed.internal.loadingState = 3;
      loaded.internal.loadingState = 4;
      f.coverage.add(gap);
      f.makeRoom(requester);
      expect(f.removed).toEqual([]);
      for (const tile of [
        sibling,
        receiver,
        caster,
        visible,
        metadata,
        parsed,
        loaded,
        gap,
      ])
        expect(f.state.tiles!.loadingTiles.has(tile)).toBe(true);
      f.state.tiles!.dispose();
    }
  );
});
