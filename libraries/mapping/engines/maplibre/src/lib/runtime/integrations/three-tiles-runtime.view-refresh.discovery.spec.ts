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

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:view-refresh-worker",
  });
});

describe("discovery runtime integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  it.each([false, true])(
    "completes demanded child families before deeper discovery (moving %s)",
    (moving) => {
      const mounted = mount();
      try {
        mounted.setMoving(moving);
        const { state, renderer } = mounted;
        const root = buildTile(1600);
        const ready = buildTile(800);
        const missing = buildTile(800);
        const outside = buildTile(800);
        const route = buildTile(800);
        route.internal.hasRenderableContent = false;
        root.children = [route];
        route.parent = root;
        route.children = [ready, missing, outside];
        ready.parent = missing.parent = outside.parent = route;
        root.internal.loadingState = ready.internal.loadingState = 4;
        state.displayedMeshFrontier.add(root);
        for (const tile of [root, route, ready, missing, outside]) {
          delete (tile.engineData!.boundingVolume as { getAABB?: unknown })
            .getAABB;
          tile.engineData!.boundingVolume!.intersectsFrustum = () =>
            tile !== outside;
        }
        vi.spyOn(renderer, "calculateTileViewError").mockImplementation(
          (tile, target) => {
            Object.assign(target, {
              inView: tile !== outside,
              error: tile.geometricError,
              distanceFromCamera: 1,
            });
          }
        );
        const error = (tile: Tile) => {
          const target = { inView: false, error: 0, distanceFromCamera: 0 };
          renderer.calculateTileViewErrorWithPlugin(tile, target);
          return target.error;
        };
        renderer.prepareForTraversal();
        expect(error(ready)).toBe(state.effectiveErrorTarget);
        expect(error(missing)).toBe(state.effectiveErrorTarget);
        expect(error(route)).toBeGreaterThan(state.effectiveErrorTarget);
        missing.internal.loadingState = 4;
        renderer.prepareForTraversal();
        expect(error(ready)).toBe(ready.geometricError);
        expect(error(missing)).toBe(missing.geometricError);
        expect(outside.internal.loadingState).toBe(0);
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
