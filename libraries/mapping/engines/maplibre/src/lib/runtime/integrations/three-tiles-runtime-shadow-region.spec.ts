// @vitest-environment jsdom
import type { Tile } from "3d-tiles-renderer/core";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  createTileCameraDemand,
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
} from "../../core/tile-camera-demand";
import { createThreeTilesRuntimeState } from "./three-tiles-runtime-state";
import { createThreeTilesShadows } from "./three-tiles-runtime-shadows";
import type { RuntimeTilesRenderer } from "./three-tiles-runtime-types";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:runtime-shadow-region-test",
  });
});

describe("shadow region proofs", () => {
  it("keeps sunward casters outside the capture frustum in regional readiness proofs", () => {
    const state = createThreeTilesRuntimeState(
      "mesh",
      "mesh.json",
      [7.2, 51.2],
      {
        providesTerrain: true,
      }
    );
    const makeTile = (
      name: string,
      near: number,
      far: number,
      error: number
    ) => {
      const bounds = new THREE.Box3(
        new THREE.Vector3(-1, -1, near),
        new THREE.Vector3(1, 1, far)
      );
      return {
        content: { uri: name },
        parent: null,
        children: [],
        refine: "REPLACE",
        geometricError: error,
        internal: { hasRenderableContent: true, loadingState: 4 },
        traversal: { error },
        engineData: {
          boundingVolume: {
            getAABB: (target: THREE.Box3) => target.copy(bounds),
            intersectsFrustum: (frustum: THREE.Frustum) =>
              frustum.intersectsBox(bounds),
          },
        },
      } as unknown as Tile;
    };
    const parent = makeTile("parent", -2, 2, 16);
    const receiver = makeTile("receiver", -2, -1, 1);
    const outsideLight = makeTile("outside-light", 1, 2, 1);
    outsideLight.internal.loadingState = 0;
    parent.children = [receiver, outsideLight];
    receiver.parent = outsideLight.parent = parent;
    const main = new Set([parent, receiver]);
    state.tiles = {
      group: new THREE.Group(),
      markTileUsed: vi.fn(),
      dispatchEvent: vi.fn(),
      root: parent,
      rootTileset: { root: parent },
      loadingTiles: new Set(),
      ensureChildrenArePreprocessed: vi.fn(),
    } as unknown as RuntimeTilesRenderer;
    state.viewFrustumsReady = true;
    state.requestedErrorTarget = state.effectiveErrorTarget = 1;
    const observer = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
    observer.position.z = 10;
    state.tileCameraDemand = createTileCameraDemand(
      snapshotTileCameraViews([
        {
          id: "observer",
          camera: observer,
          viewport: [100, 100],
          role: TILE_CAMERA_ROLE.RECEIVER,
          errorTargetPixels: 1,
        },
      ])
    );
    const originalView = {
      camera: new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 10),
      shadowMapSize: { width: 100, height: 100 },
    };
    state.shadowView = originalView;
    state.rootWorldBoundingBox.set(
      new THREE.Vector3(-2, -2, -3),
      new THREE.Vector3(2, 2, 3)
    );
    state.committedMeshReceiverFrontier = new Set([parent]);
    state.committedMeshCasterFrontier = new Set([parent]);
    state.displayedMeshFrontier = new Set([parent]);
    const api = createThreeTilesShadows(state, {
      isTileInMainView: (tile) => main.has(tile),
      isChildUnloadable: () => false,
      updateRootWorldBounds: () => true,
      updateFrameFromTiles: () => new THREE.Matrix4(),
      getTileScreenError: (tile) => tile.geometricError,
      getStableTileId: (tile) => tile.content!.uri!,
      getTileCenterness: () => 1,
      getTileDebugId: (tile) => tile.content!.uri!,
      requestRender: vi.fn(),
      isPipelineIdle: () => false,
      applyRequestConcurrency: vi.fn(),
      notifyRequestStateChange: vi.fn(),
    });
    const advance = (viewportTiles: ReadonlySet<Tile>) => {
      api.advanceMeshShadowCorridors(viewportTiles, viewportTiles);
      state.displayedMeshFrontier = new Set(
        state.committedMeshReceiverFrontier
      );
    };
    api.setShadowView(originalView);
    expect(api.captureShadowReceiverSources()).toBe("updated");
    advance(new Set([receiver]));
    // A sunward sibling remains required beyond the light capture near plane.
    const match = {
      receiverGeometricError: Infinity,
      receiverCenterness: 0,
      lightFacing: 0,
    };
    const bounds = new THREE.Box3();
    outsideLight.engineData.boundingVolume.getAABB(bounds);
    expect(state.shadowReceiverMask?.match(bounds, match)).toBe(true);
    expect(state.committedMeshReceiverFrontier).toEqual(new Set([receiver]));
    expect(state.committedMeshCasterFrontier).toEqual(new Set([receiver]));

    state.runtimeVisible = true;
    const regionBounds = state.rootWorldBoundingBox.clone();
    const receiverBounds = new THREE.Box3();
    receiver.engineData.boundingVolume.getAABB(receiverBounds);
    expect(api.isShadowRegionReady(regionBounds, 1, receiverBounds)).toBe(false);
    const cachedProof = [...state.shadowRegionRevisions.values()][0];
    api.setShadowView({ ...originalView });
    expect([...state.shadowRegionRevisions.values()][0]).toBe(cachedProof);
    state.retainedShadowRequests.add(outsideLight);

    // Moving or resizing the capture volume does not remove parallel-ray demand
    // or cancel work already admitted for the same observer.
    const movedCamera = originalView.camera.clone();
    movedCamera.position.z = 5;
    api.setShadowView({ ...originalView, camera: movedCamera });
    expect(api.isShadowRegionReady(regionBounds, 1, receiverBounds)).toBe(
      false
    );
    expect(state.retainedShadowRequests.has(outsideLight)).toBe(true);
    api.setShadowView(originalView);
    expect(api.isShadowRegionReady(regionBounds, 1, receiverBounds)).toBe(false);

    const narrowerCamera = originalView.camera.clone();
    narrowerCamera.zoom = 2;
    narrowerCamera.updateProjectionMatrix();
    api.setShadowView({ ...originalView, camera: narrowerCamera });
    expect(state.shadowRegionRevisions.size).toBe(0);
    expect(api.isShadowRegionReady(regionBounds, 1, receiverBounds)).toBe(false);
    api.setShadowView({
      ...originalView,
      camera: narrowerCamera,
      shadowMapSize: { width: 200, height: 100 },
    });
    expect(state.shadowRegionRevisions.size).toBe(0);
    expect(state.retainedShadowRequests.has(outsideLight)).toBe(true);

    api.setShadowView({ ...originalView, camera: movedCamera });
    expect(api.isShadowRegionReady(regionBounds, 1, receiverBounds)).toBe(
      false
    );
    outsideLight.internal.loadingState = 4;
    state.committedMeshCasterFrontier.add(outsideLight);
    api.invalidateShadowRegionRevisions();
    expect(api.isShadowRegionReady(regionBounds, 1, receiverBounds)).toBe(true);
  });
});
