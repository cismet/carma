// @vitest-environment jsdom

/**
 * D2 byte-accounted admission of the 3D Tiles runtime against the real
 * `TilesRenderer` traversal, `LRUCache` and priority queues of
 * 3d-tiles-renderer 0.5.2: tiles register a predicted size when they are
 * admitted, so the cache fills before downloads finish, late completions are
 * never discarded, in-flight downloads are never aborted by the over-max
 * eviction, and the request concurrency follows the remaining headroom.
 *
 * Frame scheduling (`requestAnimationFrame`) and download latency are driven
 * deterministically: one `update()` per animation frame, every fetch resolves
 * at a later frame boundary.
 */

import { TilesRenderer } from "3d-tiles-renderer";
import type { Tile } from "3d-tiles-renderer/core";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TILES_CACHE_CEILING_BYTES,
  TILES_LOAD_POLICY,
  TILE_BYTES_PREDICTION,
} from "./three-tiles-load-policy";
import { buildThreeTilesRuntime } from "./three-tiles-runtime";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-maplibre-worker",
  });
});

const MIB = 1024 ** 2;
const ROOT_URL = "https://tiles.test/admission/tileset.json";
const CHILD_COUNT = 48;
const CEILING = TILES_CACHE_CEILING_BYTES.floor;
/** Measured bytes whose resident-overhead price averages the initial estimate. */
const BASE_MEASURED_BYTES =
  TILE_BYTES_PREDICTION.initialBytes / TILES_LOAD_POLICY.residentOverhead;
const LOADED = 4;

type HarnessTile = Tile & {
  engineData: {
    scene: THREE.Object3D | null;
    geometry: THREE.BufferGeometry[] | null;
    materials: THREE.Material[] | null;
    textures: THREE.Texture[] | null;
  };
};
type HarnessRenderer = TilesRenderer & {
  root: HarnessTile | null;
  loadingTiles: Set<Tile>;
  stats: {
    queued: number;
    downloading: number;
    parsing: number;
    failed: number;
  };
  calculateTileViewError: (
    tile: { geometricError: number },
    target: { inView: boolean; error: number; distanceFromCamera: number }
  ) => void;
  calculateBytesUsed: (tile: Tile, scene: THREE.Object3D | null) => number;
};
type HarnessCache = TilesRenderer["lruCache"] & {
  itemSet: Map<Tile, number>;
  cachedBytes: number;
};

const tileUri = (tile: Tile) => tile.content?.uri ?? "<no-content>";

/** +-50 % drift around the base size, deterministic per child index. */
const measuredBytesFor = (uri: string) => {
  const index = Number(uri.replace(/\D/g, "")) || 0;
  const drift = [0.5, 1.5, 1, 0.75, 1.25, 0.6, 1.4, 0.9][index % 8];
  return Math.round(BASE_MEASURED_BYTES * drift);
};

const buildTilesetJson = () => ({
  asset: { version: "1.0" },
  geometricError: 100,
  root: {
    boundingVolume: { box: [0, 0, 0, 80, 0, 0, 0, 60, 0, 0, 0, 1] },
    geometricError: 100,
    refine: "REPLACE",
    children: Array.from({ length: CHILD_COUNT }, (_, index) => ({
      boundingVolume: {
        box: [
          -70 + (index % 8) * 20,
          -50 + Math.floor(index / 8) * 20,
          0,
          10,
          0,
          0,
          0,
          10,
          0,
          0,
          0,
          1,
        ],
      },
      geometricError: 1,
      refine: "REPLACE",
      content: { uri: `tile-${index}.b3dm` },
    })),
  },
});

