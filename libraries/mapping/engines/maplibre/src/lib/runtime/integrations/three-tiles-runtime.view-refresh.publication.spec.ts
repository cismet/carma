// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";
import type { Tile } from "3d-tiles-renderer/core";

import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MESH_SETTLED_AUDIT_INTERVAL_MS } from "./three-tiles-runtime-config";

import {
  buildTile,
  mount,
  mockTileViews,
} from "./three-tiles-runtime.view-refresh.test-support";

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

describe("publication runtime integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  it("retains a new shadow round requested while the current frame is running", () => {
    let state: ReturnType<typeof mount>["state"] | undefined;
    let requestNextRound = true;
    const mounted = mount(() => {
      if (state && requestNextRound) state.shadowSelectionNeedsTraversal = true;
    });
    try {
      state = mounted.state;
      state.shadowSelectionNeedsTraversal = true;
      mounted.runtime.scene.update(mounted.frame);
      expect(state.shadowSelectionNeedsTraversal).toBe(true);
      requestNextRound = false;
      mounted.runtime.scene.update(mounted.frame);
      expect(state.shadowSelectionNeedsTraversal).toBe(false);
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it("rearms recovery after a failed frame without clearing published geometry", () => {
    vi.useFakeTimers();
    let fail = false;
    const mounted = mount(() => {
      if (fail) throw new Error("interrupted traversal");
    });
    try {
      const state = mounted.state;
      if (state.meshAuditTimer !== null) clearTimeout(state.meshAuditTimer);
      state.meshAuditTimer = null;
      state.lastMainViewConverged = state.lastActiveViewsConverged = true;
      state.meshDemandSweepPending = false;
      const published = new Set([buildTile(4)]);
      state.displayedMeshFrontier = published;
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      fail = true;
      mounted.runtime.scene.update(mounted.frame);
      expect(error).toHaveBeenCalled();
      expect(state.displayedMeshFrontier).toBe(published);
      expect(state.lastActiveViewsConverged).toBe(false);
      expect(state.meshAuditTimer).not.toBeNull();
      const dispatch = vi.spyOn(mounted.renderer, "dispatchEvent");
      vi.mocked(mounted.map.triggerRepaint).mockClear();
      vi.advanceTimersByTime(MESH_SETTLED_AUDIT_INTERVAL_MS);
      expect(
        dispatch.mock.calls.some(([event]) => event.type === "needs-update")
      ).toBe(true);
      expect(mounted.map.triggerRepaint).toHaveBeenCalled();
      fail = false;
      mounted.runtime.scene.update(mounted.frame);
      expect(error).toHaveBeenCalledTimes(1);
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it("keeps a terminal source error measurable without repeatedly auditing impossible refinement", () => {
    vi.useFakeTimers();
    const mounted = mount();
    try {
      const leaf = buildTile(80);
      leaf.internal.loadingState = 4;
      leaf.engineData!.scene = new THREE.Group();
      mockTileViews(mounted.renderer, [leaf]);
      Object.assign(mounted.renderer, { rootTileset: { root: leaf } });
      vi.spyOn(mounted.renderer, "getBoundingBox").mockReturnValue(false);
      const state = mounted.state;
      if (state.meshAuditTimer !== null) clearTimeout(state.meshAuditTimer);
      state.meshAuditTimer = null;
      state.requestedErrorTarget =
        state.effectiveErrorTarget =
        state.memoryErrorTarget =
          4;
      state.displayedMeshFrontier = new Set([leaf]);
      state.meshDemandSweepPending = false;
      mounted.runtime.scene.update(mounted.frame);
      expect(state.displayedMeshFrontier.has(leaf)).toBe(true);
      expect(state.lastMainViewConverged).toBe(false);
      expect(state.lastActiveViewsConverged).toBe(false);
      expect(state.requestedErrorTarget).toBe(4);
      expect(state.meshAuditTimer).toBeNull();
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it("keeps a newly required offscreen sibling until its current family publishes", () => {
    const mounted = mount();
    try {
      const parent = buildTile(80);
      const children = Array.from({ length: 4 }, () => buildTile(2));
      parent.children = children;
      parent.internal.loadingState = 4;
      parent.engineData!.scene = new THREE.Group();
      for (const child of children) child.parent = parent;
      const sibling = children[3];
      sibling.internal.loadingState = 2;
      sibling.content = { uri: "sibling.b3dm" };
      mounted.renderer.loadingTiles.add(sibling);
      Object.assign(mounted.renderer, { rootTileset: { root: parent } });
      vi.spyOn(mounted.renderer, "getBoundingBox").mockReturnValue(false);
      mockTileViews(
        mounted.renderer,
        [parent, ...children],
        (tile) => tile !== sibling
      );
      const remove = vi.spyOn(mounted.renderer.lruCache, "remove");
      const state = mounted.state;
      state.extentFloorArmed = false;
      state.requestedErrorTarget =
        state.effectiveErrorTarget =
        state.memoryErrorTarget =
          4;
      state.meshInitialHandoverDone = true;
      state.displayedMeshFrontier = new Set([parent]);
      mounted.setMoving(true);
      mounted.camera.position.x += 1;
      mounted.camera.updateMatrixWorld(true);
      mounted.runtime.scene.update(mounted.frame);
      expect(state.meshRefinementSupport.has(sibling)).toBe(true);
      expect(remove.mock.calls.some(([tile]) => tile === sibling)).toBe(false);
      expect(sibling.internal.loadingState).toBe(2);
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it.each([2, -1])(
    "keeps published fine geometry alone on pan with sibling state=%s",
    (loadingState) => {
      const mounted = mount();
      try {
        const state = mounted.state;
        const parent = buildTile(80);
        const children = Array.from({ length: 4 }, () => buildTile(2));
        parent.children = children;
        for (const child of children) child.parent = parent;
        for (const tile of [parent, ...children]) {
          tile.internal.loadingState = 4;
          const scene = new THREE.Group();
          scene.add(
            new THREE.Mesh(
              new THREE.BufferGeometry(),
              new THREE.MeshBasicMaterial()
            )
          );
          tile.engineData!.scene = scene;
          tile.engineData!.boundingVolume!.intersectsFrustum = () => true;
          delete (tile.engineData!.boundingVolume as { getAABB?: unknown })
            .getAABB;
        }
        children[3].internal.loadingState = loadingState;
        // This fixture uses the explicit camera-error adapter, without root bounds.
        vi.spyOn(mounted.renderer, "getBoundingBox").mockReturnValue(false);
        Object.assign(mounted.renderer, { rootTileset: { root: parent } });
        vi.spyOn(mounted.renderer, "calculateTileViewError").mockImplementation(
          (tile, target) =>
            Object.assign(target, {
              inView: true,
              error: tile.geometricError,
              distanceFromCamera: 1,
            })
        );
        state.requestedErrorTarget = 4;
        state.effectiveErrorTarget = 4;
        state.memoryErrorTarget = 4;
        state.displayedMeshFrontier = new Set(children.slice(0, 3));
        for (const tile of children.slice(0, 3)) {
          mounted.renderer.setTileActive(tile, true);
          mounted.renderer.setTileVisible(tile, true);
        }
        mounted.setMoving(true);
        mounted.camera.position.x += 1;
        mounted.camera.updateMatrixWorld(true);
        mounted.runtime.scene.update(mounted.frame);
        expect(state.displayedMeshFrontier).toEqual(
          new Set(children.slice(0, 3))
        );
        const colourCut = () =>
          new Set(
            [...mounted.renderer.visibleTiles].filter((tile) => {
              const scene = tile.engineData!.scene!;
              return (
                scene.parent === mounted.renderer.group &&
                mounted.renderer.group.children.includes(scene) &&
                (
                  scene.children[0] as THREE.Mesh<
                    THREE.BufferGeometry,
                    THREE.MeshBasicMaterial
                  >
                ).material.colorWrite
              );
            })
          );
        expect(colourCut()).toEqual(new Set(children.slice(0, 3)));
        const partial = state.displayedMeshFrontier;
        // Force another publication pass with the same exact selection.
        state.meshContentRevision++;
        mounted.runtime.scene.update(mounted.frame);
        expect(state.displayedMeshFrontier).toBe(partial);
        expect(colourCut()).toEqual(new Set(children.slice(0, 3)));
        // The complete replacement can publish after the last payload arrives.
        children[3].internal.loadingState = 4;
        state.meshContentRevision++;
        mounted.runtime.scene.update(mounted.frame);
        expect(state.displayedMeshFrontier).toEqual(new Set(children));
        expect(state.displayedMeshFrontier).not.toBe(partial);
        expect(colourCut()).toEqual(new Set(children));
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );

  it.each([false, true])(
    "reattaches a selected payload on a same-error pan (active-only parent=%s)",
    (activeOnly) => {
      const mounted = mount();
      try {
        const tile = buildTile(0.1);
        tile.internal.loadingState = 4;
        tile.engineData!.boundingVolume!.intersectsFrustum = () => true;
        delete (tile.engineData!.boundingVolume as { getAABB?: unknown })
          .getAABB;
        const model = new THREE.Group();
        tile.engineData!.scene = model;
        mounted.renderer.group.matrixWorld.identity();
        Object.assign(mounted.renderer, { rootTileset: { root: tile } });
        vi.spyOn(mounted.renderer, "calculateTileViewError").mockImplementation(
          (_tile, target) =>
            Object.assign(target, {
              inView: true,
              error: 1,
              distanceFromCamera: 1,
            })
        );
        mounted.renderer.visibleTiles.add(tile);
        if (activeOnly) {
          mounted.renderer.activeTiles.add(tile);
          model.parent = mounted.renderer.group;
        }
        const used = vi.spyOn(mounted.renderer, "markTileUsed");
        mounted.camera.position.x += 1;
        mounted.camera.updateMatrixWorld(true);
        mounted.runtime.scene.update(mounted.frame);
        expect(mounted.renderer.group.children).toContain(model);
        expect(model.parent).toBe(mounted.renderer.group);
        expect(mounted.renderer.activeTiles.has(tile)).toBe(true);
        expect(mounted.renderer.visibleTiles.has(tile)).toBe(true);
        expect(tile.internal.loadingState).toBe(4);
        used.mockClear();
        mounted.camera.position.x += 1;
        mounted.camera.updateMatrixWorld(true);
        mounted.runtime.scene.update(mounted.frame);
        expect(used).toHaveBeenCalledWith(tile);
        expect(
          mounted.renderer.group.children.filter((child) => child === model)
        ).toHaveLength(1);
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );
});
