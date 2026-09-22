// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { TilesRenderer } from "3d-tiles-renderer";
import { Box3, PerspectiveCamera, Sphere, Vector3 } from "three";
import {
  createTileCameraDemand,
  snapshotTileCameraViews,
  TILE_MAIN_OBSERVER_ID,
} from "../../core/tile-camera-demand";
import { createThreeTilesRuntimeState } from "./three-tiles-runtime-state";
import { createThreeTilesSpatial } from "./three-tiles-runtime-spatial";
import type {
  RuntimeTile,
  RuntimeTilesRenderer,
} from "./three-tiles-runtime-types";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-spatial-worker",
  });
});

const tile = (error: number, children: RuntimeTile[] = []): RuntimeTile =>
  ({
    children,
    traversal: { error, inFrustum: true },
    internal: { hasContent: true, hasRenderableContent: true, loadingState: 4 },
  } as RuntimeTile);

describe("mesh viewport convergence", () => {
  it("derives budget-fitting fallback coverage but leaves it unarmed until the initial viewport is ready", () => {
    const state = createThreeTilesRuntimeState("mesh", "mesh.json", [7, 51], {
      providesTerrain: true,
      cacheBudgetBytes: 384 * 1024 ** 2,
      entry: {
        levels: [
          { level: 0, geometricError: 908.2, bytes: 17541680 },
          { level: 3, geometricError: 97.3, bytes: 36044315 },
        ],
      },
    });
    expect(state.extentGeometricError).toBe(908.2);
    expect(state.extentFloorArmed).toBe(false);
    expect(state.extentFloorAuditPending).toBe(false);
    expect(state.meshBaseCoverageReady).toBe(false);
  });
  const fixture = () => {
    const state = createThreeTilesRuntimeState("mesh", "mesh.json", [7, 51], {
      providesTerrain: true,
    });
    const receiver = tile(1, [tile(0.5)]);
    const caster = tile(64, [tile(32)]);
    state.tiles = {
      visibleTiles: new Set([receiver, caster]),
    } as typeof state.tiles;
    state.requestedErrorTarget = 1;
    state.effectiveErrorTarget = 16;
    state.displayedMeshFrontier.add(receiver);
    const spatial = createThreeTilesSpatial(state, {
      getStableTileId: vi.fn(),
      getTileLoadReason: vi.fn(),
    });
    return { state, spatial, receiver };
  };

  it("does not let retained caster parents block receiver refinement", () => {
    const { spatial } = fixture();
    expect(spatial.mainViewConverged()).toBe(true);
    expect(spatial.isMainViewReady()).toBe(true);
  });

  it("still requires the actual receiver error target, not an idle queue", () => {
    const { spatial, receiver } = fixture();
    receiver.traversal.error = 4;
    expect(spatial.mainViewConverged()).toBe(true);
    expect(spatial.isMainViewReady()).toBe(false);
    receiver.traversal.error = 32;
    expect(spatial.mainViewConverged()).toBe(false);
  });

  it("does not declare a caster-only scene to be a filled viewport", () => {
    const { spatial, state } = fixture();
    state.displayedMeshFrontier.clear();
    expect(spatial.mainViewConverged()).toBe(false);
    expect(spatial.isMainViewReady()).toBe(false);
  });
});