describe("three tiles admission (D2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("settles at the ceiling without discards or in-flight aborts under +-50 % size drift", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // Deterministic animation frames.
    let frame = 0;
    let nextHandle = 1;
    const frameCallbacks = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const handle = nextHandle++;
      frameCallbacks.set(handle, cb);
      return handle;
    });
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
      frameCallbacks.delete(handle);
    });
    // Deterministic network: every fetch resolves at a later frame boundary.
    const pendingFetches: Array<{ dueFrame: number; resolve: () => void }> = [];
    const deferUntilFrame = <T>(dueFrame: number, value: () => T) =>
      new Promise<T>((resolve) => {
        pendingFetches.push({ dueFrame, resolve: () => resolve(value()) });
      });
    const fetchesPerTile = new Map<string, number>();
    let requestIndex = 0;
    vi.stubGlobal("fetch", (input: string | URL) => {
      const url = String(input);
      if (url === ROOT_URL) {
        return deferUntilFrame(
          frame + 1,
          () =>
            new Response(JSON.stringify(buildTilesetJson()), {
              headers: { "content-type": "application/json" },
            })
        );
      }
      const uri = url.slice(url.lastIndexOf("/") + 1);
      fetchesPerTile.set(uri, (fetchesPerTile.get(uri) ?? 0) + 1);
      const latency = 1 + (requestIndex++ % 3);
      return deferUntilFrame(
        frame + latency,
        () => new Response(new ArrayBuffer(16))
      );
    });
    // The measured size of a parsed tile (the runtime adds the resident overhead).
    vi.spyOn(
      TilesRenderer.prototype as unknown as {
        calculateBytesUsed: (
          tile: Tile,
          scene: THREE.Object3D | null
        ) => number | null;
      },
      "calculateBytesUsed"
    ).mockImplementation((tile, scene) =>
      scene ? measuredBytesFor(tileUri(tile)) : null
    );

    let captured: HarnessRenderer | undefined;
    const registerPlugin = TilesRenderer.prototype.registerPlugin;
    vi.spyOn(TilesRenderer.prototype, "registerPlugin").mockImplementation(
      function (this: TilesRenderer, plugin: object) {
        captured = this as HarnessRenderer;
        return registerPlugin.call(this, plugin);
      }
    );
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
      getZoom: () => 17,
      getPitch: () => 45,
    } as unknown as MaplibreMap;
    // A style budget below the floor: the ceiling is the 128 MiB floor.
    const layer = buildThreeTilesRuntime("mesh", ROOT_URL, [7.15, 51.25], {
      cacheBudgetBytes: 1,
      cacheOverflowBytes: 0,
    });
    layer.onAdd?.(map);
    const tiles = captured!;
    const cache = tiles.lruCache as HarnessCache;
    expect(cache.isFull()).toBe(false);
    // Every tile is in view and above the target (5 px per metre of error).
    tiles.calculateTileViewError = (tile, target) => {
      target.inView = true;
      target.error = tile.geometricError * 5;
      target.distanceFromCamera = 100;
    };
    const disposals: Array<{ uri: string; state: number; frame: number }> = [];
    tiles.registerPlugin({
      name: "TEST_PARSE_PLUGIN",
      parseTile: (_buffer: ArrayBuffer, tile: Tile) => {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial();
        const scene = new THREE.Group();
        scene.add(new THREE.Mesh(geometry, material));
        const engineData = (tile as HarnessTile).engineData;
        engineData.scene = scene;
        engineData.geometry = [geometry];
        engineData.materials = [material];
        engineData.textures = [];
        return Promise.resolve();
      },
      disposeTile: (tile: Tile) => {
        disposals.push({
          uri: tileUri(tile),
          state: tile.internal.loadingState,
          frame,
        });
      },
    });
    // The completion branch of requestTileContents removes a LOADED tile whose
    // memory was never registered: the "discard after load" signature.
    const discardsAfterLoad: string[] = [];
    const originalRemove = cache.remove.bind(cache);
    cache.remove = (item: Tile) => {
      if (
        item.internal?.loadingState === LOADED &&
        cache.getMemoryUsage(item) === 0
      ) {
        discardsAfterLoad.push(tileUri(item));
      }
      return originalRemove(item);
    };

    const camera = new THREE.PerspectiveCamera(60, 800 / 600, 1, 1_000);
    camera.position.set(0, 0, 60);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const frameInput = {
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    };
    const flushMicrotasks = () =>
      new Promise<void>((resolve) => setTimeout(resolve, 0));
    const concurrencySamples: number[] = [];
    const cachedBytesSamples: number[] = [];
    for (let index = 0; index < 80; index += 1) {
      tiles.dispatchEvent({ type: "needs-update" });
      layer.root.updateMatrixWorld(true);
      layer.update(frameInput);
      concurrencySamples.push(tiles.downloadQueue.maxJobsPerOrigin);
      cachedBytesSamples.push(cache.cachedBytes);
      await flushMicrotasks();
      frame += 1;
      for (
        let pending = pendingFetches.length - 1;
        pending >= 0;
        pending -= 1
      ) {
        const entry = pendingFetches[pending];
        if (entry.dueFrame <= frame) {
          pendingFetches.splice(pending, 1);
          entry.resolve();
        }
      }
      const callbacks = [...frameCallbacks.values()];
      frameCallbacks.clear();
      callbacks.forEach((cb) => cb(frame));
      await flushMicrotasks();
    }

    const children = (tiles.root?.children ?? []) as HarnessTile[];
    const loadedChildren = children.filter(
      (child) => child.internal.loadingState === LOADED
    );
    const abortsInFlight = disposals.filter((entry) => entry.state !== LOADED);

    // Nothing was thrown away after loading and nothing was aborted mid-flight.
    expect(discardsAfterLoad).toEqual([]);
    expect(abortsInFlight).toEqual([]);
    expect([...fetchesPerTile.values()].every((count) => count === 1)).toBe(
      true
    );
    expect(tiles.stats.failed).toBe(0);

    // The pipeline drained and the cache settled at the physical ceiling: the
    // demand (48 x ~4 MiB) exceeds 128 MiB, so the surplus was never admitted.
    expect(tiles.loadingTiles.size).toBe(0);
    expect(
      tiles.stats.queued + tiles.stats.downloading + tiles.stats.parsing
    ).toBe(0);
    expect(cache.isFull()).toBe(true);
    expect(loadedChildren.length).toBe(fetchesPerTile.size);
    expect(loadedChildren.length).toBeGreaterThan(16);
    expect(loadedChildren.length).toBeLessThan(CHILD_COUNT);
    const largestPrice = Math.max(
      ...loadedChildren.map((child) => cache.getMemoryUsage(child))
    );
    expect(cache.cachedBytes).toBeGreaterThanOrEqual(CEILING);
    expect(cache.cachedBytes).toBeLessThan(CEILING + largestPrice);
    expect(Math.max(...cachedBytesSamples)).toBeLessThan(cache.maxBytesSize);
    expect(cache.minBytesSize).toBe(
      Math.floor(CEILING * TILES_LOAD_POLICY.cacheRetentionFraction)
    );
    expect(cache.maxBytesSize).toBeGreaterThan(CEILING);

    // Request concurrency followed the headroom: 128 MiB / 4 MiB at the start,
    // the floor once the cache is full, never above the configured maximum.
    expect(concurrencySamples[0]).toBe(
      Math.floor(CEILING / TILE_BYTES_PREDICTION.initialBytes)
    );
    expect(Math.max(...concurrencySamples)).toBeLessThanOrEqual(
      TILES_LOAD_POLICY.maximumRequestConcurrency
    );
    expect(concurrencySamples[concurrencySamples.length - 1]).toBe(
      TILES_LOAD_POLICY.minimumRequestConcurrency
    );

    // The predictor learned the level average of the registered prices.
    const prediction = tiles.calculateBytesUsed(
      {
        content: { uri: "unseen.b3dm" },
        geometricError: 1,
        internal: {
          basePath: "https://tiles.test/admission",
          hasUnrenderableContent: false,
        },
        engineData: { scene: null },
      } as never,
      null
    );
    expect(prediction).toBeGreaterThan(
      TILE_BYTES_PREDICTION.initialBytes * 0.6
    );
    expect(prediction).toBeLessThan(TILE_BYTES_PREDICTION.initialBytes * 1.4);

    layer.dispose();
  });
});
