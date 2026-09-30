// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";
import { Box3, OrthographicCamera, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mesh } from "../../core/mesh-tile-test-fixtures";
import {
  createTileCameraDemand,
  snapshotTileCameraViews,
  TILE_MAIN_OBSERVER_ID,
  TILE_SHADOW_CAMERA_ID,
  TILE_CAMERA_ROLE,
} from "../../core/tile-camera-demand";
import { TILE_REQUEST_NEED } from "../../core/tile-request-need";
import type { ThreeTilesRuntimeAttachmentDependencies } from "./three-tiles-runtime-attachment";
import type { createThreeTilesPayloadQueues } from "./three-tiles-runtime-payload-queues";
import { createThreeTilesRuntimeState } from "./three-tiles-runtime-state";
import { installThreeTilesTraversalHooks } from "./three-tiles-runtime-traversal-hooks";
import type {
  RuntimeTile,
  RuntimeTilesRenderer,
} from "./three-tiles-runtime-types";

vi.hoisted(() =>
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:traversal-camera-test",
  })
);

const fixture = (cameraId = TILE_MAIN_OBSERVER_ID) => {
  const state = createThreeTilesRuntimeState("mesh", "mesh.json", [7, 51], {
    providesTerrain: true,
  });
  state.tiles = new TilesRenderer() as RuntimeTilesRenderer;
  state.tiles.loadAncestors = true;
  state.requestedErrorTarget =
    state.effectiveErrorTarget =
    state.memoryErrorTarget =
      6;
  state.meshBaseCoverageReady = true;
  state.tileCameraDemand = createTileCameraDemand(
    snapshotTileCameraViews([
      {
        id: cameraId,
        camera: new OrthographicCamera(),
        viewport: [800, 600],
        errorTargetPixels: 6,
        role:
          cameraId === TILE_SHADOW_CAMERA_ID
            ? TILE_CAMERA_ROLE.GEOMETRY
            : TILE_CAMERA_ROLE.RECEIVER,
      },
    ])
  );
  const nativeQueue = vi
    .spyOn(state.tiles, "queueTileForDownload")
    .mockImplementation(() => undefined);
  const nativeError = vi
    .spyOn(state.tiles, "calculateTileViewErrorWithPlugin")
    .mockImplementation((_tile, target) =>
      Object.assign(target, { inView: true, error: 60 })
    );
  const dependencies = {
    getTileCameraDemand: vi.fn((_tile: RuntimeTile) => ({
      required: true,
      receiver: true,
      errorRatio: 10,
      refinementErrorRatio: 2,
      priority: 1,
    })),
    getTileObserverDemand: vi.fn(() => ({ intersects: true, errorPixels: 60 })),
    getTileScreenError: vi.fn(() => 60),
    getTileRingIndex: vi.fn(() => 0),
    getRetainedMeshAncestors: () => new Set(),
    getTileRequestNeed: vi.fn(
      (): (typeof TILE_REQUEST_NEED)[keyof typeof TILE_REQUEST_NEED] =>
        TILE_REQUEST_NEED.CAMERA
    ),
    isTileRequestNeeded: () => true,
    isTileNeededForMeshCoverage: () => false,
    isTileInMainView: () => true,
    applyTileDeferral: vi.fn(),
    assignTilePriority: vi.fn(),
    getTileDebugProgress: () => ({}),
    noteTileActivity: vi.fn(),
  };
  const makeRoomForRequest = vi.fn();
  installThreeTilesTraversalHooks(
    state,
    dependencies as unknown as ThreeTilesRuntimeAttachmentDependencies,
    { makeRoomForRequest } as unknown as ReturnType<
      typeof createThreeTilesPayloadQueues
    >
  );
  return { state, dependencies, nativeQueue, nativeError, makeRoomForRequest };
};

afterEach(() => vi.restoreAllMocks());

const offscreenFloorFixture = () => {
  const mounted = fixture();
  mounted.state.tiles!.loadAncestors = false;
  mounted.state.extentFloorArmed = true;
  mounted.state.extentGeometricError = 32;
  mounted.state.lastActiveViewsConverged = true;
  mounted.nativeError.mockImplementation((_tile, target) =>
    Object.assign(target, { inView: false, error: 0 })
  );
  mounted.dependencies.getTileCameraDemand.mockReturnValue({
    required: false,
    receiver: false,
    errorRatio: 0,
    refinementErrorRatio: 0,
    priority: -Infinity,
  });
  return mounted;
};

