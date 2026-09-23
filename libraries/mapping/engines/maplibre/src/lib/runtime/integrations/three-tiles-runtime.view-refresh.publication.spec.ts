// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";
import type { Tile } from "3d-tiles-renderer/core";

import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("publication runtime integration", () => {
  afterEach(() => {
    prefetchPolicy.levels = 1;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  it.each([2, -1])(
    "keeps complete colour coverage on pan with sibling state=%s",
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
          new Set([parent, ...children.slice(0, 3)])
        );
        expect(state.meshUnderlayFrontier).toEqual(new Set([parent]));
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
        expect(colourCut()).toEqual(new Set([parent, ...children.slice(0, 3)]));
        const parentMesh = parent.engineData!.scene!.children[0] as THREE.Mesh<
          THREE.BufferGeometry,
          THREE.MeshBasicMaterial
        >;
        expect(parentMesh.material.depthWrite).toBe(false);
        expect(parentMesh.renderOrder).toBeLessThan(0);
        // The complete replacement can publish after the last payload arrives.
        children[3].internal.loadingState = 4;
        state.meshContentRevision++;
        mounted.runtime.scene.update(mounted.frame);
        expect(state.displayedMeshFrontier).toEqual(new Set(children));
        expect(colourCut()).toEqual(new Set(children));
        expect(state.meshUnderlayFrontier.size).toBe(0);
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
