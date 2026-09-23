// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";
import type { Tile } from "3d-tiles-renderer/core";

import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TILE_CAMERA_PRIORITY } from "../../core/tile-camera-demand";
import type { RuntimeTile } from "./three-tiles-runtime-types";

import {
  buildTile,
  mount,
  mockTileViews,
  finishMove,
} from "./three-tiles-runtime.view-refresh.test-support";
const prefetchPolicy = vi.hoisted(() => ({ levels: 1 }));

vi.mock("./three-tiles-runtime-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./three-tiles-runtime-config")>()),
  get MESH_REFINEMENT_PREFETCH_LEVELS() {
    return prefetchPolicy.levels;
  },
}));

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:view-refresh-worker",
  });
});

type TestRenderer = TilesRenderer & {
  frameCount: number;
  loadingTiles: Set<Tile>;
  queuedTiles: Tile[];
};

describe("coverage recovery runtime integration", () => {
  afterEach(() => {
    prefetchPolicy.levels = 1;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  it.each([false, true])(
    "recovers viewport holes before refinement after handover (moving=%s)",
    (moving) => {
      const admitted: Tile[] = [];
      vi.spyOn(
        TilesRenderer.prototype,
        "queueTileForDownload"
      ).mockImplementation(function (this: TilesRenderer, tile) {
        if (this.lruCache.isFull()) return;
        admitted.push(tile);
        tile.internal.loadingState = 1;
      });
      const mounted = mount();
      try {
        const state = mounted.state;
        const root = buildTile(200);
        Object.assign(root.internal, {
          hasContent: false,
          hasRenderableContent: false,
        });
        const covered = buildTile(8);
        const refinement = buildTile(2);
        covered.children = [refinement];
        refinement.parent = covered;
        const missing = buildTile(40);
        const missingDetail = buildTile(2);
        missing.children = [missingDetail];
        missingDetail.parent = missing;
        const outside = buildTile(40);
        root.children = [covered, missing, outside];
        for (const tile of root.children) tile.parent = root;
        let expanded = false;
        mockTileViews(
          mounted.renderer,
          [root, covered, refinement, missing, missingDetail, outside],
          (tile) => tile !== outside && (tile !== missing || expanded)
        );
        covered.internal.loadingState = 4;
        covered.engineData!.scene = new THREE.Group();
        Object.assign(mounted.renderer, { rootTileset: { root } });
        vi.spyOn(mounted.renderer, "getBoundingBox").mockImplementation(
          (box) => {
            box.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
            return true;
          }
        );
        vi.spyOn(
          mounted.renderer,
          "ensureChildrenArePreprocessed"
        ).mockImplementation(() => undefined);

        state.requestedErrorTarget =
          state.effectiveErrorTarget =
          state.memoryErrorTarget =
            4;
        mounted.renderer.errorTarget = 4;
        state.meshInitialBasePassDone = state.meshInitialHandoverDone = true;
        state.displayedMeshFrontier = new Set([covered]);
        mounted.runtime.scene.update(mounted.frame);
        // Failing the 4px quality goal alone is not a coverage hole.
        expect(state.meshCoverageRecovery).toBe(false);
        admitted.length = 0;
        refinement.internal.loadingState = 0;
        expanded = true;
        mounted.setMoving(moving);
        mounted.camera.position.x += 1;
        mounted.camera.updateMatrixWorld(true);
        mounted.runtime.scene.update(mounted.frame);
        expect(state.meshCoverageRecovery).toBe(true);
        expect(state.meshInitialHandoverDone).toBe(true);
        expect(state.displayedMeshFrontier.has(covered)).toBe(true);
        // Native admission rejects missing coverage before it becomes QUEUED.
        // Pending background bytes must yield without evicting ready coverage.
        const cache = mounted.renderer.lruCache;
        const beforeBytes = cache.cachedBytes;
        const queued = buildTile(8);
        const downloading = buildTile(8);
        const untouched = buildTile(8);
        const parsing = buildTile(8);
        const metadata = buildTile(8);
        const committed = buildTile(8);
        const visible = buildTile(8);
        const loaded = buildTile(8);
        const protectedTiles = [
          parsing,
          metadata,
          committed,
          visible,
          loaded,
          missingDetail,
        ];
        const fixtures = [downloading, queued, untouched, ...protectedTiles];
        const removed: Tile[] = [];
        for (const tile of fixtures) {
          if (tile !== missingDetail) tile.parent = covered;
          tile.internal.loadingState =
            tile === queued || tile === missingDetail
              ? 1
              : tile === parsing
              ? 3
              : tile === loaded
              ? 4
              : 2;
          if (tile === metadata) tile.internal.hasUnrenderableContent = true;
          cache.add(tile, () => {
            removed.push(tile);
            mounted.renderer.loadingTiles.delete(tile);
          });
          cache.setMemoryUsage(
            tile,
            tile === queued
              ? 20
              : tile === downloading || tile === untouched
              ? 40
              : 5
          );
          if (tile !== loaded) mounted.renderer.loadingTiles.add(tile);
        }
        state.committedMeshCasterFrontier.add(committed);
        mounted.renderer.visibleTiles.add(visible);
        const full = vi
          .spyOn(cache, "isFull")
          .mockImplementation(() => cache.cachedBytes >= beforeBytes + 100);
        expect(cache.isFull()).toBe(true);
        mounted.renderer.queueTileForDownload(refinement);
        expect(removed).toEqual([]);
        mounted.renderer.queueTileForDownload(missing);
        expect(removed).toEqual([queued, downloading]);
        expect(cache.isFull()).toBe(false);
        for (const tile of [...protectedTiles, untouched])
          expect(cache.has(tile)).toBe(true);
        full.mockRestore();
        for (const tile of fixtures) cache.remove(tile);
        state.committedMeshCasterFrontier.delete(committed);
        mounted.renderer.visibleTiles.delete(visible);
        missingDetail.internal.loadingState = 0;
        mounted.renderer.queueTileForDownload(outside);
        expect(admitted).toContain(missing);
        expect(admitted).not.toContain(refinement);
        expect(admitted).not.toContain(outside);
        expect((missing as RuntimeTile).cameraPriority).toBe(
          TILE_CAMERA_PRIORITY.VIEWPORT_FILL
        );
        // A coarse arriving surface closes the gap immediately, without waiting
        // for idle quality or the out-of-view sibling.
        missing.internal.loadingState = 4;
        missing.engineData!.scene = new THREE.Group();
        mounted.runtime.scene.update(mounted.frame);
        expect(state.displayedMeshFrontier).toEqual(
          new Set([covered, missing])
        );
        expect(state.meshCoverageRecovery).toBe(false);
        finishMove(mounted);
        mounted.renderer.queueTileForDownload(refinement);
        expect(admitted).toContain(refinement);
        expect(state.effectiveErrorTarget).toBe(4);
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );

  it.each([
    { published: true, parentError: 8, memoryTarget: 4, keepChildren: true },
    { published: true, parentError: 8, memoryTarget: 12, keepChildren: true },
    {
      published: true,
      parentError: 8,
      memoryTarget: 4,
      keepChildren: true,
      previousCount: 1,
    },
    { published: true, parentError: 3, memoryTarget: 4, keepChildren: true },
    {
      published: false,
      parentError: 8,
      memoryTarget: 4,
      keepChildren: false,
    },
  ])(
    "separates motion admission from idle-detail retention: %j",
    ({
      published,
      parentError,
      memoryTarget,
      keepChildren,
      previousCount = 4,
    }) => {
      const mounted = mount();
      try {
        const state = mounted.state;
        const parent = buildTile(parentError);
        const children = Array.from({ length: 4 }, () => buildTile(2));
        parent.children = children;
        for (const child of children) child.parent = parent;
        for (const tile of [parent, ...children]) {
          tile.internal.loadingState = 4;
          tile.engineData!.scene = new THREE.Group();
        }
        Object.assign(mounted.renderer, { rootTileset: { root: parent } });
        mockTileViews(mounted.renderer, [parent, ...children]);
        state.requestedErrorTarget = 4;
        state.effectiveErrorTarget = 12;
        state.memoryErrorTarget = memoryTarget;
        mounted.renderer.errorTarget = 12;
        state.displayedMeshFrontier = new Set(
          published ? children.slice(0, previousCount) : []
        );
        mounted.setMoving(true);
        mounted.camera.position.x += 1;
        mounted.camera.updateMatrixWorld(true);
        mounted.runtime.scene.update(mounted.frame);
        expect(state.displayedMeshFrontier).toEqual(
          new Set(keepChildren ? children : [parent])
        );
        // Motion only relaxes new demand. At rest the normal target resumes
        // refinement while retaining every already displayed detail level.
        if (memoryTarget === 4) {
          state.meshInitialBasePassDone = true;
          state.meshInitialHandoverDone = true;
          finishMove(mounted);
          expect(state.effectiveErrorTarget).toBe(4);
          expect(state.displayedMeshFrontier).toEqual(new Set(children));
        }
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );
});