describe("current-camera screen error before native traversal", () => {
  const fixture = () => {
    const state = createThreeTilesRuntimeState("mesh", "mesh.json", [7, 51], {
      providesTerrain: true,
    });
    const tiles = new TilesRenderer("mesh.json") as RuntimeTilesRenderer;
    state.tiles = tiles;
    // This analytic fixture is already in the camera's local coordinate frame.
    state.orientationGroup.rotation.set(0, 0, 0);
    state.offsetGroup.add(tiles.group);
    const camera = new PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.z = 11;
    camera.updateMatrixWorld(true);
    tiles.setCamera(camera);
    tiles.setResolution(camera, 1000, 1000);
    state.offsetGroup.updateWorldMatrix(true, false);
    tiles.group.updateMatrixWorld(true);
    // Model the information left by the preceding native traversal. The next
    // camera motion must be visible to retention before another update runs.
    tiles.prepareForTraversal();
    const bounds = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    const receiver = {
      ...tile(999),
      geometricError: 2,
      engineData: {
        boundingVolume: {
          getAABB: (target: Box3) => target.copy(bounds),
          getSphere: (target: Sphere) => bounds.getBoundingSphere(target),
          distanceToPoint: (point: Vector3) => bounds.distanceToPoint(point),
          intersectsFrustum: (frustum: {
            intersectsBox: (box: Box3) => boolean;
          }) => frustum.intersectsBox(bounds),
        },
      },
    } as RuntimeTile;
    const spatial = createThreeTilesSpatial(state, {
      getStableTileId: vi.fn(),
      getTileLoadReason: vi.fn(),
    });
    const nativeError = vi.spyOn(tiles, "calculateTileViewError");
    const nativePreparation = vi.spyOn(tiles, "prepareForTraversal");
    return {
      state,
      tiles,
      camera,
      receiver,
      spatial,
      nativeError,
      nativePreparation,
    };
  };

  it("values absolute visible error reduction across complete published families", () => {
    const { state, tiles, camera, receiver, spatial } = fixture();
    try {
      const bounds = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
      const member = (geometricError: number, box = bounds): RuntimeTile => ({
        ...receiver,
        geometricError,
        refine: "REPLACE",
        children: [],
        engineData: {
          boundingVolume: {
            ...receiver.engineData!.boundingVolume!,
            getAABB: (target) => target.copy(box),
          },
        },
      });
      const family = (error: number, box = bounds) => {
        const parent = member(error, box);
        const child = member(error / 2, box);
        child.parent = parent;
        parent.children = [child];
        state.displayedMeshFrontier.add(parent);
        return { parent, child };
      };
      const coarse = family(
        16,
        new Box3(new Vector3(-8, -1, -1), new Vector3(-1, 1, 1))
      );
      const fine = family(2);
      const small = family(
        16,
        new Box3(new Vector3(-0.01, -0.01, -1), new Vector3(0.01, 0.01, 1))
      );
      const fringe = member(
        8,
        new Box3(new Vector3(-8, -1, -1), new Vector3(-7, 1, 1))
      );
      fringe.parent = coarse.parent;
      coarse.parent.children.push(fringe);
      state.meshRefinementSupport.add(fringe);
      const setView = () => {
        state.tileCameraDemand = createTileCameraDemand(
          snapshotTileCameraViews([
            {
              id: TILE_MAIN_OBSERVER_ID,
              camera,
              viewport: [1000, 1000],
              errorTargetPixels: 6,
              role: "receiver",
            },
          ])
        );
      };
      setView();
      const candidates = [coarse.child, fine.child, small.child, fringe];
      expect(candidates.map(spatial.getTileRequestPriority)).toEqual([
        1, 1, 1, 1,
      ]);
      expect(coarse.child.meshRefinement!.benefit).toBeGreaterThan(
        fine.child.meshRefinement!.benefit
      );
      expect(fine.child.meshRefinement!.benefit).toBeGreaterThan(
        small.child.meshRefinement!.benefit
      );
      expect(fringe.meshRefinement).toBe(coarse.child.meshRefinement);
      spatial.getTileRequestPriority(coarse.parent);
      expect(coarse.parent.meshRefinement).toBe(coarse.child.meshRefinement);
      const lookahead = member(4);
      lookahead.parent = coarse.child;
      spatial.getTileRequestPriority(lookahead);
      expect(lookahead.meshRefinement).toBeUndefined();
      const oldBenefit = coarse.child.meshRefinement!.benefit;
      const knownNextError = coarse.child.meshRefinement!.nextErrorPixels;
      const metadata = member(16);
      metadata.internal = {
        ...metadata.internal,
        hasRenderableContent: false,
        hasUnrenderableContent: true,
      };
      metadata.parent = coarse.parent;
      coarse.parent.children.push(metadata);
      state.meshContentRevision++;
      spatial.getTileRequestPriority(metadata);
      expect(metadata.meshRefinement!.provisional).toBe(true);
      expect(metadata.meshRefinement!.nextErrorPixels).toBe(knownNextError);
      expect(metadata.meshRefinement!.benefit).toBe(oldBenefit);
      camera.position.z = 22;
      camera.updateMatrixWorld(true);
      setView();
      spatial.getTileRequestPriority(coarse.child);
      expect(coarse.child.meshRefinement!.benefit).toBeLessThan(oldBenefit);
      state.displayedMeshFrontier.delete(coarse.parent);
      state.displayedMeshFrontier.add(coarse.child);
      spatial.getTileRequestPriority(coarse.child);
      expect(coarse.child.meshRefinement).toBeUndefined();
    } finally {
      tiles.dispose();
    }
  });

  it("merges changing shadow demand with the cached camera error instead of returning early", () => {
    const { state, tiles, camera, receiver, spatial } = fixture();
    try {
      state.tileCameraDemand = createTileCameraDemand(
        snapshotTileCameraViews([
          {
            id: TILE_MAIN_OBSERVER_ID,
            camera,
            viewport: [1000, 1000],
            errorTargetPixels: state.effectiveErrorTarget,
            role: "receiver",
          },
        ])
      );
      const cameraError = spatial.getTileScreenError(receiver);
      let pixelsPerMeter = 300;
      state.shadowReceiverMask = {
        sourceCount: 2,
        match: (_bounds, target) => {
          target.receiverGeometricError = 1;
          target.receiverPixelsPerMeter = pixelsPerMeter;
          return true;
        },
      };
      expect(spatial.getTileScreenError(receiver)).toBe(600);
      // Receiver sources must use observer demand, never feed caster demand
      // into the next receiver mask and ratchet its detail upward.
      expect(spatial.getTileScreenError(receiver, false)).toBeCloseTo(
        cameraError
      );
      pixelsPerMeter = 1;
      expect(spatial.getTileScreenError(receiver)).toBeCloseTo(cameraError);
    } finally {
      tiles.dispose();
    }
  });

  it("keeps the padded map center at peak foveation without changing metric screen error", () => {
    const { tiles, state, camera, receiver, spatial } = fixture();
    try {
      spatial.prepareViewFrustums(camera);
      const initialError = spatial.getTileScreenError(receiver);
      expect(
        spatial.getTileCenterness(receiver.engineData!.boundingVolume)
      ).toBeCloseTo(1);
      camera.setViewOffset(1000, 1000, -300, -100, 1000, 1000);
      spatial.prepareViewFrustums(camera);
      expect(state.mainViewProjectionChanged).toBe(true);
      expect(spatial.getTileScreenError(receiver)).toBeCloseTo(initialError);
      expect(
        spatial.getTileCenterness(receiver.engineData!.boundingVolume)
      ).toBeCloseTo(1);
      const canvasCenter = new Vector3(0, 0, 0).unproject(camera);
      expect(
        spatial.getTileCenterness({
          ...receiver.engineData!.boundingVolume,
          getSphere: (target: Sphere) => target.set(canvasCenter, 0),
        })
      ).toBeLessThan(0.6);
      camera.clearViewOffset();
      spatial.prepareViewFrustums(camera);
      expect(
        spatial.getTileCenterness(receiver.engineData!.boundingVolume)
      ).toBeCloseTo(1);
      expect(spatial.getTileScreenError(receiver)).toBeCloseTo(initialError);
    } finally {
      tiles.dispose();
    }
  });

  it("skips additional-camera bounds work for a main-only scene and preserves union SSE", () => {
    const { state, tiles, camera, receiver, spatial, nativeError } = fixture();
    try {
      state.tileCameraDemand = createTileCameraDemand(
        snapshotTileCameraViews([
          {
            id: TILE_MAIN_OBSERVER_ID,
            camera,
            viewport: [1000, 1000],
            errorTargetPixels: state.effectiveErrorTarget,
            role: "receiver",
          },
        ])
      );
      const evaluate = vi.spyOn(state.tileCameraDemand, "evaluate");
      const bounds = vi.spyOn(receiver.engineData!.boundingVolume!, "getAABB");
      for (let i = 0; i < 100; i++)
        expect(spatial.getTileCameraDemand(receiver).required).toBe(false);
      expect(bounds).not.toHaveBeenCalled();
      expect(evaluate).not.toHaveBeenCalled();
      expect(spatial.getTileScreenError(receiver)).toBeGreaterThan(0);
      expect(evaluate).toHaveBeenCalledOnce();
      expect(nativeError).not.toHaveBeenCalled();
    } finally {
      tiles.dispose();
    }
  });

  it("still evaluates additional receivers when they are added after a main-only query", () => {
    const { state, tiles, camera, receiver, spatial } = fixture();
    try {
      expect(spatial.getTileCameraDemand(receiver).required).toBe(false);
      state.tileCameraDemand = createTileCameraDemand(
        snapshotTileCameraViews([
          {
            id: "secondary",
            camera,
            viewport: [1000, 1000],
            errorTargetPixels: 2,
            role: "receiver",
          },
        ])
      );
      expect(spatial.getTileCameraDemand(receiver).receiver).toBe(true);
    } finally {
      tiles.dispose();
    }
  });

  it("retains asymmetric full-viewport edge rays in the prefetch margin and every idle ring", () => {
    const { tiles, state, camera, spatial } = fixture();
    try {
      camera.setViewOffset(1000, 1000, -400, -100, 1000, 1000);
      spatial.prepareViewFrustums(camera);
      for (const x of [-0.99, 0.99]) {
        const edge = new Vector3(x, 0, 0).unproject(camera);
        expect(state.tileViewFrustum.containsPoint(edge)).toBe(true);
        expect(state.marginFrustum.containsPoint(edge)).toBe(true);
        state.ringFrustums.forEach((frustum) =>
          expect(frustum.containsPoint(edge)).toBe(true)
        );
      }
      const leftEdge = new Vector3(-0.99, 0, 0).unproject(camera);
      camera.clearViewOffset();
      spatial.prepareViewFrustums(camera);
      expect(state.tileViewFrustum.containsPoint(leftEdge)).toBe(false);
      expect(state.marginFrustum.containsPoint(leftEdge)).toBe(false);
    } finally {
      tiles.dispose();
    }
  });

  it("uses the zoomed-out then zoomed-in camera before any native update", () => {
    const { tiles, camera, receiver, spatial, nativePreparation } = fixture();
    try {
      spatial.prepareViewFrustums(camera);
      const nearError = spatial.getTileScreenError(receiver);
      expect(nearError).toBeGreaterThan(0);
      camera.position.z = 111;
      // Deliberately leave matrixWorld stale: preparation owns this refresh.
      spatial.prepareViewFrustums(camera);
      expect(spatial.getTileScreenError(receiver)).toBeCloseTo(nearError / 11);
      camera.position.z = 6;
      spatial.prepareViewFrustums(camera);
      expect(spatial.getTileScreenError(receiver)).toBeCloseTo(nearError * 2);
      expect(nativePreparation).toHaveBeenCalledTimes(3);
    } finally {
      tiles.dispose();
    }
  });

  it("memoizes repeated reads only within the current camera audit", () => {
    const { tiles, camera, receiver, spatial, nativeError } = fixture();
    try {
      spatial.prepareViewFrustums(camera);
      const initial = spatial.getTileScreenError(receiver);
      expect(spatial.getTileScreenError(receiver)).toBe(initial);
      expect(spatial.getTileScreenError(receiver)).toBe(initial);
      expect(nativeError).toHaveBeenCalledOnce();
      camera.zoom = 2;
      camera.updateProjectionMatrix();
      spatial.prepareViewFrustums(camera);
      expect(spatial.getTileScreenError(receiver)).toBeCloseTo(initial * 2);
      expect(spatial.getTileScreenError(receiver)).toBeCloseTo(initial * 2);
      expect(nativeError).toHaveBeenCalledTimes(2);
    } finally {
      tiles.dispose();
    }
  });

  it("refreshes the tiles group transform before native camera information", () => {
    const { state, tiles, camera, receiver, spatial } = fixture();
    try {
      spatial.prepareViewFrustums(camera);
      const initial = spatial.getTileScreenError(receiver);
      state.offsetGroup.position.z = -100;
      spatial.prepareViewFrustums(camera);
      expect(spatial.getTileScreenError(receiver)).toBeCloseTo(initial / 11);
      tiles.setResolution(camera, 2000, 2000);
      spatial.prepareViewFrustums(camera);
      expect(spatial.getTileScreenError(receiver)).toBeCloseTo(
        (initial * 2) / 11
      );
    } finally {
      tiles.dispose();
    }
  });
});
