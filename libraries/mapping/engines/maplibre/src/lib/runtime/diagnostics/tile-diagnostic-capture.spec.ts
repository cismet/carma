import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { Tile } from "3d-tiles-renderer/core";
import { captureTileDiagnostics } from "./tile-diagnostic-capture";
import type { TilesRuntimeDebugState } from "./tile-diagnostic-state";
import {
  createTileCameraDemand,
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
  TILE_MAIN_OBSERVER_ID,
} from "../../core/tile-camera-demand";
const fixture = () => {
  const makeTile = (error: number) =>
    ({
      geometricError: error,
      refine: "REPLACE",
      children: [],
      parent: null,
      content: { uri: "mesh_" + error + ".glb" },
      internal: { hasRenderableContent: true, loadingState: 4, depth: 0 },
      traversal: { error: 4 },
      engineData: {
        boundingVolume: {
          getAABB: (box: THREE.Box3) =>
            box.set(
              new THREE.Vector3(1, 2, 3),
              new THREE.Vector3(100, 100, 100)
            ),
        },
      },
    } as unknown as Tile);
  const root = makeTile(100),
    child = makeTile(50);
  child.parent = root;
  root.children = [child];
  const calculateTileViewError = vi.fn(() => {
    throw new Error("Diagnostics must not trigger traversal");
  });
  const evaluate = vi.fn(() => ({
    required: true,
    errorRatio: 1,
    receiver: true,
    priority: 0,
  }));
  const state = {
    tiles: {
      root,
      group: new THREE.Group(),
      lruCache: {
        itemSet: new Map([
          [root, true],
          [child, true],
        ]),
      },
      loadingTiles: new Set(),
      calculateTileViewError,
    },
    tileCameraDemand: { evaluate },
    displayedMeshFrontier: new Set([root, child]),
    meshUnderlayFrontier: new Set(),
    deferred: new Set(),
    extentGeometricError: 100,
    effectiveErrorTarget: 4,
    requestedErrorTarget: 4,
  } as unknown as TilesRuntimeDebugState;
  return { state, calculateTileViewError, evaluate };
};
const options = {
  width: 800,
  height: 600,
  overviewUp: "tileset",
  overviewView: "extent",
  showOverlay: true,
  showOverviewPanel: false,
  showFrustum: false,
  showResident: true,
  sceneLabels: false,
};
describe("library-owned diagnostic capture", () => {
  it("keeps idle quality symbology unchanged when motion admission relaxes the main camera", async () => {
    const { state } = fixture();
    const camera = new THREE.PerspectiveCamera(60, 1, 1, 1000);
    camera.position.set(50, 50, 300);
    camera.lookAt(50, 50, 50);
    const demand = (target: number) =>
      createTileCameraDemand(
        snapshotTileCameraViews([
          {
            id: TILE_MAIN_OBSERVER_ID,
            camera,
            viewport: [800, 800],
            errorTargetPixels: target,
            role: TILE_CAMERA_ROLE.RECEIVER,
          },
        ])
      );
    state.tileCameraDemand = demand(4);
    const idle = await captureTileDiagnostics(state, null, options);
    state.effectiveErrorTarget = 12;
    state.tileCameraDemand = demand(12);
    const moving = await captureTileDiagnostics(state, null, options);
    expect(moving?.model.target).toBe(4);
    expect(
      moving?.model.rects.map(({ error, quality, levels }) => ({
        error,
        quality,
        levels,
      }))
    ).toEqual(
      idle?.model.rects.map(({ error, quality, levels }) => ({
        error,
        quality,
        levels,
      }))
    );
    expect(state.tileCameraDemand.views[0].errorTargetPixels).toBe(12);
  });

  it("reads the camera union without invoking traversal or request callbacks", async () => {
    const { state, calculateTileViewError, evaluate } = fixture();
    const result = await captureTileDiagnostics(state, null, options);
    expect(result?.model.rects).toHaveLength(2);
    expect(result?.model.rects[0].kind).toBe("ancestor");
    expect(evaluate).toHaveBeenCalled();
    expect(calculateTileViewError).not.toHaveBeenCalled();
    expect(state.displayedMeshFrontier.size).toBe(2);
  });
  it("does no capture work after disposal", async () => {
    const { state, evaluate } = fixture();
    expect(
      await captureTileDiagnostics(state, null, options, () => true)
    ).toBeNull();
    expect(evaluate).not.toHaveBeenCalled();
  });
  it("classifies retained non-floor tiles outside every view as having no LOD target", async () => {
    const { state, evaluate } = fixture();
    evaluate.mockReturnValue({
      required: false,
      errorRatio: 0,
      receiver: false,
      priority: 0,
    });
    const result = await captureTileDiagnostics(state, null, options);
    expect(result?.model.rects[1]).toMatchObject({
      floor: false,
      outsideDemand: true,
      quality: null,
    });
  });
  it("keeps secondary-only tiles in demand and uses the highest camera requirement", async () => {
    const { state } = fixture();
    const camera = new THREE.PerspectiveCamera(60, 1, 1, 1000);
    camera.position.set(50, 50, 300);
    camera.lookAt(50, 50, 50);
    state.tileCameraDemand = createTileCameraDemand(
      snapshotTileCameraViews(
        [100, 800].map((size, i) => ({
          id: `secondary-${i}`,
          camera,
          viewport: [size, size] as const,
          errorTargetPixels: 4,
          role: TILE_CAMERA_ROLE.RECEIVER,
        }))
      )
    );
    // The main camera does not see the tile. Its intersection cache must not
    // suppress demand from either secondary camera (including floor tiles).
    state.mainViewIntersectionCache = new WeakMap(
      [...state.displayedMeshFrontier].map((tile) => [tile, false])
    );
    const result = await captureTileDiagnostics(state, null, options);
    expect(result?.model.rects.every((rect) => !rect.outsideDemand)).toBe(true);
    expect(result?.model.rects[1].error).toBeCloseTo(
      (50 * 400 * Math.sqrt(3)) / 200
    );
    expect(result?.model.rects[1].quality?.minimum).toBeGreaterThan(0);
  });
  it("does not mix camera revisions or targets during a capture", async () => {
    const { state, evaluate } = fixture();
    evaluate.mockImplementation(() => {
      state.effectiveErrorTarget = 100;
      state.tileCameraDemand = createTileCameraDemand([]);
      return { required: true, errorRatio: 1, receiver: true, priority: 0 };
    });
    const result = await captureTileDiagnostics(state, null, options);
    expect(result?.model.target).toBe(4);
    expect(result?.model.rects[1]).toMatchObject({
      outsideDemand: false,
      error: 4,
      quality: { estimated: false },
    });
  });
});
