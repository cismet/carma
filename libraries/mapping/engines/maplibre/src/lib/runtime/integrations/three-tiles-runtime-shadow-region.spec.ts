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

describe("shadow publication demand boundary", () => {
  it.each([false, true])(
    "proves empty receiver regions with geometric bounds (partial=%s)",
    (partial) => {
      const onContentChanged = vi.fn();
      const state = createThreeTilesRuntimeState(
        "mesh",
        "mesh.json",
        [7.2, 51.2],
        { providesTerrain: true, onContentChanged }
      );
      const bounds = new THREE.Box3(
        new THREE.Vector3(-1, -1, -2),
        new THREE.Vector3(11, 1, -1)
      );
      const makeTile = (name: string, parent: Tile | null = null) =>
        ({
          content: { uri: name },
          parent,
          children: [],
          refine: "REPLACE",
          geometricError: 1,
          internal: { hasRenderableContent: true, loadingState: 4 },
          traversal: { error: 1 },
          engineData: {
            boundingVolume: {
              getAABB: (target: THREE.Box3) => target.copy(bounds),
              intersectsFrustum: (frustum: THREE.Frustum) =>
                frustum.intersectsBox(bounds),
            },
          },
        } as unknown as Tile);
      const root = makeTile("root");
      root.internal.hasRenderableContent = false;
      root.internal.hasContent = false;
      const parent = makeTile("parent", root);
      const stable = makeTile("stable", root);
      root.children = partial ? [parent, stable] : [parent];
      const metadata = makeTile("metadata", parent);
      const outside = makeTile("outside", metadata);
      parent.children = [metadata];
      metadata.internal.hasRenderableContent = false;
      metadata.internal.hasUnrenderableContent = true;
      metadata.internal.loadingState = 0;
      const group = new THREE.Group();
      group.add(new THREE.Group());
      state.tiles = {
        group,
        rootTileset: { root },
        markTileUsed: vi.fn(),
        dispatchEvent: vi.fn(),
      } as unknown as RuntimeTilesRenderer;
      state.cameraSet = {} as NonNullable<typeof state.cameraSet>;
      state.viewFrustumsReady = true;
      state.requestedErrorTarget = state.effectiveErrorTarget = 1;
      const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
      camera.position.z = 10;
      state.tileCameraDemand = createTileCameraDemand(
        snapshotTileCameraViews([
          {
            id: "observer",
            camera,
            viewport: [100, 100],
            role: TILE_CAMERA_ROLE.RECEIVER,
            errorTargetPixels: 1,
          },
        ])
      );
      state.shadowView = {
        camera,
        shadowMapSize: { width: 100, height: 100 },
      };
      state.rootWorldBoundingBox.copy(bounds);
      const previous = new Set(partial ? [parent, stable] : [parent]);
      state.committedMeshReceiverFrontier = new Set(previous);
      state.committedMeshCasterFrontier = new Set(previous);
      const api = createThreeTilesShadows(state, {
        isTileInMainView: (tile) => tile !== outside,
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
      api.captureShadowReceiverSources();
      const oldMask = state.shadowReceiverMask;
      expect(oldMask).not.toBeNull();
      const candidates = new Set(partial ? [stable] : []);
      const advance = () =>
        api.advanceMeshShadowCorridors(candidates, previous);
      const expectRetained = () => {
        expect(state.committedMeshReceiverFrontier).toEqual(previous);
        expect(state.committedMeshCasterFrontier).toEqual(previous);
        expect(state.shadowReceiverMask).toBe(oldMask);
        expect(onContentChanged).not.toHaveBeenCalled();
      };
      advance();
      expectRetained();
      metadata.internal.loadingState = 4;
      advance();
      expectRetained();
      metadata.children = [outside];
      // Preprocessed traversal can carry a false native flag before its geometric
      // volume exists. That cannot release either the whole or a partial cut.
      outside.traversal.inFrustum = false;
      const outsideVolume = outside.engineData.boundingVolume;
      Reflect.deleteProperty(outside.engineData, "boundingVolume");
      advance();
      expectRetained();
      outside.engineData.boundingVolume = outsideVolume;
      state.viewFrustumsReady = false;
      advance();
      expectRetained();
      state.viewFrustumsReady = true;
      advance();
      expect(state.committedMeshReceiverFrontier).toEqual(candidates);
      expect(state.committedMeshCasterFrontier).toEqual(
        new Set(partial ? [stable, outside] : [])
      );
      expect(state.pendingMeshReceiverFrontier).toBeNull();
      if (!partial) {
        expect(state.shadowReceiverMask).toBeNull();
        expect(state.mainViewSourceTiles.size).toBe(0);
      }
      expect(onContentChanged).toHaveBeenCalledOnce();
      expect(onContentChanged).toHaveBeenCalledWith(
        expect.arrayContaining([bounds])
      );
      advance();
      expect(onContentChanged).toHaveBeenCalledOnce();
    }
  );

  it("uses the light volume and grid for publication and cached regional proofs", () => {
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
      rootTileset: { root: parent },
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
    api.setShadowView(originalView);
    expect(api.captureShadowReceiverSources()).toBe("updated");
    api.advanceMeshShadowCorridors(new Set([receiver]), new Set([receiver]));
    // The mask reaches the sibling, but the light's near plane excludes it.
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
    expect(state.pendingMeshReceiverFrontier).toBeNull();

    state.runtimeVisible = true;
    const regionBounds = state.rootWorldBoundingBox.clone();
    const receiverBounds = new THREE.Box3();
    receiver.engineData.boundingVolume.getAABB(receiverBounds);
    expect(api.isShadowRegionReady(regionBounds, 1, receiverBounds)).toBe(true);
    const cachedProof = [...state.shadowRegionRevisions.values()][0];
    api.setShadowView({ ...originalView });
    expect([...state.shadowRegionRevisions.values()][0]).toBe(cachedProof);
    state.retainedShadowRequests.add(outsideLight);

    // Same sun direction, different frustum: a positive proof becomes negative,
    // then positive again when the missing branch leaves the light volume.
    const movedCamera = originalView.camera.clone();
    movedCamera.position.z = 5;
    api.setShadowView({ ...originalView, camera: movedCamera });
    expect(api.isShadowRegionReady(regionBounds, 1, receiverBounds)).toBe(
      false
    );
    expect(state.retainedShadowRequests.has(outsideLight)).toBe(true);
    api.setShadowView(originalView);
    expect(api.isShadowRegionReady(regionBounds, 1, receiverBounds)).toBe(true);

    const narrowerCamera = originalView.camera.clone();
    narrowerCamera.zoom = 2;
    narrowerCamera.updateProjectionMatrix();
    api.setShadowView({ ...originalView, camera: narrowerCamera });
    expect(state.shadowRegionRevisions.size).toBe(0);
    expect(api.isShadowRegionReady(regionBounds, 1, receiverBounds)).toBe(true);
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
