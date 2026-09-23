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

describe("discovery runtime integration", () => {
  afterEach(() => {
    prefetchPolicy.levels = 1;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  it.each([0, 1, 2])(
    "bounds stationary discovery with %i prefetched levels and keeps motion at one",
    (levels) => {
      prefetchPolicy.levels = levels;
      const mounted = mount();
      try {
        const state = mounted.state;
        const chain = [1600, 800, 400, 200, 100].map((error) =>
          buildTile(error)
        );
        for (let i = 0; i < chain.length; i++) {
          if (i) {
            chain[i].parent = chain[i - 1];
            chain[i - 1].children = [chain[i]];
          }
          delete (chain[i].engineData!.boundingVolume as { getAABB?: unknown })
            .getAABB;
        }
        chain[0].internal.loadingState = 4;
        state.displayedMeshFrontier.add(chain[0]);
        vi.spyOn(mounted.renderer, "calculateTileViewError").mockImplementation(
          (tile, target) => {
            Object.assign(target, {
              inView: true,
              error: tile.geometricError,
              distanceFromCamera: 1,
            });
          }
        );
        for (const moving of [false, true]) {
          mounted.setMoving(moving);
          const boundary = moving ? 1 : 1 + levels;
          for (let depth = 1; depth < chain.length; depth++) {
            const target = { inView: false, error: 0, distanceFromCamera: 0 };
            mounted.renderer.calculateTileViewErrorWithPlugin(
              chain[depth],
              target
            );
            expect(target.error).toBe(
              depth === boundary
                ? state.effectiveErrorTarget
                : chain[depth].geometricError
            );
          }
        }
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );

  it.each([
    [1, "download"],
    [1, "parse"],
    [2, "download"],
    [2, "parse"],
  ] as const)(
    "starts %i levels of lookahead %s before pending parents, below coverage-repair priority",
    async (levels, phase) => {
      prefetchPolicy.levels = levels;
      vi.useFakeTimers();
      const mounted = mount();
      try {
        const state = mounted.state;
        state.effectiveErrorTarget = 6;
        state.requestedErrorTarget = 6;
        state.memoryErrorTarget = 6;
        // Synthetic visible demand: the pending parent's 12px error is above
        // final quality but below the 16px bootstrap gate being bypassed.
        state.tileCameraDemand = {
          ...state.tileCameraDemand,
          evaluate: () => ({
            required: true,
            receiver: true,
            errorRatio: 2,
            priority: TILE_CAMERA_PRIORITY.PRIMARY,
          }),
        } as typeof state.tileCameraDemand;
        mounted.renderer.loadAncestors = true;
        const root = buildTile(40);
        const parent = buildTile(12);
        const route = buildTile(12);
        route.internal.hasRenderableContent = false;
        route.internal.hasUnrenderableContent = true;
        const child = buildTile(6);
        const sibling = buildTile(6);
        const second = buildTile(3);
        child.children = [second];
        second.parent = child;
        root.internal.loadingState = 4;
        parent.internal.loadingState = 2;
        root.children = [parent];
        parent.parent = root;
        parent.children = [route];
        route.parent = parent;
        route.children = [child, sibling];
        child.parent = sibling.parent = route;
        for (const tile of [root, parent, route, child, sibling, second]) {
          tile.internal.renderer = mounted.renderer;
          tile.engineData!.boundingVolume!.intersectsFrustum = () => true;
        }
        state.displayedMeshFrontier.add(root);
        state.meshRefinementSupport.add(parent);
        mounted.renderer.queueTileForDownload(route);
        expect(mounted.renderer.queuedTiles).toEqual([route]);
        if (levels === 2) {
          // Native skip traversal would request only the deepest leaf. The
          // preceding discovery callback must also enqueue this intermediate.
          vi.spyOn(
            mounted.renderer,
            "calculateTileViewError"
          ).mockImplementation((tile, target) => {
            Object.assign(target, {
              inView: true,
              error: tile.geometricError,
              distanceFromCamera: 1,
            });
          });
          mounted.renderer.calculateTileViewErrorWithPlugin(child, {
            inView: false,
            error: 0,
            distanceFromCamera: 0,
          });
          expect(mounted.renderer.queuedTiles).toContain(child);
        }
        for (const candidate of [child, second].slice(0, levels)) {
          mounted.renderer.queueTileForDownload(candidate);
          expect(mounted.renderer.queuedTiles).toContain(candidate);
          expect(mounted.renderer.queuedTiles).not.toContain(sibling);
          expect(state.meshRefinementSupport.has(candidate)).toBe(false);
          const callback = vi.fn().mockResolvedValue("ready");
          const result =
            phase === "download"
              ? mounted.renderer.downloadQueue.add(
                  "https://example.test/child",
                  candidate,
                  callback
                )
              : mounted.renderer.parseQueue.add(candidate, callback);
          await vi.advanceTimersByTimeAsync(50);
          expect(callback).toHaveBeenCalledOnce();
          await expect(result).resolves.toBe("ready");
          expect((candidate as RuntimeTile).cameraPriority).toBe(
            TILE_CAMERA_PRIORITY.PRIMARY
          );
        }
        expect(parent.internal.loadingState).toBe(2);
        expect(child.internal.loadingState).toBe(0);
        expect(state.displayedMeshFrontier).toEqual(new Set([root]));

        // Existing backpressure still rejects new native requests.
        mounted.renderer.queuedTiles.length = 0;
        state.queuedThisTraversal.clear();
        state.memoryAdmissionPaused = true;
        mounted.renderer.queueTileForDownload(child);
        expect(mounted.renderer.queuedTiles).toEqual([]);
        state.memoryAdmissionPaused = false;
        state.loadingPaused = true;
        mounted.renderer.queueTileForDownload(child);
        expect(mounted.renderer.queuedTiles).toEqual([]);
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );

  it("publishes the loaded parent while sibling preprocessing is still asynchronous", () => {
    const mounted = mount();
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      const parent = buildTile(40);
      parent.internal.loadingState = 4;
      parent.engineData!.scene = new THREE.Group();
      parent.engineData!.boundingVolume!.intersectsFrustum = () => true;
      delete (parent.engineData!.boundingVolume as { getAABB?: unknown })
        .getAABB;
      parent.children = [
        { parent, children: [], geometricError: 20 } as unknown as Tile,
      ];
      Object.assign(mounted.renderer, { rootTileset: { root: parent } });
      vi.spyOn(
        mounted.renderer,
        "ensureChildrenArePreprocessed"
      ).mockImplementation(() => undefined);
      vi.spyOn(mounted.renderer, "calculateTileViewError").mockImplementation(
        (_tile, target) => {
          Object.assign(target, {
            inView: true,
            error: 40,
            distanceFromCamera: 1,
          });
        }
      );
      mounted.runtime.scene.update(mounted.frame);
      expect(errors).not.toHaveBeenCalled();
      expect(mounted.renderer.group.children).toContain(
        parent.engineData!.scene
      );
      expect(mounted.renderer.visibleTiles.has(parent)).toBe(true);
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it("schedules raw replacement siblings through their known hierarchy parent", () => {
    const mounted = mount();
    try {
      const state = mounted.state;
      state.meshInitialBasePassDone = true;
      mounted.runtime.loading.setErrorTargetOverride(4);
      const parent = buildTile(40);
      parent.internal.loadingState = 4;
      parent.engineData!.scene = new THREE.Group();
      parent.engineData!.boundingVolume!.intersectsFrustum = () => true;
      delete (parent.engineData!.boundingVolume as { getAABB?: unknown })
        .getAABB;
      // Native preprocessing is what establishes a child's parent pointer.
      const child = { children: [], geometricError: 4 } as unknown as Tile;
      parent.children = [child];
      Object.assign(mounted.renderer, { rootTileset: { root: parent } });
      const prepare = vi
        .spyOn(mounted.renderer, "ensureChildrenArePreprocessed")
        .mockImplementation(() => undefined);
      vi.spyOn(mounted.renderer, "calculateTileViewError").mockImplementation(
        (tile, target) =>
          Object.assign(target, {
            inView: true,
            error: tile.geometricError,
            distanceFromCamera: 1,
          })
      );
      mounted.runtime.scene.update(mounted.frame);
      expect(mounted.renderer.visibleTiles.has(parent)).toBe(true);
      // First publish the admissible 40px surface; the next refinement pass
      // must initialize its raw replacement topology without losing coverage.
      mounted.renderer.dispatchEvent({ type: "needs-update" });
      mounted.runtime.scene.update(mounted.frame);
      expect(mounted.renderer.visibleTiles.has(parent)).toBe(true);
      expect(prepare).toHaveBeenCalledWith(parent, false);
      Object.assign(child, buildTile(4), { parent });
      child.internal.loadingState = 4;
      child.engineData!.scene = new THREE.Group();
      child.engineData!.boundingVolume!.intersectsFrustum = () => true;
      delete (child.engineData!.boundingVolume as { getAABB?: unknown })
        .getAABB;
      mounted.renderer.dispatchEvent({ type: "needs-update" });
      mounted.runtime.scene.update(mounted.frame);
      expect(mounted.renderer.visibleTiles.has(child)).toBe(true);
      expect(mounted.renderer.visibleTiles.has(parent)).toBe(false);
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it("keeps unconfigured cold startup in skip mode through motion and handover", () => {
    const ancestorPasses: boolean[] = [];
    const mounted = mount((renderer) =>
      ancestorPasses.push(renderer.loadAncestors)
    );
    try {
      expect(ancestorPasses).toEqual([false]);
      mounted.setMoving(true);
      mounted.runtime.scene.update(mounted.frame);
      expect(ancestorPasses).toEqual([false, false]);
      const state = mounted.state;
      state.meshInitialHandoverDone = true;
      state.displayedMeshFrontier.add(buildTile(20));
      mounted.runtime.scene.update(mounted.frame);
      expect(ancestorPasses).toEqual([false, false, false]);
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it.each([16, undefined])(
    "keeps native sibling expansion disabled before and after handover (base %s)",
    (baseErrorTargetPixels) => {
      const passes: boolean[] = [];
      const mounted = mount(
        (renderer) => passes.push(renderer.loadAncestors),
        () => true,
        true,
        { baseErrorTargetPixels, handoverErrorTargetPixels: 8 }
      );
      try {
        expect(passes).toEqual([false]);
        expect(mounted.renderer.loadSiblings).toBe(false);
        const state = mounted.state;
        state.meshInitialHandoverDone = true;
        state.displayedMeshFrontier.add(buildTile(6));
        mounted.runtime.scene.update(mounted.frame);
        expect(passes).toEqual([false, false]);
        expect(mounted.renderer.loadSiblings).toBe(false);
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );

  it.each([false, true])(
    "queues only the requested child without sibling downloads (handover %s)",
    (handover) => {
      const admitted: Tile[] = [];
      vi.spyOn(
        TilesRenderer.prototype,
        "queueTileForDownload"
      ).mockImplementation((tile) => {
        admitted.push(tile);
        tile.internal.loadingState = 1;
      });
      const mounted = mount();
      try {
        const state = mounted.state;
        state.meshInitialHandoverDone = handover;
        const parent = buildTile(20);
        parent.internal.loadingState = 4;
        parent.engineData!.boundingVolume!.intersectsFrustum = () => true;
        const children = Array.from({ length: 4 }, () => buildTile(6));
        parent.children = children;
        for (const child of children) child.parent = parent;
        children[0].engineData!.boundingVolume!.intersectsFrustum = () => true;
        vi.spyOn(
          mounted.renderer,
          "ensureChildrenArePreprocessed"
        ).mockImplementation(() => undefined);
        vi.spyOn(mounted.renderer, "calculateTileViewError").mockImplementation(
          (tile, target) =>
            Object.assign(target, {
              inView: tile === parent || tile === children[0],
              error: tile.geometricError,
              distanceFromCamera: 1,
            })
        );
        for (const tile of [parent, ...children])
          delete (tile.engineData!.boundingVolume as { getAABB?: unknown })
            .getAABB;
        state.extentFloorArmed = false;
        state.displayedMeshFrontier = new Set([parent]);
        state.requestedErrorTarget = 4;
        state.effectiveErrorTarget = 4;
        state.memoryErrorTarget = 4;
        mounted.renderer.queueTileForDownload(children[0]);
        expect(admitted).toEqual([children[0]]);
        expect(state.meshRefinementSupport.size).toBe(0);
        expect((children[0] as RuntimeTile).cameraPriority).toBe(
          TILE_CAMERA_PRIORITY.PRIMARY
        );
        expect(
          children.slice(1).every((tile) => tile.internal.loadingState === 0)
        ).toBe(true);
        mounted.renderer.queueTileForDownload(children[0]);
        expect(admitted).toHaveLength(1);
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );
});
