// @vitest-environment jsdom

import { TilesRenderer } from "3d-tiles-renderer";
import { PriorityQueue } from "3d-tiles-renderer/core";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { TILE_OUTLINE_FLAG } from "@carma-mapping/engines/threejs";
import { setSharedThreeTerrainLoading } from "./shared-three-terrain-registry";
import { TILES_LOAD_POLICY } from "./three-tiles-load-policy";
import {
  buildThreeTilesRuntime,
  HIDDEN_TAB_WIPE_DELAY_MS,
} from "./three-tiles-runtime";

const MIB = 1024 ** 2;

type BytesRenderer = {
  calculateBytesUsed: (tile: unknown, scene: THREE.Object3D | null) => number;
};

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-maplibre-worker",
  });
});

describe("three tiles runtime styling", () => {
  it("isolates loader resources per tileset and prices measured tiles with the resident overhead", () => {
    const renderers: TilesRenderer[] = [];
    const updateSpy = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function (this: TilesRenderer) {
        renderers.push(this);
      });
    // `calculateBytesUsed` is an untyped upstream plugin hook.
    const bytesSpy = vi
      .spyOn(
        TilesRenderer.prototype as unknown as BytesRenderer,
        "calculateBytesUsed"
      )
      .mockReturnValue(10.6);
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    const camera = new THREE.PerspectiveCamera();
    const frame = {
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    };
    const first = buildThreeTilesRuntime("first", "first.json", [7.15, 51.25]);
    const second = buildThreeTilesRuntime(
      "second",
      "second.json",
      [7.15, 51.25]
    );

    first.onAdd?.(map);
    second.onAdd?.(map);
    first.update(frame);
    second.update(frame);

    expect(renderers).toHaveLength(2);
    expect(renderers[0]?.lruCache).not.toBe(renderers[1]?.lruCache);
    expect(renderers[0]?.downloadQueue).not.toBe(renderers[1]?.downloadQueue);
    expect(renderers[0]?.parseQueue).not.toBe(renderers[1]?.parseQueue);
    expect(renderers[0]?.processNodeQueue).not.toBe(
      renderers[1]?.processNodeQueue
    );
    expect(renderers[0]?.loadAncestors).toBe(true);
    expect(renderers[0]?.loadSiblings).toBe(false);
    expect(renderers[0]?.displayActiveTiles).toBe(true);
    expect(
      (renderers[0] as unknown as BytesRenderer).calculateBytesUsed(
        {} as never,
        new THREE.Group()
      )
    ).toBe(Math.round(10.6 * TILES_LOAD_POLICY.residentOverhead));

    first.dispose();
    second.dispose();
    bytesSpy.mockRestore();
    updateSpy.mockRestore();
  });

  it("keeps the parent fallback eligible after a child exhausts its retries", () => {
    vi.useFakeTimers();
    type TraversalRenderer = TilesRenderer & {
      queueTileForDownload: (tile: unknown) => void;
      stats: { failed: number };
    };
    const prototype = TilesRenderer.prototype as TraversalRenderer;
    const queueSpy = vi
      .spyOn(prototype, "queueTileForDownload")
      .mockImplementation(() => undefined);
    let renderer: TraversalRenderer | undefined;
    const updateSpy = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function (this: TilesRenderer) {
        renderer = this as TraversalRenderer;
      });
    const map = {
      getCenter: vi.fn(() => ({ lng: 7.15, lat: 51.25 })),
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25]);
    const camera = new THREE.PerspectiveCamera();
    const failedTile = {
      content: { uri: "child.b3dm" },
      internal: {
        basePath: "https://example.test/tiles",
        loadingState: -1,
      },
      traversal: { inFrustum: true },
    };

    layer.onAdd?.(map);
    layer.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      failedTile.internal.loadingState = -1;
      renderer!.stats.failed = 1;
      renderer!.dispatchEvent({
        type: "load-error",
        tile: failedTile as never,
        error: new Error("status 503"),
        url: "https://example.test/tiles/child.b3dm",
      });
      // The failed tile is released at once (UNLOADED, out of the cache) but
      // not requested again until its backoff fired: the parent keeps
      // rendering as the fallback meanwhile.
      expect(failedTile.internal.loadingState).toBe(0);
      expect(renderer!.stats.failed).toBe(0);
      renderer!.queueTileForDownload(failedTile);
      expect(queueSpy).toHaveBeenCalledTimes(attempt);
      vi.runOnlyPendingTimers();
      renderer!.queueTileForDownload(failedTile);
      expect(queueSpy).toHaveBeenCalledTimes(attempt + 1);
    }

    failedTile.internal.loadingState = -1;
    renderer!.stats.failed = 1;
    renderer!.dispatchEvent({
      type: "load-error",
      tile: failedTile as never,
      error: new Error("status 503"),
      url: "https://example.test/tiles/child.b3dm",
    });

    expect(failedTile.internal.loadingState).toBe(0);
    expect(renderer!.stats.failed).toBe(0);
    queueSpy.mockClear();
    renderer!.queueTileForDownload(failedTile);
    expect(queueSpy).not.toHaveBeenCalled();

    // A missing tile is never retried at all.
    const missingTile = {
      content: { uri: "missing.b3dm" },
      internal: { basePath: "https://example.test/tiles", loadingState: -1 },
      traversal: { inFrustum: true },
    };
    renderer!.stats.failed = 1;
    renderer!.dispatchEvent({
      type: "load-error",
      tile: missingTile as never,
      error: new Error("status 404"),
      url: "https://example.test/tiles/missing.b3dm",
    });
    expect(missingTile.internal.loadingState).toBe(0);
    vi.advanceTimersByTime(60_000);
    renderer!.queueTileForDownload(missingTile);
    expect(queueSpy).not.toHaveBeenCalled();

    layer.dispose();
    updateSpy.mockRestore();
    queueSpy.mockRestore();
    vi.useRealTimers();
  });

  it("admits at one physical ceiling below the device limit and evicts around it", () => {
    let renderer: TilesRenderer | undefined;
    const updateSpy = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function (this: TilesRenderer) {
        renderer = this;
      });
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    const cacheBudgetBytes = 256 * MIB;
    const cacheOverflowBytes = 256 * MIB;
    const ceilingBytes = cacheBudgetBytes + cacheOverflowBytes;
    const layer = buildThreeTilesRuntime(
      "mesh",
      "tileset.json",
      [7.15, 51.25],
      {
        cacheBudgetBytes,
        cacheOverflowBytes,
        providesTerrain: true,
        shadowBuildingStyle: true,
      }
    );
    const camera = new THREE.PerspectiveCamera();

    layer.onAdd?.(map);
    layer.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    });

    const expectBounds = () => {
      expect(renderer?.lruCache.minBytesSize).toBe(
        Math.floor(ceilingBytes * TILES_LOAD_POLICY.cacheRetentionFraction)
      );
      expect(renderer?.lruCache.maxBytesSize).toBe(
        ceilingBytes + TILES_LOAD_POLICY.cacheDriftSlackMinBytes
      );
      expect(renderer?.lruCache.unloadPercent).toBe(
        TILES_LOAD_POLICY.cacheUnloadPercent
      );
      expect(renderer?.lruCache.minSize).toBe(6_000);
      expect(renderer?.lruCache.maxSize).toBe(8_000);
    };
    expectBounds();
    layer.setShadowSimulationStyle({
      fullOpacity: true,
      uniformColor: null,
    });
    expectBounds();
    layer.setShadowSimulationStyle(null);
    expectBounds();

    const cache = renderer?.lruCache as TilesRenderer["lruCache"] & {
      cachedBytes: number;
      isFull: () => boolean;
    };
    cache.cachedBytes = ceilingBytes - 1;
    expect(cache.isFull()).toBe(false);
    cache.cachedBytes = ceilingBytes;
    expect(cache.isFull()).toBe(true);

    const shadowCamera = new THREE.OrthographicCamera();
    layer.setShadowView({
      camera: shadowCamera,
      shadowMapSize: { width: 4_096, height: 4_096 },
    });
    expect(cache.isFull()).toBe(true);
    layer.setShadowView(null);
    expect(cache.isFull()).toBe(true);

    // A style may only lower the ceiling; the floor still applies.
    layer.setCacheBudget(1024);
    expect(cache.isFull()).toBe(true);
    cache.cachedBytes = 100 * MIB;
    expect(cache.isFull()).toBe(false);

    layer.dispose();
    updateSpy.mockRestore();
  });

  it("loads a terrain-providing mesh while fallback terrain is still loading", () => {
    let renderer: TilesRenderer | undefined;
    const updateSpy = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function (this: TilesRenderer) {
        renderer = this;
      });
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    const layer = buildThreeTilesRuntime(
      "mesh",
      "tileset.json",
      [7.15, 51.25],
      {
        providesTerrain: true,
      }
    );
    const camera = new THREE.PerspectiveCamera();
    setSharedThreeTerrainLoading(map, "fallback-terrain", true);

    layer.onAdd?.(map);
    layer.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    });

    expect(renderer?.downloadQueue.maxJobsPerOrigin).toBeGreaterThan(0);
    expect(layer.hasRenderableContent?.()).toBe(false);
    const tilesGroup = layer.root.children[0]?.children[0];
    tilesGroup?.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial()
      )
    );
    expect(layer.hasRenderableContent?.()).toBe(true);

    setSharedThreeTerrainLoading(map, "fallback-terrain", false);
    layer.dispose();
    updateSpy.mockRestore();
  });

  it("keeps progressive visible-content slots while terrain is loading", () => {
    let renderer: TilesRenderer | undefined;
    const updateSpy = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function (this: TilesRenderer) {
        renderer = this;
      });
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    const layer = buildThreeTilesRuntime(
      "buildings",
      "tileset.json",
      [7.15, 51.25]
    );
    const camera = new THREE.PerspectiveCamera();
    setSharedThreeTerrainLoading(map, "fallback-terrain", true);

    layer.onAdd?.(map);
    layer.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    });

    expect(renderer?.downloadQueue.maxJobsPerOrigin).toBe(8);

    setSharedThreeTerrainLoading(map, "fallback-terrain", false);
    expect(renderer?.downloadQueue.maxJobsPerOrigin).toBeGreaterThan(1);
    layer.dispose();
    updateSpy.mockRestore();
  });

  it("exposes the active 3D tile volumes in shared scene coordinates", () => {
    let renderer: TilesRenderer | undefined;
    const updateSpy = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function (this: TilesRenderer) {
        renderer = this;
      });
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    const layer = buildThreeTilesRuntime(
      "buildings",
      "tileset.json",
      [7.15, 51.25]
    );
    const camera = new THREE.PerspectiveCamera();

    layer.onAdd?.(map);
    layer.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    });
    renderer!.activeTiles.add({
      content: { uri: "building.b3dm" },
      internal: { depth: 3 },
      engineData: {
        scene: new THREE.Group(),
        boundingVolume: {
          getAABB: (target: THREE.Box3) =>
            target.set(
              new THREE.Vector3(-2, 10, -4),
              new THREE.Vector3(2, 30, 4)
            ),
        },
      },
    } as never);

    const volumes = layer.getActiveTileVolumes?.() ?? [];

    expect(volumes).toHaveLength(1);
    expect(volumes[0]).toMatchObject({
      id: "buildings:building.b3dm",
      kind: "3d-tile",
    });
    expect(volumes[0]?.minimum.every(Number.isFinite)).toBe(true);
    expect(volumes[0]?.maximum.every(Number.isFinite)).toBe(true);

    layer.dispose();
    updateSpy.mockRestore();
  });

  it("does not retraverse for an unchanged error target", () => {
    let renderer: TilesRenderer | undefined;
    const updateSpy = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function (this: TilesRenderer) {
        renderer = this;
      });
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25]);
    const camera = new THREE.PerspectiveCamera();

    layer.onAdd?.(map);
    layer.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    });
    const dispatchSpy = vi.spyOn(renderer!, "dispatchEvent");

    layer.setErrorTarget(1);
    const callsAfterChange = dispatchSpy.mock.calls.length;
    layer.setErrorTarget(1);

    expect(dispatchSpy).toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledTimes(callsAfterChange);

    layer.dispose();
    updateSpy.mockRestore();
  });

  it("uses receiver extrusion without registering a shadow selection camera", () => {
    const updateErrorTargets: number[] = [];
    const eventOrder: string[] = [];
    let renderer: TilesRenderer | undefined;
    const updateSpy = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function (this: TilesRenderer) {
        renderer = this;
        updateErrorTargets.push(this.errorTarget);
        eventOrder.push("update");
      });
    const setCameraSpy = vi
      .spyOn(TilesRenderer.prototype, "setCamera")
      .mockImplementation((camera) => {
        eventOrder.push(
          camera instanceof THREE.OrthographicCamera
            ? "shadow-camera"
            : "view-camera"
        );
        return true;
      });
    const deleteCameraSpy = vi
      .spyOn(TilesRenderer.prototype, "deleteCamera")
      .mockImplementation(() => true);
    const setResolutionSpy = vi
      .spyOn(TilesRenderer.prototype, "setResolution")
      .mockImplementation(() => true);
    const registerPluginSpy = vi.spyOn(
      TilesRenderer.prototype,
      "registerPlugin"
    );
    const handlers = new Map<string, () => void>();
    const map = {
      on: vi.fn((event: string, handler: () => void) => {
        handlers.set(event, handler);
      }),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    const layer = buildThreeTilesRuntime(
      "mesh",
      "tileset.json",
      [7.15, 51.25],
      { providesTerrain: true }
    );
    const viewCamera = new THREE.PerspectiveCamera();
    const shadowCamera = new THREE.OrthographicCamera();
    const isShadowCameraCall = ([camera]: unknown[]) =>
      camera instanceof THREE.OrthographicCamera;
    const registeredShadowCamera = (spy: { mock: { calls: unknown[][] } }) =>
      spy.mock.calls.some(isShadowCameraCall);

    layer.setErrorTarget(0.25);
    layer.onAdd?.(map);
    layer.setShadowView({
      camera: shadowCamera,
      shadowMapSize: { width: 2048, height: 2048 },
    });
    layer.update({
      map,
      renderCamera: viewCamera,
      lodCamera: viewCamera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    });

    expect(updateErrorTargets).toEqual([0.25]);
    expect(registeredShadowCamera(setCameraSpy)).toBe(false);
    // Loaded content exists; the shadow camera never joins an empty scene.
    renderer!.group.add(new THREE.Group());
    const visibleTile = {
      traversal: { error: 0.2, inFrustum: true },
      children: [{ internal: { hasContent: true, loadingState: 0 } }],
    };
    renderer!.visibleTiles.add(visibleTile as never);
    layer.update({
      map,
      renderCamera: viewCamera,
      lodCamera: viewCamera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    });

    expect(updateErrorTargets).toEqual([0.25, 0.25]);
    expect(registeredShadowCamera(setCameraSpy)).toBe(false);
    expect(setCameraSpy).not.toHaveBeenCalledWith(shadowCamera);
    expect(eventOrder).not.toContain("shadow-camera");
    expect(
      registerPluginSpy.mock.calls.some(
        ([plugin]) =>
          (plugin as { name?: string }).name === "UPDATE_ON_CHANGE_PLUGIN"
      )
    ).toBe(true);

    deleteCameraSpy.mockClear();
    setCameraSpy.mockClear();
    visibleTile.traversal.error = 1;
    const staleTile = {} as never;
    const disposeStaleTile = vi.fn();
    renderer!.lruCache.add(staleTile, disposeStaleTile);
    renderer!.lruCache.setMemoryUsage(staleTile, 2 * 1024 ** 3);

    handlers.get("moveend")?.();
    expect(registeredShadowCamera(deleteCameraSpy)).toBe(false);
    layer.update({
      map,
      renderCamera: viewCamera,
      lodCamera: viewCamera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    });

    expect(updateErrorTargets).toEqual([0.25, 0.25, 0.25]);
    expect(registeredShadowCamera(setCameraSpy)).toBe(false);
    // Unused content is left to the LRU's own eviction; the runtime no
    // longer purges the cache while the view refines.
    expect(disposeStaleTile).not.toHaveBeenCalled();

    visibleTile.traversal.error = 0.2;
    layer.update({
      map,
      renderCamera: viewCamera,
      lodCamera: viewCamera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    });
    expect(registeredShadowCamera(setCameraSpy)).toBe(false);

    deleteCameraSpy.mockClear();
    setResolutionSpy.mockClear();

    handlers.get("movestart")?.();

    expect(renderer!.errorTarget).toBe(0.25);
    expect(registeredShadowCamera(deleteCameraSpy)).toBe(false);

    shadowCamera.position.x = 2;
    shadowCamera.updateMatrixWorld(true);
    layer.setShadowView({
      camera: shadowCamera,
      shadowMapSize: { width: 4096, height: 2048 },
    });
    layer.update({
      map,
      renderCamera: viewCamera,
      lodCamera: viewCamera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    });

    expect(updateErrorTargets).toEqual([0.25, 0.25, 0.25, 0.25, 0.25]);
    expect(registeredShadowCamera(setResolutionSpy)).toBe(false);

    deleteCameraSpy.mockClear();
    layer.setShadowView(null);
    expect(deleteCameraSpy).not.toHaveBeenCalled();
    layer.dispose();
    updateSpy.mockRestore();
    setCameraSpy.mockRestore();
    deleteCameraSpy.mockRestore();
    setResolutionSpy.mockRestore();
    registerPluginSpy.mockRestore();
  });

  it("waits for visible mesh work before starting receiver extrusion", () => {
    let renderer: TilesRenderer | undefined;
    const updateSpy = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function (this: TilesRenderer) {
        renderer = this;
      });
    const viewErrorSpy = vi
      .spyOn(TilesRenderer.prototype, "calculateTileViewErrorWithPlugin")
      .mockImplementation((_tile, target) => {
        target.inView = false;
        target.error = Number.POSITIVE_INFINITY;
      });
    const handlers = new Map<string, () => void>();
    const map = {
      on: vi.fn((event: string, handler: () => void) => {
        handlers.set(event, handler);
      }),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25]);
    const viewCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1_000);
    viewCamera.updateProjectionMatrix();
    viewCamera.updateMatrixWorld(true);
    const shadowCamera = new THREE.OrthographicCamera(
      -100,
      100,
      100,
      -100,
      1,
      500
    );
    shadowCamera.position.set(0, 0, 100);
    shadowCamera.lookAt(0, 0, 0);
    shadowCamera.updateMatrixWorld(true);
    const frame = {
      map,
      renderCamera: viewCamera,
      lodCamera: viewCamera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 800),
    };

    layer.onAdd?.(map);
    layer.setErrorTarget(1);
    layer.setShadowView({
      camera: shadowCamera,
      shadowMapSize: { width: 2048, height: 2048 },
    });
    layer.update(frame);

    const boundingVolume = (bounds: THREE.Box3, inMainView: boolean) => ({
      getAABB: (target: THREE.Box3) => target.copy(bounds),
      getSphere: (target: THREE.Sphere) => bounds.getBoundingSphere(target),
      intersectsFrustum: () => inMainView,
    });
    const rootBounds = new THREE.Box3(
      new THREE.Vector3(-200, -200, -200),
      new THREE.Vector3(200, 200, 200)
    );
    const receiverBounds = new THREE.Box3(
      new THREE.Vector3(-10, -10, -110),
      new THREE.Vector3(10, 10, -90)
    );
    const localSunward = new THREE.Vector3(0, 0, 1).transformDirection(
      renderer!.group.matrixWorld.clone().invert()
    );
    const casterBounds = receiverBounds
      .clone()
      .translate(localSunward.multiplyScalar(50));
    Object.assign(renderer!, {
      rootTileset: {
        root: {
          engineData: { boundingVolume: boundingVolume(rootBounds, true) },
        },
      },
    });
    renderer!.group.add(new THREE.Group());
    const receiverTile = {
      geometricError: 1,
      traversal: { error: 0.2, inFrustum: true },
      children: [],
      parent: null,
      engineData: { boundingVolume: boundingVolume(receiverBounds, true) },
    };
    renderer!.visibleTiles.add(receiverTile as never);
    const busyQueue = new PriorityQueue();
    busyQueue.items.push({ internal: { depth: 1 } } as never);
    renderer!.downloadQueue.originQueues.set("mesh", busyQueue);

    layer.update(frame);

    const target = {
      inView: false,
      error: Number.POSITIVE_INFINITY,
      distanceFromCamera: Number.POSITIVE_INFINITY,
    };
    renderer!.calculateTileViewErrorWithPlugin(
      {
        geometricError: 1,
        traversal: { error: 1, inFrustum: false },
        children: [],
        parent: null,
        internal: { depth: 1 },
        engineData: { boundingVolume: boundingVolume(casterBounds, false) },
      } as never,
      target
    );

    expect(target.inView).toBe(false);
    expect(target.error).toBe(Number.POSITIVE_INFINITY);

    busyQueue.items.length = 0;
    layer.update(frame);
    renderer!.calculateTileViewErrorWithPlugin(
      {
        geometricError: 1,
        traversal: { error: 1, inFrustum: false },
        children: [],
        parent: null,
        internal: { depth: 1 },
        engineData: { boundingVolume: boundingVolume(casterBounds, false) },
      } as never,
      target
    );

    expect(target.inView).toBe(true);
    expect(target.error).toBeCloseTo(1);

    // A camera move must retain the last complete offscreen caster set while
    // the new viewport refines. Clearing the receiver mask here made terrain
    // and shadow casters disappear before their replacements were ready.
    handlers.get("movestart")?.();
    receiverTile.traversal.error = 4;
    layer.update(frame);
    target.inView = false;
    target.error = Number.POSITIVE_INFINITY;
    renderer!.calculateTileViewErrorWithPlugin(
      {
        geometricError: 1,
        traversal: { error: 1, inFrustum: false },
        children: [],
        parent: null,
        internal: { depth: 1 },
        engineData: { boundingVolume: boundingVolume(casterBounds, false) },
      } as never,
      target
    );
    expect(target.inView).toBe(true);
    receiverTile.traversal.error = 0.2;

    const localLightSpaceX = new THREE.Vector3(1, 0, 0)
      .transformDirection(renderer!.group.matrixWorld.clone().invert())
      .multiplyScalar(100);
    const shiftedReceiverBounds = receiverBounds
      .clone()
      .translate(localLightSpaceX);
    const shiftedCasterBounds = shiftedReceiverBounds
      .clone()
      .translate(localSunward);
    renderer!.visibleTiles.clear();
    renderer!.visibleTiles.add({
      geometricError: 1,
      traversal: { error: 0.2, inFrustum: true },
      children: [],
      parent: null,
      engineData: {
        boundingVolume: boundingVolume(shiftedReceiverBounds, true),
      },
    } as never);

    layer.update(frame);
    renderer!.calculateTileViewErrorWithPlugin(
      {
        geometricError: 1,
        traversal: { error: 1, inFrustum: false },
        children: [],
        parent: null,
        internal: { depth: 1 },
        engineData: { boundingVolume: boundingVolume(casterBounds, false) },
      } as never,
      target
    );
    expect(target.inView).toBe(false);
    renderer!.calculateTileViewErrorWithPlugin(
      {
        geometricError: 1,
        traversal: { error: 1, inFrustum: false },
        children: [],
        parent: null,
        internal: { depth: 1 },
        engineData: {
          boundingVolume: boundingVolume(shiftedCasterBounds, false),
        },
      } as never,
      target
    );
    expect(target.inView).toBe(true);

    busyQueue.items.length = 0;
    layer.dispose();
    viewErrorSpy.mockRestore();
    updateSpy.mockRestore();
  });

  it("relaxes the requested error only after the full, idle view stalled and keeps it across pans", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const updateErrorTargets: number[] = [];
    let renderer: TilesRenderer | undefined;
    const updateSpy = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function (this: TilesRenderer) {
        renderer = this;
        updateErrorTargets.push(this.errorTarget);
      });
    const handlers = new Map<string, () => void>();
    const map = {
      on: vi.fn((event: string, handler: () => void) => {
        handlers.set(event, handler);
      }),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
      getZoom: () => 17,
      getPitch: () => 45,
    } as unknown as MaplibreMap;
    const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25]);
    const viewCamera = new THREE.PerspectiveCamera();
    const frame = {
      map,
      renderCamera: viewCamera,
      lodCamera: viewCamera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    };

    layer.setErrorTarget(0.25);
    layer.onAdd?.(map);
    layer.setShadowView({
      camera: new THREE.OrthographicCamera(),
      shadowMapSize: { width: 2048, height: 2048 },
    });
    layer.update(frame);

    // A displayed placeholder above the target whose child still has to load,
    // and one used tile that fills the whole ceiling: full, idle, unconverged.
    const visibleTile = {
      traversal: { error: 1, inFrustum: true },
      children: [{ internal: { hasContent: true, loadingState: 0 } }],
    } as never;
    const requiredTile = {} as never;
    const disposeRequiredTile = vi.fn();
    renderer!.visibleTiles.add(visibleTile);
    (renderer as TilesRenderer & { usedSet: Set<unknown> }).usedSet.add(
      requiredTile
    );
    renderer!.lruCache.add(requiredTile, disposeRequiredTile);
    renderer!.lruCache.setMemoryUsage(requiredTile, 2 * 1024 ** 3);

    layer.update(frame);
    expect(disposeRequiredTile).not.toHaveBeenCalled();
    expect(renderer!.errorTarget).toBe(0.25);
    expect(layer.getRequestDemand()).toBeGreaterThan(0);

    vi.advanceTimersByTime(999);
    layer.update(frame);
    expect(renderer!.errorTarget).toBe(0.25);

    vi.advanceTimersByTime(1);
    layer.update(frame);
    expect(renderer!.errorTarget).toBe(0.5);
    expect(updateErrorTargets).toEqual([0.25, 0.25, 0.25, 0.25]);

    // A pan keeps the effective target; the next stall relaxes further, up to
    // four times the requested target.
    handlers.get("movestart")?.();
    handlers.get("moveend")?.();
    expect(renderer!.errorTarget).toBe(0.5);
    layer.update(frame);
    vi.advanceTimersByTime(1_000);
    layer.update(frame);
    expect(renderer!.errorTarget).toBe(1);
    layer.update(frame);
    vi.advanceTimersByTime(1_000);
    layer.update(frame);
    expect(renderer!.errorTarget).toBe(1);

    // A hidden tab keeps the used tiles and the effective target for a
    // while; the debounced full wipe resets to the requested target.
    const visibilitySpy = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(disposeRequiredTile).not.toHaveBeenCalled();
    expect(renderer!.errorTarget).toBe(1);
    vi.advanceTimersByTime(HIDDEN_TAB_WIPE_DELAY_MS);
    expect(disposeRequiredTile).toHaveBeenCalledOnce();
    expect(renderer!.errorTarget).toBe(0.25);

    visibilitySpy.mockRestore();
    layer.dispose();
    updateSpy.mockRestore();
    vi.useRealTimers();
  });

  it("prioritizes hierarchy, then the visible view centre, ahead of shadow-only tiles", () => {
    let renderer: TilesRenderer | undefined;
    const updateSpy = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function (this: TilesRenderer) {
        renderer = this;
      });
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    const layer = buildThreeTilesRuntime(
      "mesh",
      "tileset.json",
      [7.15, 51.25],
      { providesTerrain: true }
    );
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    layer.onAdd?.(map);
    layer.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 800),
    });

    type QueuedTile = {
      priority?: number;
      internal?: { depth: number; hasUnrenderableContent?: boolean };
      engineData: {
        boundingVolume: {
          getAABB: (target: THREE.Box3) => void;
          getSphere: (target: THREE.Sphere) => void;
          intersectsFrustum: (frustum: THREE.Frustum) => boolean;
        };
      };
    };
    const tileForBox = (box: THREE.Box3, depth = 5): QueuedTile => ({
      internal: { depth },
      engineData: {
        boundingVolume: {
          getAABB: (target) => target.copy(box),
          getSphere: (target) => box.getBoundingSphere(target),
          intersectsFrustum: (frustum) => frustum.intersectsBox(box),
        },
      },
    });
    const centerTile = tileForBox(
      new THREE.Box3(
        new THREE.Vector3(-0.5, -1.5, -10.5),
        new THREE.Vector3(0.5, -0.5, -9.5)
      )
    );
    const outerVisibleTile = tileForBox(
      new THREE.Box3(
        new THREE.Vector3(3.5, 2.5, -10.5),
        new THREE.Vector3(4.5, 3.5, -9.5)
      )
    );
    const shadowOnlyTile = tileForBox(
      new THREE.Box3(
        new THREE.Vector3(29.5, -0.5, -10.5),
        new THREE.Vector3(30.5, 0.5, -9.5)
      )
    );
    const shallowerVisibleTile = tileForBox(
      new THREE.Box3(
        new THREE.Vector3(5.5, 3.5, -10.5),
        new THREE.Vector3(6.5, 4.5, -9.5)
      ),
      4
    );
    const queue = new PriorityQueue() as PriorityQueue & {
      items: QueuedTile[];
    };
    queue.priorityCallback = (first, second) =>
      (first.priority ?? 0) - (second.priority ?? 0);
    renderer!.downloadQueue.originQueues.set("test", queue);
    queue.items.push(
      centerTile,
      outerVisibleTile,
      shadowOnlyTile,
      shallowerVisibleTile
    );
    const parsingTile = tileForBox(
      new THREE.Box3(
        new THREE.Vector3(-0.5, -0.5, -10.5),
        new THREE.Vector3(0.5, 0.5, -9.5)
      ),
      6
    );
    (
      renderer!.parseQueue as PriorityQueue & { items: QueuedTile[] }
    ).items.push(parsingTile);

    layer.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 800),
    });

    // hierarchy first, then the view centre, then shadow-only tiles
    expect(shallowerVisibleTile.priority).toBeGreaterThan(centerTile.priority!);
    expect(centerTile.priority).toBeGreaterThan(outerVisibleTile.priority!);
    expect(outerVisibleTile.priority).toBeGreaterThan(shadowOnlyTile.priority!);
    expect(parsingTile.priority).toBeDefined();
    expect(parsingTile.priority).toBeLessThan(shadowOnlyTile.priority!);
    queue.sort();
    expect(queue.items.at(-1)).toBe(shallowerVisibleTile);

    queue.items.length = 0;
    layer.dispose();
    updateSpy.mockRestore();
  });

  it("preserves the runtime controls used by the pointcloud playground", () => {
    const layer = buildThreeTilesRuntime(
      "mesh",
      "tileset.json",
      [7.15, 51.25],
      { providesTerrain: true }
    );
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial()
    );
    layer.root.add(mesh);

    expect(layer.providesTerrain).toBe(true);
    expect(layer.getRequestDemand()).toBe(1);
    layer.setVisible(false);
    expect(layer.root.visible).toBe(false);
    expect(layer.getRequestDemand()).toBe(0);
    layer.setVisible(true);
    layer.setHeightOffset(12);
    expect(layer.root.children[0].position.y).toBe(12);
    layer.setClayColor("#abcdef");
    layer.setWhiteShading(true);
    layer.setWireframe(true);
    expect((mesh.material as THREE.MeshStandardMaterial).wireframe).toBe(true);
    layer.setTileBoundsVisible(true);
    layer.setCacheBudget(1024);
    layer.setRequestConcurrency(2);
    layer.dispose();
  });

  it("derives the visible elevation range from model geometry", () => {
    const model = new THREE.Mesh(
      new THREE.BoxGeometry(20, 10, 20),
      new THREE.MeshStandardMaterial()
    );
    model.position.y = 150;
    const forEachLoadedModelSpy = vi
      .spyOn(TilesRenderer.prototype, "forEachLoadedModel")
      .mockImplementation((callback) => {
        callback(model, {
          engineData: {
            boundingVolume: {
              getAABB: (target: THREE.Box3) =>
                target.set(
                  new THREE.Vector3(-10_000, -10_000, -10_000),
                  new THREE.Vector3(10_000, 10_000, 10_000)
                ),
            },
          },
        } as never);
      });
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25]);
    const camera = new THREE.PerspectiveCamera(60, 1, 1, 1_000);
    camera.position.set(0, 150, 100);
    camera.lookAt(0, 150, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    layer.onAdd?.(map);
    const range = layer.getViewElevationRange(camera);

    expect(range?.[0]).toBeCloseTo(145);
    expect(range?.[1]).toBeCloseTo(155);

    forEachLoadedModelSpy.mockRestore();
    layer.dispose();
    model.geometry.dispose();
    (model.material as THREE.Material).dispose();
  });

  it("keeps the panorama and frustum projector shader path available", () => {
    const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25]);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial()
    );
    layer.root.add(mesh);
    layer.setWhiteShading(true);
    const material = mesh.material as THREE.MeshStandardMaterial;
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <worldpos_vertex>",
      fragmentShader: "#include <common>\n#include <dithering_fragment>",
    } as Parameters<typeof material.onBeforeCompile>[0];

    layer.setProjector({
      kind: "pano",
      position: new THREE.Vector3(1, 2, 3),
      headingRad: 0.5,
      texture: new THREE.Texture(),
      opacity: 0.7,
    });
    material.onBeforeCompile(
      shader,
      {} as Parameters<typeof material.onBeforeCompile>[1]
    );
    const uniforms = shader.uniforms as Record<string, { value: unknown }>;
    expect(uniforms.uProjKind.value).toBe(1);
    expect(uniforms.uProjOpacity.value).toBe(0.7);
    expect(shader.fragmentShader).toContain("uProjMatrix");

    layer.setProjector({
      kind: "frustum",
      viewProj: new THREE.Matrix4(),
      texture: new THREE.Texture(),
      opacity: 0.8,
    });
    expect(uniforms.uProjKind.value).toBe(2);

    layer.setProjector(null);
    expect(uniforms.uProjKind.value).toBe(0);
    expect(uniforms.tProj.value).toBeNull();
    layer.dispose();
  });

  it("applies the declared clay material to meshes in the shared scene", () => {
    const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25]);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    layer.root.add(mesh);

    layer.setClayMaterial({
      color: "#d8d1c4",
      roughness: 0.7,
      metalness: 0.1,
    });
    layer.setWhiteShading(true);

    const material: THREE.Material = mesh.material;
    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    if (!(material instanceof THREE.MeshStandardMaterial)) {
      throw new Error("clay shader did not replace the source material");
    }
    expect(material.color.getHexString()).toBe("d8d1c4");
    expect(material.roughness).toBe(0.7);
    expect(material.metalness).toBe(0.1);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);

    layer.dispose();
  });

  it("keeps native tile meshes shadeable and controls their declared outlines", () => {
    const layer = buildThreeTilesRuntime("lod2", "tileset.json", [7.15, 51.25]);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial()
    );
    const outline = new THREE.LineSegments();
    outline.userData[TILE_OUTLINE_FLAG] = true;
    mesh.add(outline);
    layer.root.add(mesh);

    layer.setWhiteShading(false);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);

    layer.setOutlineVisible(false);
    expect(outline.visible).toBe(false);
    layer.setOutlineVisible(true);
    expect(outline.visible).toBe(true);

    layer.dispose();
  });

  it("fades textured tiles to the shadow color without replacing their material", () => {
    const layer = buildThreeTilesRuntime(
      "lod2",
      "tileset.json",
      [7.15, 51.25],
      { shadowBuildingStyle: true }
    );
    const sourceMaterial = new THREE.MeshStandardMaterial({
      color: "#847466",
      map: new THREE.Texture(),
      opacity: 0.4,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sourceMaterial);
    const outline = new THREE.LineSegments();
    outline.userData[TILE_OUTLINE_FLAG] = true;
    mesh.add(outline);
    layer.root.add(mesh);

    layer.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: "#d8d1c4",
      uniformColorMix: 0.35,
      textureSaturation: 0.4,
    });

    expect(mesh.material).toBe(sourceMaterial);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    expect(sourceMaterial.map).not.toBeNull();
    expect(sourceMaterial.opacity).toBe(1);
    expect(sourceMaterial.transparent).toBe(false);
    expect(sourceMaterial.depthWrite).toBe(true);
    expect(sourceMaterial.shadowSide).toBe(THREE.DoubleSide);
    expect(outline.visible).toBe(false);

    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <worldpos_vertex>",
      fragmentShader:
        "#include <common>\n#include <map_fragment>\n#include <dithering_fragment>",
    } as Parameters<typeof sourceMaterial.onBeforeCompile>[0];
    sourceMaterial.onBeforeCompile(
      shader,
      {} as Parameters<typeof sourceMaterial.onBeforeCompile>[1]
    );
    const uniforms = shader.uniforms as Record<string, { value: unknown }>;
    expect(uniforms.uShadowUniformColorMix.value).toBe(0.35);
    expect(uniforms.uShadowTextureSaturation.value).toBe(0.4);
    expect(
      (uniforms.uShadowUniformColor.value as THREE.Color).getHexString()
    ).toBe("d8d1c4");
    expect(shader.fragmentShader).toContain("diffuseColor.rgb = mix(");
    expect(shader.fragmentShader).toContain("shadowTextureLuma");

    layer.setShadowSimulationStyle?.(null);
    expect(mesh.material).toBe(sourceMaterial);
    expect(sourceMaterial.opacity).toBe(0.4);
    expect(sourceMaterial.transparent).toBe(true);
    expect(sourceMaterial.depthWrite).toBe(false);
    expect(sourceMaterial.side).toBe(THREE.DoubleSide);
    expect(sourceMaterial.shadowSide).toBeNull();
    expect(uniforms.uShadowTextureSaturation.value).toBe(1);
    expect(outline.visible).toBe(true);

    layer.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: null,
      uniformColorMix: 1,
    });
    expect(mesh.material).toBe(sourceMaterial);
    expect(sourceMaterial.shadowSide).toBe(THREE.DoubleSide);
    expect(uniforms.uShadowUniformColorMix.value).toBe(0);

    layer.setShadowSimulationStyle?.(null);
    expect(sourceMaterial.shadowSide).toBeNull();

    layer.dispose();
  });

  it("keeps unclassified separated LoD2 surfaces visible from both sides", () => {
    const layer = buildThreeTilesRuntime(
      "lod2-city",
      "tileset.json",
      [7.15, 51.25],
      { shadowBuildingStyle: true }
    );
    const roofMaterial = new THREE.MeshStandardMaterial({
      name: "roof",
      side: THREE.DoubleSide,
    });
    const wallMaterial = new THREE.MeshStandardMaterial({
      name: "wall",
      side: THREE.DoubleSide,
    });
    const shellMaterial = new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide,
    });
    layer.root.add(
      new THREE.Mesh(new THREE.PlaneGeometry(1, 1), roofMaterial),
      new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wallMaterial),
      new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shellMaterial)
    );

    layer.setShadowSimulationStyle?.({ fullOpacity: true, uniformColor: null });

    expect(roofMaterial.shadowSide).toBe(THREE.FrontSide);
    expect(wallMaterial.shadowSide).toBe(THREE.FrontSide);
    expect(shellMaterial.shadowSide).toBe(THREE.DoubleSide);
    expect(roofMaterial.side).toBe(THREE.DoubleSide);
    expect(wallMaterial.side).toBe(THREE.DoubleSide);
    expect(shellMaterial.side).toBe(THREE.DoubleSide);

    layer.setShadowSimulationStyle?.(null);
    expect(roofMaterial.shadowSide).toBeNull();
    expect(wallMaterial.shadowSide).toBeNull();
    expect(shellMaterial.shadowSide).toBeNull();
    expect(roofMaterial.side).toBe(THREE.DoubleSide);
    expect(wallMaterial.side).toBe(THREE.DoubleSide);

    layer.dispose();
  });

  it("orients connected LoD2 roof and wall triangles into outward shells", () => {
    const layer = buildThreeTilesRuntime(
      "lod2-city",
      "tileset.json",
      [7.15, 51.25],
      { shadowBuildingStyle: true }
    );
    const points = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const roofFaces = [[1, 2, 3]];
    const wallFaces = [
      [0, 2, 1],
      [0, 1, 3],
      [0, 3, 2],
    ];
    const buildSurface = (faces: number[][]) => {
      const positions: number[] = [];
      const featureIds: number[] = [];
      for (const featureId of [0, 1]) {
        const offset = featureId * 3;
        for (const sourceFace of faces) {
          const face =
            featureId === 0
              ? sourceFace
              : [sourceFace[0], sourceFace[2], sourceFace[1]];
          for (const pointIndex of face) {
            const point = points[pointIndex];
            positions.push(point[0] + offset, point[1], point[2]);
            featureIds.push(featureId);
          }
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
      );
      geometry.setAttribute(
        "_feature_id_0",
        new THREE.Float32BufferAttribute(featureIds, 1)
      );
      geometry.setIndex(
        Array.from({ length: positions.length / 3 }, (_, index) => index)
      );
      geometry.computeVertexNormals();
      return geometry;
    };
    const roofGeometry = buildSurface(roofFaces);
    const wallGeometry = buildSurface(wallFaces);
    const wallIndex = wallGeometry.getIndex();
    const second = wallIndex?.getX(1) ?? 0;
    wallIndex?.setX(1, wallIndex.getX(2));
    wallIndex?.setX(2, second);
    wallGeometry.computeVertexNormals();
    const roofMaterial = new THREE.MeshStandardMaterial({ name: "roof" });
    const wallMaterial = new THREE.MeshStandardMaterial({ name: "wall" });
    const cityTile = new THREE.Group();
    cityTile.add(
      new THREE.Mesh(roofGeometry, roofMaterial),
      new THREE.Mesh(wallGeometry, wallMaterial)
    );
    layer.root.add(cityTile);

    layer.setShadowSimulationStyle?.({ fullOpacity: true, uniformColor: null });

    const edges = new Map<string, boolean[]>();
    const signedVolumes = new Map<number, number>();
    for (const geometry of [roofGeometry, wallGeometry]) {
      const position = geometry.getAttribute("position");
      const normal = geometry.getAttribute("normal");
      const featureId = geometry.getAttribute("_feature_id_0");
      const index = geometry.getIndex();
      expect(index).not.toBeNull();
      for (let offset = 0; offset < (index?.count ?? 0); offset += 3) {
        const indices = [
          index?.getX(offset) ?? 0,
          index?.getX(offset + 1) ?? 0,
          index?.getX(offset + 2) ?? 0,
        ];
        const id = featureId.getX(indices[0]);
        const keys = indices.map(
          (vertex) =>
            `${position.getX(vertex)},${position.getY(vertex)},${position.getZ(
              vertex
            )}`
        );
        for (const [first, second] of [
          [0, 1],
          [1, 2],
          [2, 0],
        ]) {
          const forward = keys[first] < keys[second];
          const edge = `${id}|${forward ? keys[first] : keys[second]}|${
            forward ? keys[second] : keys[first]
          }`;
          const directions = edges.get(edge) ?? [];
          directions.push(forward);
          edges.set(edge, directions);
        }
        const first = new THREE.Vector3().fromBufferAttribute(
          position,
          indices[0]
        );
        const second = new THREE.Vector3().fromBufferAttribute(
          position,
          indices[1]
        );
        const third = new THREE.Vector3().fromBufferAttribute(
          position,
          indices[2]
        );
        const faceNormal = new THREE.Vector3()
          .subVectors(second, first)
          .cross(new THREE.Vector3().subVectors(third, first));
        const vertexNormal = new THREE.Vector3().fromBufferAttribute(
          normal,
          indices[0]
        );
        expect(faceNormal.dot(vertexNormal)).toBeGreaterThan(0);
        signedVolumes.set(
          id,
          (signedVolumes.get(id) ?? 0) +
            first.dot(new THREE.Vector3().crossVectors(second, third)) / 6
        );
      }
    }
    expect(
      [...edges.values()].every((directions) => directions.length === 2)
    ).toBe(true);
    expect(
      [...edges.values()].every(([first, second]) => first !== second)
    ).toBe(true);
    expect([...signedVolumes.values()].every((volume) => volume > 0)).toBe(
      true
    );
    expect(roofMaterial.side).toBe(THREE.FrontSide);
    expect(wallMaterial.side).toBe(THREE.FrontSide);
    expect(roofMaterial.shadowSide).toBe(THREE.DoubleSide);
    expect(wallMaterial.shadowSide).toBe(THREE.DoubleSide);

    layer.dispose();
  });

  it("uses the regular lit tile material for unlit terrain textures", () => {
    const layer = buildThreeTilesRuntime(
      "mesh",
      "tileset.json",
      [7.15, 51.25],
      { providesTerrain: true, shadowBuildingStyle: true }
    );
    const sourceMaterial = new THREE.MeshBasicMaterial({
      color: "#847466",
      map: new THREE.Texture(),
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sourceMaterial);
    const normals = mesh.geometry.getAttribute("normal");
    normals.setXYZ(0, 0.5, -0.5, 0.5);
    layer.root.add(mesh);

    layer.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: null,
    });

    expect(mesh.material).not.toBe(sourceMaterial);
    expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    const shadowMaterial =
      mesh.material as unknown as THREE.MeshStandardMaterial;
    expect(shadowMaterial.map).toBe(sourceMaterial.map);
    expect(shadowMaterial.color.getHexString()).toBe("847466");
    expect(shadowMaterial.roughness).toBe(1);
    expect(shadowMaterial.metalness).toBe(0);
    expect(shadowMaterial.normalMap).toBeInstanceOf(THREE.DataTexture);
    expect(shadowMaterial.normalMapType).toBe(THREE.ObjectSpaceNormalMap);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    expect(shadowMaterial.shadowSide).toBe(THREE.FrontSide);
    expect(sourceMaterial.shadowSide).toBeNull();
    expect(normals.getX(0)).toBeCloseTo(0.5);
    expect(normals.getY(0)).toBeCloseTo(-0.5);
    expect(normals.getZ(0)).toBeCloseTo(0.5);

    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <worldpos_vertex>",
      fragmentShader:
        "#include <common>\n#include <map_fragment>\n#include <dithering_fragment>",
    } as Parameters<typeof shadowMaterial.onBeforeCompile>[0];
    shadowMaterial.onBeforeCompile(
      shader,
      {} as Parameters<typeof shadowMaterial.onBeforeCompile>[1]
    );
    expect(shader.fragmentShader).not.toContain("flatTextureShadow");
    expect(shader.vertexShader).not.toContain("flatTextureNormalBias");

    layer.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: "#d8d1c4",
      uniformColorMix: 0.75,
      textureSaturation: 0.8,
    });
    expect(mesh.material).toBe(shadowMaterial);
    expect(mesh.material).not.toBe(sourceMaterial);

    layer.setShadowSimulationStyle?.(null);
    expect(mesh.material).toBe(sourceMaterial);
    expect(sourceMaterial.side).toBe(THREE.DoubleSide);
    expect(sourceMaterial.shadowSide).toBeNull();

    layer.dispose();
  });

  it("projects the map style onto terrain but not separated LoD2 surfaces", () => {
    const layer = buildThreeTilesRuntime(
      "lod2-native",
      "tileset.json",
      [7.15, 51.25],
      { providesTerrain: true, shadowBuildingStyle: true }
    );
    const parent = new THREE.Group();
    const buildSurface = (name: string) => {
      const material = new THREE.MeshLambertMaterial();
      material.name = name;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      parent.add(mesh);
      return mesh;
    };
    const terrain = buildSurface("terrain");
    const roof = buildSurface("roof");
    const wall = buildSurface("wall");
    layer.root.add(parent);

    const receivesMapStyleBeforeTileStyling = layer.receivesMapStyleTexture;
    expect(typeof receivesMapStyleBeforeTileStyling).toBe("function");
    expect(
      (
        receivesMapStyleBeforeTileStyling as (
          material: THREE.Material
        ) => boolean
      )(terrain.material as THREE.Material)
    ).toBe(true);
    expect(
      (
        receivesMapStyleBeforeTileStyling as (
          material: THREE.Material
        ) => boolean
      )(roof.material as THREE.Material)
    ).toBe(false);

    const initialVersion = layer.mapStyleProjectionVersion?.() ?? -1;
    layer.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: null,
    });
    const receivesMapStyle = layer.receivesMapStyleTexture;

    expect(typeof receivesMapStyle).toBe("function");
    expect(
      (receivesMapStyle as (material: THREE.Material) => boolean)(
        terrain.material as THREE.Material
      )
    ).toBe(true);
    expect(
      (receivesMapStyle as (material: THREE.Material) => boolean)(
        roof.material as THREE.Material
      )
    ).toBe(false);
    expect(
      (receivesMapStyle as (material: THREE.Material) => boolean)(
        wall.material as THREE.Material
      )
    ).toBe(false);
    expect(layer.mapStyleProjectionVersion?.()).toBeGreaterThan(initialVersion);
    const styledVersion = layer.mapStyleProjectionVersion?.();
    layer.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: null,
    });
    expect(layer.mapStyleProjectionVersion?.()).toBe(styledVersion);

    layer.dispose();
  });
});
