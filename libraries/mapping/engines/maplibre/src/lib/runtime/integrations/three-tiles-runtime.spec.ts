// @vitest-environment jsdom

import { TilesRenderer } from "3d-tiles-renderer";
import { PriorityQueue, type Tile } from "3d-tiles-renderer/core";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { TILE_OUTLINE_FLAG } from "@carma-mapping/engines/threejs";
import { setSharedThreeTerrainLoading } from "./shared-three-terrain-registry";
import { TILES_LOAD_POLICY } from "./three-tiles-load-policy";
import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";
import { buildThreeTilesRuntime } from "./three-tiles-runtime";
import {
  HIDDEN_TAB_WIPE_DELAY_MS,
  MESH_EVICTION_BATCH_SIZE,
} from "./three-tiles-runtime-config";

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
  it("preempts the old request generation asynchronously without clearing loaded or new tiles", async () => {
    vi.useFakeTimers();
    let renderer!: TilesRenderer & { loadingTiles: Set<Tile> };
    const update = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function () {
        renderer = this as typeof renderer;
      });
    const handlers = new Map<string, () => void>();
    const map = {
      on: vi.fn((name, callback) => handlers.set(name, callback)),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
      isMoving: () => false,
    } as unknown as MaplibreMap;
    const runtime = buildThreeTilesRuntime("cancel", "mesh.json", [7.2, 51.2], {
      providesTerrain: true,
    });
    const removed: Tile[] = [];
    const request = () => {
      const tile = { internal: { loadingState: 2 } } as Tile;
      renderer.loadingTiles.add(tile);
      renderer.lruCache.add(tile, () => {
        renderer.loadingTiles.delete(tile);
        removed.push(tile);
      });
      return tile;
    };
    try {
      runtime.scene.onAdd?.(map);
      const camera = new THREE.PerspectiveCamera();
      runtime.scene.update({
        map,
        renderCamera: camera,
        lodCamera: camera,
        lookTarget: new THREE.Vector3(),
        viewport: new THREE.Vector2(800, 600),
      });
      const old = Array.from({ length: MESH_EVICTION_BATCH_SIZE + 2 }, request);
      handlers.get(MAPLIBRE_EVENT.MOVE_START)?.();
      expect(removed).toEqual([]);
      const fresh = request();
      // One old request completes before its deferred cancellation turn.
      const completed = old.pop()!;
      renderer.loadingTiles.delete(completed);
      await vi.advanceTimersByTimeAsync(0);
      expect(removed).toHaveLength(MESH_EVICTION_BATCH_SIZE);
      await vi.advanceTimersByTimeAsync(5);
      expect(new Set(removed)).toEqual(new Set(old));
      expect(renderer.lruCache.has(completed)).toBe(true);
      expect(renderer.loadingTiles.has(fresh)).toBe(true);
      handlers.get(MAPLIBRE_EVENT.MOVE)?.();
      await vi.advanceTimersByTimeAsync(200);
      expect(renderer.loadingTiles.has(fresh)).toBe(true);
    } finally {
      runtime.scene.dispose();
      update.mockRestore();
      vi.useRealTimers();
    }
  });

  it("keeps concern APIs stable and exposes only the adapter to the scene", () => {
    const runtime = buildThreeTilesRuntime("scoped", "mesh.json", [7.2, 51.2]);
    const { scene, appearance, loading, placement, debug } = runtime;
    expect(Object.keys(runtime).sort()).toEqual(
      ["scene", "appearance", "loading", "placement", "debug"].sort()
    );
    expect(scene.setErrorTarget).toBe(loading.setErrorTarget);
    expect(scene.setCacheBudget).toBe(loading.setCacheBudget);
    expect(scene.setTileBoundsVisible).toBe(debug.setTileBoundsVisible);
    const update = scene.update;
    appearance.setOpacity(0.5);
    appearance.setClayColor("#abcdef");
    expect(runtime.scene).toBe(scene);
    expect(runtime.appearance).toBe(appearance);
    expect(runtime.loading).toBe(loading);
    expect(runtime.placement).toBe(placement);
    expect(runtime.debug).toBe(debug);
    expect(scene.update).toBe(update);
    scene.dispose();
  });
  it.each([false, true])(
    "keeps layer opacity authoritative with shadow full-opacity=%s",
    (fullOpacity) => {
      const layer = buildThreeTilesRuntime(
        "mesh",
        "tileset.json",
        [7.15, 51.25],
        {
          providesTerrain: true,
          shadowBuildingStyle: true,
        }
      );
      const source = new THREE.MeshBasicMaterial({
        map: new THREE.Texture(),
        opacity: 0.4,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), source);
      layer.scene.root.add(mesh);
      layer.scene.setShadowSimulationStyle?.({
        fullOpacity,
        uniformColor: null,
      });
      const material = mesh.material;
      const version = layer.scene.mapStyleProjectionVersion?.();
      layer.appearance.setOpacity(0.25);
      expect(mesh.material).toBe(material);
      expect(material.opacity).toBeCloseTo(fullOpacity ? 0.25 : 0.1);
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(false);
      expect(layer.scene.mapStyleProjectionVersion?.()).toBeGreaterThan(
        version!
      );

      // Changing shader options must not reset the modal's opacity.
      layer.scene.setShadowSimulationStyle?.({
        fullOpacity,
        uniformColor: "#ffffff",
        uniformColorMix: 0.5,
      });
      expect(material.opacity).toBeCloseTo(fullOpacity ? 0.25 : 0.1);
      layer.appearance.setOpacity(0);
      expect(material.opacity).toBe(0);
      layer.appearance.setOpacity(1);
      expect(material.opacity).toBe(fullOpacity ? 1 : 0.4);
      expect(material.transparent).toBe(!fullOpacity);
      expect(material.depthWrite).toBe(fullOpacity);
      layer.scene.setShadowSimulationStyle?.(null);
      expect(mesh.material).toBe(source);
      expect(source.opacity).toBe(0.4);
      layer.scene.dispose();
    }
  );

  it("rechecks a stalled settled view on a bounded timer and cancels the audit on disposal", () => {
    vi.useFakeTimers();
    const update = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(() => {});
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
      isMoving: () => false,
    } as unknown as MaplibreMap;
    const runtime = buildThreeTilesRuntime("audit", "mesh.json", [7.2, 51.2], {
      providesTerrain: true,
    });
    const camera = new THREE.PerspectiveCamera();
    runtime.scene.onAdd?.(map);
    runtime.scene.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    });
    try {
      const count = vi.mocked(map.triggerRepaint).mock.calls.length;
      vi.advanceTimersByTime(1000);
      expect(vi.mocked(map.triggerRepaint).mock.calls.length).toBeGreaterThan(
        count
      );
      runtime.scene.dispose();
      vi.mocked(map.triggerRepaint).mockClear();
      vi.advanceTimersByTime(2000);
      expect(map.triggerRepaint).not.toHaveBeenCalled();
    } finally {
      runtime.scene.dispose();
      update.mockRestore();
      vi.useRealTimers();
    }
  });
  it("restores fine visible meshes and pins them when upstream proposes a coarse drag fallback", () => {
    type FrontierRenderer = TilesRenderer & {
      setTileVisible: (tile: Tile, visible: boolean) => void;
      setTileActive: (tile: Tile, active: boolean) => void;
      usedSet: Set<Tile>;
    };
    let renderer: FrontierRenderer;
    let proposed: Tile[] | null = null;
    const update = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function () {
        renderer = this as FrontierRenderer;
        this.frameCount += 1;
        if (!proposed) return;
        // Production retention walks the hierarchy, not only visible leaves.
        // Keep the test's loaded family reachable through the same entrypoint.
        renderer.rootTileset = { root: parent } as typeof renderer.rootTileset;
        renderer.usedSet.clear();
        for (const tile of [...renderer.visibleTiles]) {
          renderer.setTileActive(tile, false);
          renderer.setTileVisible(tile, false);
        }
        for (const tile of proposed) {
          renderer.setTileActive(tile, true);
          renderer.setTileVisible(tile, true);
        }
      });
    const handlers = new Map<string, () => void>();
    const map = {
      on: vi.fn((name, callback) => handlers.set(name, callback)),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    const runtime = buildThreeTilesRuntime(
      "retained",
      "mesh.json",
      [7.2, 51.2],
      { providesTerrain: true }
    );
    runtime.loading.setErrorTarget(1);
    runtime.scene.onAdd?.(map);
    const camera = new THREE.PerspectiveCamera();
    const frame = {
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    };
    const createTile = (parent: Tile | null, error: number) =>
      ({
        parent,
        children: [],
        refine: "REPLACE",
        internal: { hasRenderableContent: true, loadingState: 4 },
        traversal: { error, inFrustum: true },
        engineData: { scene: new THREE.Group() },
      } as unknown as Tile);
    const parent = createTile(null, 16);
    const children = Array.from({ length: 4 }, () => createTile(parent, 0.5));
    parent.children = children;
    try {
      proposed = children;
      runtime.scene.update(frame);
      handlers.get(MAPLIBRE_EVENT.MOVE_START)?.();
      proposed = [parent];
      for (let pass = 0; pass < 3; pass++) {
        runtime.scene.update(frame);
        expect(renderer!.visibleTiles).toEqual(new Set(children));
        // The group also contains the independent debug overlay root.
        expect(renderer!.group.children).not.toContain(parent.engineData.scene);
        for (const child of children)
          expect(renderer!.group.children).toContain(child.engineData.scene);
        for (const child of children)
          expect(renderer!.usedSet.has(child)).toBe(true);
        expect(renderer!.activeTiles.has(parent)).toBe(false);
      }
      handlers.get(MAPLIBRE_EVENT.MOVE_END)?.();
      runtime.scene.update(frame);
      expect(renderer!.visibleTiles).toEqual(new Set(children));
      parent.traversal.error = 1;
      runtime.scene.update(frame);
      expect(renderer!.visibleTiles).toEqual(new Set([parent]));
      expect(renderer!.group.children).toContain(parent.engineData.scene);
      for (const child of children)
        expect(renderer!.group.children).not.toContain(child.engineData.scene);
    } finally {
      runtime.scene.dispose();
      update.mockRestore();
    }
  });
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

    first.scene.onAdd?.(map);
    second.scene.onAdd?.(map);
    first.scene.update(frame);
    second.scene.update(frame);

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

    first.scene.dispose();
    second.scene.dispose();
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

    layer.scene.onAdd?.(map);
    layer.scene.update({
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
      // A retry requests a fresh traversal, not a second admission in the old one.
      layer.scene.update({
        map,
        renderCamera: camera,
        lodCamera: camera,
        lookTarget: new THREE.Vector3(),
        viewport: new THREE.Vector2(800, 600),
      });
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

    layer.scene.dispose();
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

    layer.scene.onAdd?.(map);
    layer.scene.update({
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
    layer.scene.setShadowSimulationStyle({
      fullOpacity: true,
      uniformColor: null,
    });
    expectBounds();
    layer.scene.setShadowSimulationStyle(null);
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
    layer.scene.setShadowView({
      camera: shadowCamera,
      shadowMapSize: { width: 4_096, height: 4_096 },
    });
    expect(cache.isFull()).toBe(true);
    layer.scene.setShadowView(null);
    expect(cache.isFull()).toBe(true);

    const events = vi.mocked(map.on).mock.calls;
    const loseContext = events.find(
      ([event]) => event === MAPLIBRE_EVENT.WEBGL_CONTEXT_LOST
    )?.[1] as () => void;
    const restoreContext = events.find(
      ([event]) => event === MAPLIBRE_EVENT.WEBGL_CONTEXT_RESTORED
    )?.[1] as () => void;
    cache.cachedBytes = 0;
    loseContext();
    expect(cache.isFull()).toBe(true);
    expect(renderer!.downloadQueue.maxJobsPerOrigin).toBe(0);
    expect(renderer!.parseQueue.maxJobs).toBe(0);
    restoreContext();
    expect(cache.isFull()).toBe(false);
    expect(renderer!.parseQueue.maxJobs).toBeGreaterThan(0);
    layer.loading.setCacheBudget(24 * 1024 ** 3);
    expect(renderer!.lruCache.minBytesSize).toBe(18 * 1024 ** 3);
    const memoryDescriptor = Object.getOwnPropertyDescriptor(
      performance,
      "memory"
    );
    const memory = { usedJSHeapSize: 85, jsHeapSizeLimit: 100 };
    Object.defineProperty(performance, "memory", {
      configurable: true,
      value: memory,
    });
    try {
      layer.loading.setCacheBudget(24 * 1024 ** 3);
      // Tab-wide heap usage no longer stops admission. Only the own finite
      // tile budget, an allocation failure or context loss may do so.
      expect(renderer!.downloadQueue.maxJobsPerOrigin).toBeGreaterThan(0);
      expect(renderer!.parseQueue.maxJobs).toBeGreaterThan(0);
      memory.usedJSHeapSize = 70;
      layer.loading.setCacheBudget(24 * 1024 ** 3);
      expect(renderer!.parseQueue.maxJobs).toBeGreaterThan(0);
      memory.usedJSHeapSize = 60;
      layer.loading.setCacheBudget(24 * 1024 ** 3);
      expect(renderer!.parseQueue.maxJobs).toBeGreaterThan(0);
    } finally {
      if (memoryDescriptor)
        Object.defineProperty(performance, "memory", memoryDescriptor);
      else Reflect.deleteProperty(performance, "memory");
    }
    cache.cachedBytes = 512 * MIB;

    // Explicit budgets may exceed the device default; the floor still applies.
    layer.loading.setCacheBudget(1024);
    expect(cache.isFull()).toBe(true);
    cache.cachedBytes = 100 * MIB;
    expect(cache.isFull()).toBe(false);

    layer.scene.dispose();
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

    layer.scene.onAdd?.(map);
    layer.scene.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    });

    expect(renderer?.downloadQueue.maxJobsPerOrigin).toBeGreaterThan(0);
    expect(layer.scene.hasRenderableContent?.()).toBe(false);
    const tilesGroup = layer.scene.root.children[0]?.children[0];
    tilesGroup?.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial()
      )
    );
    expect(layer.scene.hasRenderableContent?.()).toBe(true);

    setSharedThreeTerrainLoading(map, "fallback-terrain", false);
    layer.scene.dispose();
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

    layer.scene.onAdd?.(map);
    layer.scene.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    });

    expect(renderer?.downloadQueue.maxJobsPerOrigin).toBe(8);

    setSharedThreeTerrainLoading(map, "fallback-terrain", false);
    expect(renderer?.downloadQueue.maxJobsPerOrigin).toBeGreaterThan(1);
    layer.scene.dispose();
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

    layer.scene.onAdd?.(map);
    layer.scene.update({
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

    const volumes = layer.scene.getActiveTileVolumes?.() ?? [];

    expect(volumes).toHaveLength(1);
    expect(volumes[0]).toMatchObject({
      id: "tileset.json#:building.b3dm",
      kind: "3d-tile",
      sourceId: "tileset.json",
    });
    expect(volumes[0]?.minimum.every(Number.isFinite)).toBe(true);
    expect(volumes[0]?.maximum.every(Number.isFinite)).toBe(true);

    const tile = [...renderer!.activeTiles][0];
    const model = tile.engineData.scene!;
    const surface = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 8));
    surface.position.set(1, 200, 3);
    model.add(surface);
    const loadedVolumes = layer.scene.getActiveTileVolumes?.() ?? [];
    // Spatial search follows tileset metadata, not payload vertex traversal.
    // Adding geometry must not replace the stable declared bounding volume.
    expect(loadedVolumes[0].minimum).toEqual(volumes[0].minimum);
    expect(loadedVolumes[0].maximum).toEqual(volumes[0].maximum);
    surface.geometry.dispose();
    (surface.material as THREE.Material).dispose();

    layer.scene.dispose();
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

    layer.scene.onAdd?.(map);
    layer.scene.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    });
    const dispatchSpy = vi.spyOn(renderer!, "dispatchEvent");

    layer.loading.setErrorTarget(1);
    const callsAfterChange = dispatchSpy.mock.calls.length;
    layer.loading.setErrorTarget(1);

    expect(dispatchSpy).toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledTimes(callsAfterChange);

    layer.scene.dispose();
    updateSpy.mockRestore();
  });

  it("relaxes non-terrain layer precision under its own cache pressure", () => {
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
    const layer = buildThreeTilesRuntime(
      "mesh",
      "tileset.json",
      [7.15, 51.25],
      { providesTerrain: false }
    );
    const viewCamera = new THREE.PerspectiveCamera();
    const frame = {
      map,
      renderCamera: viewCamera,
      lodCamera: viewCamera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    };

    layer.loading.setErrorTarget(0.25);
    layer.scene.onAdd?.(map);
    layer.scene.setShadowView({
      camera: new THREE.OrthographicCamera(),
      shadowMapSize: { width: 2048, height: 2048 },
    });
    layer.scene.update(frame);

    // A displayed placeholder above the target whose child still has to load,
    // and one used tile that fills the whole ceiling: full, idle, unconverged.
    const visibleTile = {
      traversal: { error: 1, inFrustum: true },
      engineData: {},
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

    layer.scene.update(frame);
    expect(disposeRequiredTile).not.toHaveBeenCalled();
    expect(renderer!.errorTarget).toBe(0.25);
    expect(layer.loading.getRequestDemand()).toBeGreaterThan(0);

    vi.advanceTimersByTime(999);
    layer.scene.update(frame);
    expect(renderer!.errorTarget).toBe(0.25);

    vi.advanceTimersByTime(1);
    layer.scene.update(frame);
    expect(renderer!.errorTarget).toBe(0.5);
    expect(layer.scene.isMainViewReady()).toBe(false);
    expect(updateErrorTargets).toEqual([0.25, 0.25, 0.25, 0.25]);

    // A pan keeps the effective target; the next stall relaxes further, up to
    // four times the requested target.
    handlers.get("movestart")?.();
    handlers.get("moveend")?.();
    expect(renderer!.errorTarget).toBe(0.5);
    layer.scene.update(frame);
    vi.advanceTimersByTime(1_000);
    layer.scene.update(frame);
    expect(renderer!.errorTarget).toBe(1);
    layer.scene.update(frame);
    vi.advanceTimersByTime(1_000);
    layer.scene.update(frame);
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
    layer.scene.dispose();
    updateSpy.mockRestore();
    vi.useRealTimers();
  });

  it("reprioritizes queued meshes by camera distance before shadow-only tiles", () => {
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

    layer.scene.onAdd?.(map);
    layer.scene.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 800),
    });

    type QueuedTile = {
      priority?: number;
      traversal: { distanceFromCamera: number };
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
      traversal: {
        distanceFromCamera: box.distanceToPoint(new THREE.Vector3()),
      },
      internal: { depth },
      engineData: {
        boundingVolume: {
          getAABB: (target) => target.copy(box),
          getSphere: (target) => box.getBoundingSphere(target),
          intersectsFrustum: () => box.min.x < 20,
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

    layer.scene.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 800),
    });

    // A shallower ancestor no longer outranks a nearer visible request.
    expect(shallowerVisibleTile.priority).toBeLessThan(centerTile.priority!);
    expect(centerTile.priority).toBeGreaterThan(outerVisibleTile.priority!);
    expect(outerVisibleTile.priority).toBeGreaterThan(shadowOnlyTile.priority!);
    expect(parsingTile.priority).toBeDefined();
    expect(parsingTile.priority).toBeGreaterThan(shadowOnlyTile.priority!);
    queue.sort();
    expect(queue.items.at(-1)).toBe(centerTile);

    outerVisibleTile.traversal.distanceFromCamera = 1;
    layer.scene.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 800),
    });
    queue.sort();
    expect(queue.items.at(-1)).toBe(outerVisibleTile);

    queue.items.length = 0;
    layer.scene.dispose();
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
    layer.scene.root.add(mesh);

    expect(layer.scene.providesTerrain).toBe(true);
    expect(layer.loading.getRequestDemand()).toBe(1);
    layer.appearance.setVisible(false);
    expect(layer.scene.root.visible).toBe(false);
    expect(layer.loading.getRequestDemand()).toBe(0);
    layer.appearance.setVisible(true);
    layer.placement.setHeightOffset(12);
    expect(layer.scene.root.children[0].position.y).toBe(12);
    layer.appearance.setClayColor("#abcdef");
    layer.appearance.setWhiteShading(true);
    layer.appearance.setWireframe(true);
    expect((mesh.material as THREE.MeshStandardMaterial).wireframe).toBe(true);
    layer.debug.setTileBoundsVisible(true);
    layer.loading.setCacheBudget(1024);
    layer.loading.setRequestConcurrency(2);
    layer.scene.dispose();
  });

  it("derives the visible elevation range from model geometry", () => {
    const model = new THREE.Mesh(
      new THREE.BoxGeometry(20, 10, 20),
      new THREE.MeshStandardMaterial()
    );
    model.position.y = 150;
    let renderer: TilesRenderer;
    const updateSpy = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function () {
        renderer = this;
        renderer.visibleTiles.add({
          engineData: {
            scene: model,
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

    layer.scene.onAdd?.(map);
    layer.scene.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      viewport: new THREE.Vector2(800, 600),
      lookTarget: new THREE.Vector3(),
    });
    const range = layer.scene.getViewElevationRange(camera);

    expect(range?.[0]).toBeCloseTo(145);
    expect(range?.[1]).toBeCloseTo(155);

    const boundsSpy = vi.spyOn(THREE.Box3.prototype, "setFromObject");
    for (let i = 0; i < 100; i += 1) {
      expect(layer.scene.getViewElevationRange(camera)).toEqual(range);
    }
    expect(boundsSpy).not.toHaveBeenCalled();
    model.position.y += 10;
    expect(layer.scene.getViewElevationRange(camera)).toEqual([155, 165]);
    expect(boundsSpy).toHaveBeenCalledOnce();
    boundsSpy.mockRestore();

    updateSpy.mockRestore();
    layer.scene.dispose();
    model.geometry.dispose();
    (model.material as THREE.Material).dispose();
  });

  it("keeps the panorama and frustum projector shader path available", () => {
    const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25]);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial()
    );
    layer.scene.root.add(mesh);
    layer.appearance.setWhiteShading(true);
    const material = mesh.material as THREE.MeshStandardMaterial;
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <worldpos_vertex>",
      fragmentShader: "#include <common>\n#include <dithering_fragment>",
    } as Parameters<typeof material.onBeforeCompile>[0];

    layer.appearance.setProjector({
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

    layer.appearance.setProjector({
      kind: "frustum",
      viewProj: new THREE.Matrix4(),
      texture: new THREE.Texture(),
      opacity: 0.8,
    });
    expect(uniforms.uProjKind.value).toBe(2);

    layer.appearance.setProjector(null);
    expect(uniforms.uProjKind.value).toBe(0);
    expect(uniforms.tProj.value).toBeNull();
    layer.scene.dispose();
  });

  it("applies the declared clay material to meshes in the shared scene", () => {
    const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25]);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    layer.scene.root.add(mesh);

    layer.appearance.setClayMaterial({
      color: "#d8d1c4",
      roughness: 0.7,
      metalness: 0.1,
    });
    layer.appearance.setWhiteShading(true);

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

    layer.scene.dispose();
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
    layer.scene.root.add(mesh);

    layer.appearance.setWhiteShading(false);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);

    layer.appearance.setOutlineVisible(false);
    expect(outline.visible).toBe(false);
    layer.appearance.setOutlineVisible(true);
    expect(outline.visible).toBe(true);

    layer.scene.dispose();
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
    layer.scene.root.add(mesh);

    layer.scene.setShadowSimulationStyle?.({
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
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    } as Parameters<typeof sourceMaterial.onBeforeCompile>[0];
    sourceMaterial.onBeforeCompile(
      shader,
      {} as Parameters<typeof sourceMaterial.onBeforeCompile>[1]
    );
    const uniforms = shader.uniforms as Record<string, { value: unknown }>;
    expect(uniforms.uShadowUniformColorMix.value).toBe(0.35);
    expect(uniforms.uShadowTextureSaturation.value).toBe(0.4);
    expect(uniforms.uShadowTextureColorCorrection.value).toBe(false);
    expect(
      (uniforms.uShadowUniformColor.value as THREE.Color).getHexString()
    ).toBe("d8d1c4");
    expect(shader.fragmentShader).toContain("diffuseColor.rgb = mix(");
    expect(shader.fragmentShader).toContain("shadowTextureLuma");

    layer.scene.setShadowSimulationStyle?.(null);
    expect(mesh.material).toBe(sourceMaterial);
    expect(sourceMaterial.opacity).toBe(0.4);
    expect(sourceMaterial.transparent).toBe(true);
    expect(sourceMaterial.depthWrite).toBe(false);
    expect(sourceMaterial.side).toBe(THREE.DoubleSide);
    expect(sourceMaterial.shadowSide).toBeNull();
    expect(uniforms.uShadowTextureSaturation.value).toBe(1);
    expect(outline.visible).toBe(true);

    layer.scene.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: null,
      uniformColorMix: 1,
    });
    expect(mesh.material).toBe(sourceMaterial);
    expect(sourceMaterial.shadowSide).toBe(THREE.DoubleSide);
    expect(uniforms.uShadowUniformColorMix.value).toBe(0);

    layer.scene.setShadowSimulationStyle?.(null);
    expect(sourceMaterial.shadowSide).toBeNull();

    layer.scene.dispose();
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
    layer.scene.root.add(
      new THREE.Mesh(new THREE.PlaneGeometry(1, 1), roofMaterial),
      new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wallMaterial),
      new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shellMaterial)
    );

    layer.scene.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: null,
    });

    expect(roofMaterial.shadowSide).toBe(THREE.DoubleSide);
    expect(wallMaterial.shadowSide).toBe(THREE.DoubleSide);
    expect(shellMaterial.shadowSide).toBe(THREE.DoubleSide);
    expect(roofMaterial.side).toBe(THREE.DoubleSide);
    expect(wallMaterial.side).toBe(THREE.DoubleSide);
    expect(shellMaterial.side).toBe(THREE.DoubleSide);

    layer.scene.setShadowSimulationStyle?.(null);
    expect(roofMaterial.shadowSide).toBeNull();
    expect(wallMaterial.shadowSide).toBeNull();
    expect(shellMaterial.shadowSide).toBeNull();
    expect(roofMaterial.side).toBe(THREE.DoubleSide);
    expect(wallMaterial.side).toBe(THREE.DoubleSide);

    layer.scene.dispose();
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
    layer.scene.root.add(cityTile);

    layer.scene.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: null,
    });

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

    layer.scene.dispose();
  });

  it("uses the regular lit tile material for unlit terrain textures", () => {
    const layer = buildThreeTilesRuntime(
      "mesh",
      "tileset.json",
      [7.15, 51.25],
      {
        providesTerrain: true,
        shadowBuildingStyle: true,
        colorCorrection: {
          gamma: [1.25, 1.25, 1.23],
          blackPoint: [0, 0, 0],
          whitePoint: [0.9, 0.9, 0.92],
          saturation: 1,
        },
      }
    );
    const sourceMaterial = new THREE.MeshBasicMaterial({
      color: "#847466",
      map: new THREE.Texture(),
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sourceMaterial);
    const normals = mesh.geometry.getAttribute("normal");
    normals.setXYZ(0, 0.5, -0.5, 0.5);
    layer.scene.root.add(mesh);

    layer.scene.setShadowSimulationStyle?.({
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
    expect(shadowMaterial.normalMap).toBeNull();
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    expect(shadowMaterial.shadowSide).toBe(THREE.DoubleSide);
    expect(sourceMaterial.shadowSide).toBeNull();
    expect(normals.getX(0)).toBeCloseTo(0.5);
    expect(normals.getY(0)).toBeCloseTo(-0.5);
    expect(normals.getZ(0)).toBeCloseTo(0.5);

    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <worldpos_vertex>",
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    } as Parameters<typeof shadowMaterial.onBeforeCompile>[0];
    shadowMaterial.onBeforeCompile(
      shader,
      {} as Parameters<typeof shadowMaterial.onBeforeCompile>[1]
    );
    expect(shader.fragmentShader).not.toContain("flatTextureShadow");
    const uniforms = shader.uniforms as Record<string, { value: unknown }>;
    expect(uniforms.uShadowTextureColorCorrection.value).toBe(false);
    expect(shader.fragmentShader.indexOf("shadowTextureLuma")).toBeGreaterThan(
      shader.fragmentShader.indexOf("#include <color_fragment>")
    );
    expect(shader.fragmentShader.indexOf("shadowTextureLuma")).toBeLessThan(
      shader.fragmentShader.indexOf("#include <lights_fragment_begin>")
    );
    expect(shader.vertexShader).not.toContain("flatTextureNormalBias");

    layer.scene.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: "#d8d1c4",
      uniformColorMix: 0.75,
      textureSaturation: 0.8,
      textureColorCorrection: true,
    });
    expect(mesh.material).toBe(shadowMaterial);
    expect(mesh.material).not.toBe(sourceMaterial);
    expect(uniforms.uShadowTextureColorCorrection.value).toBe(true);
    expect(
      (uniforms.uShadowTextureGamma.value as THREE.Vector3).toArray()
    ).toEqual([1.25, 1.25, 1.23]);
    layer.scene.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: "#d8d1c4",
      uniformColorMix: 0.75,
      textureSaturation: 0.8,
      textureColorCorrection: false,
    });
    expect(uniforms.uShadowTextureColorCorrection.value).toBe(false);
    expect(mesh.material).toBe(shadowMaterial);

    layer.scene.setShadowSimulationStyle?.(null);
    expect(mesh.material).toBe(sourceMaterial);
    expect(sourceMaterial.side).toBe(THREE.DoubleSide);
    expect(sourceMaterial.shadowSide).toBeNull();

    layer.scene.dispose();
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
    layer.scene.root.add(parent);

    const receivesMapStyleBeforeTileStyling =
      layer.scene.receivesMapStyleTexture;
    expect(typeof receivesMapStyleBeforeTileStyling).toBe("function");
    expect(layer.scene.mapStyleProjectionBlend).toBe("overlay");
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

    const initialVersion = layer.scene.mapStyleProjectionVersion?.() ?? -1;
    layer.scene.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: null,
    });
    const receivesMapStyle = layer.scene.receivesMapStyleTexture;

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
    expect(layer.scene.mapStyleProjectionVersion?.()).toBeGreaterThan(
      initialVersion
    );
    const styledVersion = layer.scene.mapStyleProjectionVersion?.();
    layer.scene.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: null,
    });
    expect(layer.scene.mapStyleProjectionVersion?.()).toBe(styledVersion);

    layer.scene.dispose();
  });
});