describe("camera-local traversal admission", () => {
  it("reaches offscreen zero-error routing while stopping below the drawable floor", () => {
    const { state, dependencies, nativeQueue } = offscreenFloorFixture();
    dependencies.getTileRequestNeed.mockReturnValue(TILE_REQUEST_NEED.EXTENT);
    const root = mesh() as RuntimeTile;
    root.geometricError = 0;
    root.internal.hasRenderableContent = false;
    const route = mesh(root) as RuntimeTile;
    route.geometricError = 0;
    route.internal.hasRenderableContent = false;
    route.internal.hasUnrenderableContent = true;
    route.internal.loadingState = 0;
    root.children = [route];
    const floor = mesh(route) as RuntimeTile;
    floor.geometricError = 32;
    const fine = mesh(floor) as RuntimeTile;
    fine.geometricError = 16;
    const deeperRoute = mesh(fine) as RuntimeTile;
    deeperRoute.geometricError = 0;
    deeperRoute.internal.hasRenderableContent = false;
    deeperRoute.internal.hasUnrenderableContent = true;
    try {
      for (const tile of [root, route]) {
        const target = { inView: false, error: 0, distanceFromCamera: 0 };
        state.tiles!.calculateTileViewErrorWithPlugin(tile, target);
        expect(target.inView).toBe(true);
        expect(target.error).toBeGreaterThan(state.effectiveErrorTarget);
      }
      state.tiles!.queueTileForDownload(route);
      expect(nativeQueue).toHaveBeenCalledWith(route);
      nativeQueue.mockClear();
      for (const tile of [fine, deeperRoute]) {
        const target = { inView: false, error: 0, distanceFromCamera: 0 };
        state.tiles!.calculateTileViewErrorWithPlugin(tile, target);
        expect(target.inView).toBe(false);
      }
      expect(nativeQueue).not.toHaveBeenCalled();
    } finally {
      state.tiles!.dispose();
    }
  });

  it("discovers the floor through external metadata before stopping at the next finer payload", () => {
    const { state } = offscreenFloorFixture();
    const parent = mesh() as RuntimeTile;
    parent.geometricError = 64;
    const route = mesh(parent) as RuntimeTile;
    route.geometricError = 0;
    route.internal.hasRenderableContent = false;
    route.internal.hasUnrenderableContent = true;
    route.internal.loadingState = 0;
    parent.children = [route];
    const floor = mesh(route) as RuntimeTile;
    floor.geometricError = 32;
    floor.internal.loadingState = 0;
    const fine = mesh(floor) as RuntimeTile;
    fine.geometricError = 16;
    fine.internal.loadingState = 0;
    floor.children = [fine];
    try {
      const parentTarget = { inView: false, error: 0, distanceFromCamera: 0 };
      state.tiles!.calculateTileViewErrorWithPlugin(parent, parentTarget);
      expect(parentTarget.error).toBeGreaterThan(state.effectiveErrorTarget);
      route.internal.loadingState = 4;
      route.children = [floor];
      state.tiles!.calculateTileViewErrorWithPlugin(parent, parentTarget);
      expect(parentTarget.error).toBeGreaterThan(state.effectiveErrorTarget);
      const floorTarget = { inView: false, error: 0, distanceFromCamera: 0 };
      state.tiles!.calculateTileViewErrorWithPlugin(floor, floorTarget);
      expect(floorTarget.inView).toBe(true);
      expect(floorTarget.error).toBeLessThanOrEqual(state.effectiveErrorTarget);
    } finally {
      state.tiles!.dispose();
    }
  });

  it.each([0, 4])(
    "does not treat external metadata with unknown children as a terminal floor (state=%s)",
    (loadingState) => {
      const { state } = offscreenFloorFixture();
      const parent = mesh() as RuntimeTile;
      parent.geometricError = 64;
      const route = mesh(parent) as RuntimeTile;
      route.geometricError = 0;
      route.internal.hasRenderableContent = false;
      route.internal.hasUnrenderableContent = true;
      route.internal.loadingState = loadingState;
      parent.children = [route];
      try {
        const target = { inView: false, error: 0, distanceFromCamera: 0 };
        state.tiles!.calculateTileViewErrorWithPlugin(parent, target);
        expect(target.error).toBeGreaterThan(state.effectiveErrorTarget);
      } finally {
        state.tiles!.dispose();
      }
    }
  );

  it("accepts known empty branches when the resident floor has no finer payload", () => {
    const { state } = offscreenFloorFixture();
    const parent = mesh() as RuntimeTile;
    parent.geometricError = 64;
    const empty = mesh(parent) as RuntimeTile;
    empty.geometricError = 0;
    empty.internal.hasRenderableContent = false;
    empty.internal.hasContent = false;
    parent.children = [empty];
    try {
      const target = { inView: false, error: 0, distanceFromCamera: 0 };
      state.tiles!.calculateTileViewErrorWithPlugin(parent, target);
      expect(target.inView).toBe(true);
      expect(target.error).toBeLessThanOrEqual(state.effectiveErrorTarget);
    } finally {
      state.tiles!.dispose();
    }
  });

  it.each([
    TILE_REQUEST_NEED.CAMERA,
    TILE_REQUEST_NEED.SHADOW,
    TILE_REQUEST_NEED.SUPPORT,
  ])(
    "checks reservation capacity for %s refinement without a viewport gap",
    (reason) => {
      const { state, dependencies, makeRoomForRequest, nativeQueue } =
        fixture();
      const tile = mesh() as RuntimeTile;
      tile.internal.loadingState = 0;
      dependencies.getTileRequestNeed.mockReturnValue(reason);
      state.tiles!.queueTileForDownload(tile);
      expect(state.meshCoverageRecovery).toBe(false);
      expect(makeRoomForRequest).toHaveBeenCalledWith(tile);
      expect(nativeQueue).toHaveBeenCalledWith(tile);
      state.tiles!.dispose();
    }
  );

  it.each([
    { effective: 6, memory: 6, admitted: true },
    { effective: 9, memory: 9, admitted: false },
    { effective: 6, memory: 9, admitted: false },
    { effective: 24, memory: 6, admitted: false },
  ])(
    "requests optional ancestors only at requested quality (%j)",
    ({ effective, memory, admitted }) => {
      const { state, nativeQueue } = fixture();
      state.tiles!.loadAncestors = false;
      state.lastActiveViewsConverged = true;
      state.effectiveErrorTarget = effective;
      state.memoryErrorTarget = memory;
      const tile = mesh() as RuntimeTile;
      tile.internal.loadingState = 0;
      state.residentAncestors.add(tile);
      const used = vi.spyOn(state.tiles!, "markTileUsed");
      state.tiles!.calculateTileViewErrorWithPlugin(tile, {
        inView: true,
        error: 60,
        distanceFromCamera: 0,
      });
      expect(nativeQueue).toHaveBeenCalledTimes(admitted ? 1 : 0);
      // Existing ancestry residency remains pinned even while new work waits.
      expect(used).toHaveBeenCalledWith(tile);
      state.tiles!.dispose();
    }
  );

  it.each([TILE_MAIN_OBSERVER_ID, TILE_SHADOW_CAMERA_ID])(
    "preserves the first drawable stop, metadata routing, and published refinement for %s",
    (cameraId) => {
      const { state, dependencies, nativeQueue } = fixture(cameraId);
      state.tiles!.loadAncestors = false;
      state.meshBaseCoverageReady = false;
      const route = mesh() as RuntimeTile;
      route.internal.loadingState = 0;
      route.internal.hasRenderableContent = false;
      route.internal.hasUnrenderableContent = true;
      const coarse = mesh(route) as RuntimeTile;
      coarse.internal.loadingState = 0;
      for (const tile of [route, coarse])
        tile.engineData = {
          boundingVolume: {
            getAABB: (box: Box3) =>
              box.set(new Vector3(-1, -1, -10), new Vector3(1, 1, -8)),
          },
        } as RuntimeTile["engineData"];
      let published = false;
      dependencies.getTileCameraDemand.mockImplementation((tile) => ({
        required: true,
        receiver: true,
        errorRatio: 10,
        refinementErrorRatio: tile === route || published ? 2 : 1,
        priority: 1,
      }));
      try {
        const metadataTarget = {
          inView: false,
          error: 0,
          distanceFromCamera: 0,
        };
        state.tiles!.calculateTileViewErrorWithPlugin(route, metadataTarget);
        expect(metadataTarget.error).toBeGreaterThan(
          state.effectiveErrorTarget
        );
        state.tiles!.queueTileForDownload(route);
        expect(nativeQueue).toHaveBeenCalledWith(route);

        const coarseTarget = { inView: false, error: 0, distanceFromCamera: 0 };
        state.tiles!.calculateTileViewErrorWithPlugin(coarse, coarseTarget);
        expect(coarseTarget.inView).toBe(true);
        expect(coarseTarget.error).toBe(state.effectiveErrorTarget);
        state.tiles!.queueTileForDownload(coarse);
        expect(nativeQueue).toHaveBeenCalledWith(coarse);

        coarse.internal.loadingState = 4;
        state.committedMeshCasterFrontier.add(coarse);
        state.tiles!.calculateTileViewErrorWithPlugin(coarse, coarseTarget);
        expect(coarseTarget.error).toBe(state.effectiveErrorTarget);

        published = true;
        state.displayedMeshFrontier.add(coarse);
        state.tiles!.calculateTileViewErrorWithPlugin(coarse, coarseTarget);
        expect(coarseTarget.error).toBeGreaterThan(state.effectiveErrorTarget);
      } finally {
        state.tiles!.dispose();
      }
    }
  );

  it("keeps tiles rejected by the active shadow camera outside traversal", () => {
    const { state, dependencies, nativeError } = fixture(TILE_SHADOW_CAMERA_ID);
    const tile = mesh() as RuntimeTile;
    tile.geometricError = 1;
    tile.engineData = {
      boundingVolume: {
        getAABB: (box: Box3) =>
          box.set(new Vector3(-1, -1, -10), new Vector3(1, 1, -8)),
      },
    } as RuntimeTile["engineData"];
    state.shadowSelectionEnabled = true;
    const match = vi.fn(() => true);
    state.shadowReceiverMask = { match } as unknown as NonNullable<
      typeof state.shadowReceiverMask
    >;
    dependencies.getTileCameraDemand.mockReturnValue({
      required: false,
      receiver: false,
      errorRatio: 0,
      refinementErrorRatio: 0,
      priority: -Infinity,
    });
    nativeError.mockImplementation((_tile, target) =>
      Object.assign(target, { inView: false, error: 0 })
    );
    try {
      const target = { inView: false, error: 0, distanceFromCamera: 0 };
      state.tiles!.calculateTileViewErrorWithPlugin(tile, target);
      expect(target.inView).toBe(false);
      expect(match).not.toHaveBeenCalled();
    } finally {
      state.tiles!.dispose();
    }
  });

  it.each([true, false])(
    "uses the staged camera union instead of raw observer SSE (observer=%s)",
    (inObserver) => {
      const { state, dependencies, nativeError } = fixture();
      const tile = mesh() as RuntimeTile;
      tile.engineData = {
        boundingVolume: {
          getAABB: (box: Box3) =>
            box.set(new Vector3(-1, -1, -10), new Vector3(1, 1, -8)),
        },
      } as RuntimeTile["engineData"];
      dependencies.getTileObserverDemand.mockReturnValue({
        intersects: inObserver,
        errorPixels: 60,
      });
      nativeError.mockImplementation((_tile, target) =>
        Object.assign(target, { inView: inObserver, error: 60 })
      );
      try {
        const target = { inView: false, error: 0, distanceFromCamera: 0 };
        state.tiles!.calculateTileViewErrorWithPlugin(tile, target);
        expect(target.inView).toBe(true);
        expect(target.error).toBe(12);
        expect(dependencies.getTileCameraDemand).toHaveBeenCalledWith(
          tile,
          true
        );
      } finally {
        state.tiles!.dispose();
      }
    }
  );

  it.each([
    TILE_REQUEST_NEED.CAMERA,
    TILE_REQUEST_NEED.SHADOW,
    TILE_REQUEST_NEED.VIEW,
  ])("keeps physical pauses while honoring current %s ownership", (reason) => {
    const { state, dependencies, nativeQueue } = fixture();
    const tile = mesh(mesh(null, 0.5)) as RuntimeTile;
    tile.internal.loadingState = 0;
    dependencies.getTileRequestNeed.mockReturnValue(reason);
    dependencies.getTileScreenError.mockReturnValue(0.5);
    try {
      state.memoryAdmissionPaused = true;
      state.tiles!.queueTileForDownload(tile);
      expect(nativeQueue).not.toHaveBeenCalled();
      state.memoryAdmissionPaused = false;
      state.tiles!.queueTileForDownload(tile);
      expect(nativeQueue).toHaveBeenCalledTimes(
        reason === TILE_REQUEST_NEED.VIEW ? 0 : 1
      );
    } finally {
      state.tiles!.dispose();
    }
  });
});
