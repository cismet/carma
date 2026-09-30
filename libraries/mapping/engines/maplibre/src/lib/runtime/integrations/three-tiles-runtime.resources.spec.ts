// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";

import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { TILES_LOAD_POLICY } from "../../core/tile-load-config";
import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";
import { buildThreeTilesRuntime } from "./three-tiles-runtime";

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

describe("resources runtime integration", () => {
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
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new THREE.Matrix4(),
        sceneFromLocalRotation: new THREE.Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new THREE.Matrix4(),
        referenceToCurrent: new THREE.Matrix4(),
        currentToReference: new THREE.Matrix4(),
      },
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
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new THREE.Matrix4(),
        sceneFromLocalRotation: new THREE.Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new THREE.Matrix4(),
        referenceToCurrent: new THREE.Matrix4(),
        currentToReference: new THREE.Matrix4(),
      },
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
});
