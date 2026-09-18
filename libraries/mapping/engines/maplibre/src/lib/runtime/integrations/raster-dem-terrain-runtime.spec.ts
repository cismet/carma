import { NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN } from "@carma-commons/resources";
import { MercatorCoordinate } from "maplibre-gl";
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Camera,
  Float32BufferAttribute,
  Frustum,
  Group,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  FrontSide,
  MeshLambertMaterial,
  Vector2,
  Vector3,
} from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  acquireRasterDemTerrainTileSource,
  createProjectedTerrainTileGeometry,
  notifySharedThreeTerrainChanged,
  registerSharedThreeTerrainSampler,
  setSharedThreeTerrainLoading,
} = vi.hoisted(() => ({
  acquireRasterDemTerrainTileSource: vi.fn(),
  createProjectedTerrainTileGeometry: vi.fn(),
  notifySharedThreeTerrainChanged: vi.fn(),
  registerSharedThreeTerrainSampler: vi.fn(() => vi.fn()),
  setSharedThreeTerrainLoading: vi.fn(),
}));

vi.mock(
  "@carma-mapping/engines/three/primitives/core",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@carma-mapping/engines/three/primitives/core")
    >()),
    createProjectedTerrainTileGeometry,
  })
);

vi.mock("./raster-dem-terrain-tile-source", () => ({
  acquireRasterDemTerrainTileSource,
  isConfirmedTerrainServerError: () => false,
  terrainTileKey: ({ level, x, y }: Record<string, number>) =>
    `${level}/${x}/${y}`,
}));

vi.mock("./shared-three-terrain-registry", () => ({
  notifySharedThreeTerrainChanged,
  registerSharedThreeTerrainSampler,
  setSharedThreeTerrainLoading,
}));

import { buildRasterDemTerrainRuntime } from "./raster-dem-terrain-runtime";
import { createSharedThreeMapStyleProjection } from "./shared-three-map-style-projection";
import type { TerrainTile, TerrainTileId } from "../../core/raster-dem-tile";
import { getTileBounds } from "../../core/raster-dem-tile";
import { TERRAIN_IDLE_SHADOW_REASON } from "../../core/terrain-idle-prefetch";
import { buildTerrainSelection } from "../../core/terrain-selection";
import type { TerrainSelectionEntry } from "../../core/terrain-selection";
import * as terrainWorkers from "./terrain-worker-client";
import { executeTerrainWorkerTask } from "./terrain-worker-task";
import * as requestConcurrency from "./payload-aware-request-concurrency";
import {
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
  TILE_CAMERA_PRIORITY,
} from "../../core/tile-camera-demand";

const terrainConfig = (url: string) => ({
  id: "test-terrain",
  url,
  tileSize: 512,
  minzoom: 0,
  maxzoom: 18,
  encoding: "terrarium" as const,
  bounds: [-180, -85, 180, 85] as const,
});

describe("buildRasterDemTerrainRuntime", () => {
  let fineBoundaryNormalBeforeSmoothing: Vector3 | null;

  beforeEach(() => {
    vi.clearAllMocks();
    fineBoundaryNormalBeforeSmoothing = null;
    createProjectedTerrainTileGeometry.mockImplementation(({ tile }) => {
      const geometry = new BufferGeometry();
      const isSyntheticFlat =
        tile.heightMeters.length === 4 &&
        tile.heightMeters.every((height) => height === 0);
      const tileX = tile.id?.x;
      const west = tileX === 531 ? -1 : tileX === 533 ? 1 : 0;
      const nearHeight = tile.heightMeters[0] === 123 ? 1 : 0;
      const farHeight = !isSyntheticFlat && tileX === 533 ? 1 : 0;
      if (tile.heightMeters[0] === 456) {
        geometry.setAttribute(
          "position",
          new Float32BufferAttribute(
            new Float32Array([
              1, 2, 0, 1, 2, -0.5, 1, 2, -1, 2, 1, 0, 2, 1, -0.5, 2, 1, -1,
            ]),
            3
          )
        );
        geometry.setIndex([0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5]);
        geometry.computeVertexNormals();
        const normal = geometry.getAttribute("normal");
        fineBoundaryNormalBeforeSmoothing = new Vector3(
          normal.getX(1),
          normal.getY(1),
          normal.getZ(1)
        );
        return geometry;
      }
      geometry.setAttribute(
        "position",
        new Float32BufferAttribute(
          new Float32Array([
            west,
            nearHeight,
            0,
            west,
            nearHeight,
            -1,
            west + 1,
            farHeight,
            0,
            west + 1,
            farHeight,
            -1,
          ]),
          3
        )
      );
      geometry.setIndex([0, 2, 1, 1, 2, 3]);
      geometry.computeVertexNormals();
      return geometry;
    });
  });

  it.each([
    [Number.NaN, 0, 0],
    [-1, 0, 0],
    [0, Number.POSITIVE_INFINITY, 0],
  ] as const)("rejects invalid bounds padding %j", (x, y, z) => {
    const boundsPaddingMeters = [x, y, z] as const;
    expect(() =>
      buildRasterDemTerrainRuntime(
        "invalid-padding",
        terrainConfig("https://example.test/terrain"),
        [7.15, 51.256],
        { boundsPaddingMeters }
      )
    ).toThrow("Terrain bounds padding must be finite and non-negative");
  });

  const createIdlePrefetchFixture = (name: string, maximumLevel = 10) => {
    const tileId = { level: 10, x: 532, y: 218 };
    const bounds = { west: 7, south: 51, east: 7.2, north: 51.3 };
    const makeTile = (id: TerrainTileId): TerrainTile => ({
      id,
      bounds,
      u: new Float32Array([0, 0, 1, 1]),
      v: new Float32Array([0, 1, 0, 1]),
      heightMeters: new Float32Array([100, 100, 100, 100]),
      minimumHeightMeters: 100,
      maximumHeightMeters: 100,
      indices: new Uint32Array([0, 2, 1, 1, 2, 3]),
      westIndices: new Uint32Array(),
      southIndices: new Uint32Array(),
      eastIndices: new Uint32Array(),
      northIndices: new Uint32Array(),
      geometricErrorMeters: 0.01,
      byteLength: 256,
    });
    const source = {
      requestTile: vi.fn(async (id: TerrainTileId, _signal?: AbortSignal) =>
        makeTile(id)
      ),
      getTileGridIdsForBounds: vi.fn(() => [tileId]),
      getTileBounds: vi.fn(() => bounds),
      getLevelMaximumGeometricError: vi.fn(() => 0.01),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(() => 100),
      trimCache: vi.fn(),
      release: vi.fn(),
    };
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const onContentChanged = vi.fn();
    const onError = vi.fn();
    const runtime = buildRasterDemTerrainRuntime(
      name,
      terrainConfig(`https://example.test/idle/${name}`),
      [7.15, 51.256],
      {
        minimumLevel: 10,
        maximumLevel,
        errorTargetPixels: maximumLevel > 10 ? 1_000_000 : undefined,
        onContentChanged,
        onError,
      }
    );
    const listeners = new Map<string, () => void>();
    const map = {
      getBounds: vi.fn(() => ({
        getWest: () => bounds.west,
        getSouth: () => bounds.south,
        getEast: () => bounds.east,
        getNorth: () => bounds.north,
      })),
      on: vi.fn((event: string, listener: () => void) =>
        listeners.set(event, listener)
      ),
      off: vi.fn((event: string) => listeners.delete(event)),
      triggerRepaint: vi.fn(),
    };
    const lodCamera = new PerspectiveCamera(60, 1, 1, 10_000);
    lodCamera.position.set(0, 1_000, 0);
    const frame = {
      map: map as never,
      renderCamera: new Camera(),
      lodCamera,
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new Matrix4(),
        sceneFromLocalRotation: new Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new Matrix4(),
        referenceToCurrent: new Matrix4(),
        currentToReference: new Matrix4(),
      },
    };
    const start = async () => {
      runtime.onAdd?.(map as never);
      await vi.waitFor(() =>
        expect(registerSharedThreeTerrainSampler).toHaveBeenCalled()
      );
      runtime.update(frame);
    };
    return {
      runtime,
      source,
      map,
      frame,
      makeTile,
      listeners,
      start,
      onContentChanged,
      onError,
    };
  };

  it("accepts a live pixel target without replacing the runtime or accepting invalid values", async () => {
    const f = createIdlePrefetchFixture("live-error-target", 12);
    await f.start();
    const root = f.runtime.root;
    f.map.triggerRepaint.mockClear();
    f.runtime.setErrorTarget?.(4);
    expect(f.map.triggerRepaint).toHaveBeenCalledTimes(1);
    f.runtime.setErrorTarget?.(4);
    expect(f.map.triggerRepaint).toHaveBeenCalledTimes(1);
    expect(() => f.runtime.setErrorTarget?.(0)).toThrow(RangeError);
    expect(() => f.runtime.setErrorTarget?.(NaN)).toThrow(RangeError);
    expect(f.runtime.root).toBe(root);
    f.runtime.dispose();
  });

  it("warms two focus LODs without publishing partial coverage or loading twice", async () => {
    const f = createIdlePrefetchFixture("zoom-two-levels", 12);
    const [camera] = snapshotTileCameraViews([
      {
        id: "focus",
        camera: new PerspectiveCamera(),
        viewport: [128, 128],
        errorTargetPixels: 2,
        role: TILE_CAMERA_ROLE.GEOMETRY,
      },
    ]);
    const focusBounds = getTileBounds({ level: 10, x: 532, y: 218 });
    const request = {
      camera,
      lngLat: [
        (focusBounds.west + focusBounds.east) / 2,
        (focusBounds.south + focusBounds.north) / 2,
      ] as const,
      levels: 2 as const,
    };
    try {
      await f.start();
      await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalled());
      const visible = f.runtime.root.children.filter((node) => node.visible);
      await f.runtime.prefetchZoom!(request, new AbortController().signal);
      const requested = f.source.requestTile.mock.calls.map(([id]) => id.level);
      expect(requested).toEqual([10, 11, 12]);
      expect(f.runtime.root.children.filter((node) => node.visible)).toEqual(
        visible
      );
      await f.runtime.prefetchZoom!(request, new AbortController().signal);
      expect(f.source.requestTile).toHaveBeenCalledTimes(3);
    } finally {
      f.runtime.dispose();
    }
  });

  it("does not start focus warming after zoomend", async () => {
    const f = createIdlePrefetchFixture("zoom-cancelled", 12);
    try {
      await f.start();
      await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalled());
      const [camera] = snapshotTileCameraViews([
        {
          id: "focus",
          camera: new Camera(),
          viewport: [128, 128],
          errorTargetPixels: 2,
          role: TILE_CAMERA_ROLE.GEOMETRY,
        },
      ]);
      const abort = new AbortController();
      abort.abort();
      await f.runtime.prefetchZoom!(
        { camera, lngLat: [7.15, 51.256], levels: 2 },
        abort.signal
      );
      expect(f.source.requestTile).toHaveBeenCalledTimes(1);
    } finally {
      f.runtime.dispose();
    }
  });

  it("retries a failed publication at the unchanged view while retaining the previous cut", async () => {
    const f = createIdlePrefetchFixture("publication-retry");
    const run = terrainWorkers.runTerrainWorkerTask;
    let failStitch = false;
    const failure = new Error("Terrain worker timed out during stitching");
    const worker = vi
      .spyOn(terrainWorkers, "runTerrainWorkerTask")
      .mockImplementation((task, signal) => {
        if (task.kind === "stitch" && failStitch) {
          failStitch = false;
          return Promise.reject(failure);
        }
        return run(task, signal);
      });
    try {
      await f.start();
      await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledOnce());
      const retained = f.runtime.root.children.filter((node) => node.visible);
      expect(retained.length).toBeGreaterThan(0);
      vi.useFakeTimers();
      failStitch = true;
      f.source.getTileGridIdsForBounds.mockReturnValue([
        { level: 10, x: 533, y: 218 },
      ]);
      f.frame.lodCamera.position.x += 10;
      f.runtime.update(f.frame);
      await vi.waitFor(() => expect(f.onError).toHaveBeenCalledWith(failure));
      expect(f.runtime.root.children.filter((node) => node.visible)).toEqual(
        retained
      );
      const downloads = f.source.requestTile.mock.calls.length;
      f.map.triggerRepaint.mockClear();
      await vi.advanceTimersByTimeAsync(1600);
      expect(f.map.triggerRepaint).toHaveBeenCalled();
      // The retry wake-up redraws the exact same camera; no input event helps it.
      f.runtime.update(f.frame);
      await vi.waitFor(() =>
        expect(f.source.trimCache).toHaveBeenCalledTimes(2)
      );
      expect(
        f.runtime.root.children.filter((node) => node.visible).length
      ).toBeGreaterThan(retained.length);
      expect(f.source.requestTile).toHaveBeenCalledTimes(downloads);
    } finally {
      f.runtime.dispose();
      worker.mockRestore();
      vi.useRealTimers();
    }
  });

  it("wakes the host when an unchanged worker selection drains the request queue", async () => {
    const f = createIdlePrefetchFixture("selection-idle-wakeup");
    let finishSelection: (() => void) | undefined;
    let worker: { mockRestore: () => void } | undefined;
    try {
      await f.start();
      await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledOnce());
      vi.stubGlobal("Worker", class {});
      worker = vi
        .spyOn(terrainWorkers, "runTerrainWorkerTask")
        .mockImplementation((task, signal) => {
          if (task.kind !== "select")
            return executeTerrainWorkerTask(structuredClone(task), signal);
          const selection = buildTerrainSelection(task.input, {
            getTileGridIdsForBounds: f.source.getTileGridIdsForBounds,
            getTileBounds: f.source.getTileBounds,
            getTileGeometricError: f.source.getLevelMaximumGeometricError,
            getTileDataAvailable: f.source.getTileDataAvailable,
          });
          return new Promise((resolve) => {
            finishSelection = () => resolve({ kind: "select", selection });
          });
        });
      f.frame.lodCamera.position.x += 10;
      f.runtime.update(f.frame);
      expect(f.runtime.getRequestDemand?.()).toBe(1);
      expect(finishSelection).toBeDefined();
      f.map.triggerRepaint.mockClear();
      finishSelection!();
      await vi.waitFor(() => expect(f.runtime.getRequestDemand?.()).toBe(0));
      expect(f.map.triggerRepaint).toHaveBeenCalledOnce();
      expect(f.source.trimCache).toHaveBeenCalledOnce();
      expect(f.source.requestTile).toHaveBeenCalledOnce();
    } finally {
      f.runtime.dispose();
      worker?.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("does not count an intentional focus-request abort as capacity failure", async () => {
    const createConcurrency =
      requestConcurrency.createPayloadAwareRequestConcurrency;
    const observeFailure = vi.fn();
    const concurrency = vi
      .spyOn(requestConcurrency, "createPayloadAwareRequestConcurrency")
      .mockImplementation((...args) => {
        const policy = createConcurrency(...args);
        return {
          ...policy,
          observeFailure: (error) => {
            observeFailure(error);
            return policy.observeFailure(error);
          },
        };
      });
    const f = createIdlePrefetchFixture("zoom-abort-capacity", 12);
    try {
      await f.start();
      await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledOnce());
      const [camera] = snapshotTileCameraViews([
        {
          id: "focus",
          camera: new PerspectiveCamera(),
          viewport: [128, 128],
          errorTargetPixels: 2,
          role: TILE_CAMERA_ROLE.GEOMETRY,
        },
      ]);
      const bounds = getTileBounds({ level: 10, x: 532, y: 218 });
      const request = {
        camera,
        levels: 2 as const,
        lngLat: [
          (bounds.west + bounds.east) / 2,
          (bounds.south + bounds.north) / 2,
        ] as const,
      };
      let activeSignal: AbortSignal | undefined;
      f.source.requestTile.mockImplementationOnce(
        (_id, signal) =>
          new Promise((_resolve, reject) => {
            activeSignal = signal;
            signal!.addEventListener("abort", () => reject(signal!.reason), {
              once: true,
            });
          })
      );
      const controller = new AbortController();
      const result = f.runtime.prefetchZoom!(request, controller.signal).catch(
        (error) => error
      );
      await vi.waitFor(() => expect(activeSignal).toBeDefined());
      controller.abort();
      expect(await result).toMatchObject({ name: "AbortError" });
      expect(observeFailure).not.toHaveBeenCalled();
      // Genuine network failures must still feed the existing adaptive policy.
      const networkError = new TypeError("Failed to fetch");
      f.source.requestTile.mockRejectedValueOnce(networkError);
      await expect(
        f.runtime.prefetchZoom!(request, new AbortController().signal)
      ).rejects.toBe(networkError);
      expect(observeFailure).toHaveBeenCalledOnce();
      expect(observeFailure).toHaveBeenCalledWith(networkError);
    } finally {
      f.runtime.dispose();
      concurrency.mockRestore();
    }
  });

  it("reconciles matrix-only camera changes without cancelling overlapping work or published coverage", async () => {
    const f = createIdlePrefetchFixture("latest-matrix-demand");
    const requests = new Map<string, AbortSignal>();
    const key = ({ level, x, y }: TerrainTileId) => `${level}/${x}/${y}`;
    // Public MapLibre state remains unchanged: the independent camera moves.
    Object.assign(f.map, { getCenter: () => ({ lng: 7.15, lat: 51.256 }) });
    try {
      await f.start();
      await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledOnce());
      const visible = f.runtime.root.children.filter((node) => node.visible);
      f.source.requestTile.mockImplementation(
        (id, signal) =>
          new Promise((_resolve, reject) => {
            requests.set(key(id), signal!);
            signal!.addEventListener("abort", () => reject(signal!.reason), {
              once: true,
            });
          })
      );
      const first = { level: 10, x: 533, y: 218 };
      const shared = { level: 10, x: 534, y: 218 };
      const next = { level: 10, x: 535, y: 218 };
      f.source.getTileGridIdsForBounds.mockReturnValue([first, shared]);
      f.frame.renderCamera.position.x += 0.01;
      f.runtime.update(f.frame);
      await vi.waitFor(() => expect(requests.has(key(shared))).toBe(true));
      const obsoleteSignal = requests.get(key(first))!;
      const sharedSignal = requests.get(key(shared))!;
      // Arbitrarily small matrix jitter resolves to the same demand cut.
      for (let index = 0; index < 5; index++) {
        f.frame.renderCamera.position.x += 1e-9;
        f.runtime.update(f.frame);
      }
      expect(obsoleteSignal.aborted).toBe(false);
      expect(sharedSignal.aborted).toBe(false);
      expect(
        f.source.requestTile.mock.calls.filter(
          ([id]) => key(id) === key(shared)
        )
      ).toHaveLength(1);
      f.source.getTileGridIdsForBounds.mockReturnValue([shared, next]);
      f.frame.renderCamera.position.x += 0.01;
      f.runtime.update(f.frame);
      await vi.waitFor(() => expect(requests.has(key(next))).toBe(true));
      expect(obsoleteSignal.aborted).toBe(true);
      expect(sharedSignal.aborted).toBe(false);
      expect(
        f.source.requestTile.mock.calls.filter(
          ([id]) => key(id) === key(shared)
        )
      ).toHaveLength(1);
      for (const node of visible) expect(node.visible).toBe(true);
      expect(f.onError).not.toHaveBeenCalled();
      // Cancellation is not an unavailable-tile mark: returning can fetch it.
      f.source.getTileGridIdsForBounds.mockReturnValue([first, shared]);
      f.frame.renderCamera.position.x += 0.01;
      f.runtime.update(f.frame);
      await vi.waitFor(() =>
        expect(
          f.source.requestTile.mock.calls.filter(
            ([id]) => key(id) === key(first)
          )
        ).toHaveLength(2)
      );
      expect(sharedSignal.aborted).toBe(false);
    } finally {
      f.runtime.dispose();
    }
  });

  it("keeps the latest same-cut view eligible for idle work when its shared request completes", async () => {
    const f = createIdlePrefetchFixture("same-cut-jitter-completion");
    let complete!: () => void;
    let signal: AbortSignal | undefined;
    f.source.requestTile.mockImplementationOnce(
      (id, requestSignal) =>
        new Promise((resolve) => {
          signal = requestSignal;
          complete = () => resolve(f.makeTile(id));
        })
    );
    try {
      await f.start();
      await vi.waitFor(() => expect(signal).toBeDefined());
      f.frame.renderCamera.position.x += 1e-9;
      f.runtime.update(f.frame);
      expect(signal!.aborted).toBe(false);
      expect(f.source.requestTile).toHaveBeenCalledOnce();
      complete();
      await vi.waitFor(() =>
        expect(f.runtime.getIdlePrefetchAvailability().ready).toBe(true)
      );
      expect(f.source.requestTile).toHaveBeenCalledOnce();
    } finally {
      f.runtime.dispose();
    }
  });

  it("cancels finer pending terrain when zooming out and keeps the loaded coarse floor", async () => {
    const f = createIdlePrefetchFixture("coarser-demand-cancel", 12);
    const fineRequests: AbortSignal[] = [];
    try {
      await f.start();
      await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledOnce());
      const floor = f.runtime.root.children.filter((node) => node.visible);
      f.source.getLevelMaximumGeometricError.mockReturnValue(1e9);
      f.source.requestTile.mockImplementation(
        (_id, signal) =>
          new Promise((_resolve, reject) => {
            fineRequests.push(signal!);
            signal!.addEventListener("abort", () => reject(signal!.reason), {
              once: true,
            });
          })
      );
      f.frame.lodCamera.position.y = 1001;
      f.runtime.update(f.frame);
      await vi.waitFor(() => expect(fineRequests.length).toBeGreaterThan(0));
      expect(
        f.source.requestTile.mock.calls.slice(1).every(([id]) => id.level > 10)
      ).toBe(true);
      f.frame.lodCamera.position.y = 1e12;
      f.runtime.update(f.frame);
      expect(fineRequests.every((signal) => signal.aborted)).toBe(true);
      await vi.waitFor(() => expect(f.runtime.getRequestDemand?.()).toBe(0));
      for (const node of floor) expect(node.visible).toBe(true);
      expect(f.onError).not.toHaveBeenCalled();
      expect(
        f.source.requestTile.mock.calls.filter(([id]) => id.level === 10)
      ).toHaveLength(1);
    } finally {
      f.runtime.dispose();
    }
  });

  it("reprioritizes existing raster demand on camera selection and resumes lower-ranked work without replacing loaded coverage", async () => {
    const f = createIdlePrefetchFixture("camera-priority");
    let worker: { mockRestore: () => void } | undefined;
    try {
      await f.start();
      await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledOnce());
      const retained = f.runtime.root.children.filter((node) => node.visible);
      let entries: TerrainSelectionEntry[] = [
        {
          id: { level: 10, x: 533, y: 218 },
          kind: "source",
          priority: TILE_CAMERA_PRIORITY.PRIMARY,
        },
        {
          id: { level: 10, x: 534, y: 218 },
          kind: "source",
          priority: TILE_CAMERA_PRIORITY.SECONDARY,
        },
      ];
      const completions = new Map<number, () => void>();
      const signals: AbortSignal[] = [];
      f.source.requestTile.mockClear();
      f.source.requestTile.mockImplementation(
        (id, signal) =>
          new Promise((resolve, reject) => {
            signals.push(signal!);
            signal!.addEventListener("abort", () => reject(signal!.reason), {
              once: true,
            });
            completions.set(id.x, () => resolve(f.makeTile(id)));
          })
      );
      vi.stubGlobal("Worker", class {});
      worker = vi
        .spyOn(terrainWorkers, "runTerrainWorkerTask")
        .mockImplementation((task, signal) => {
          if (task.kind !== "select")
            return executeTerrainWorkerTask(structuredClone(task), signal);
          return Promise.resolve({
            kind: "select",
            selection: {
              entries,
              viewportStages: [entries],
              loadEntries: entries,
              signature: entries
                .map((entry) => `${entry.id.x}:${entry.priority}`)
                .join("|"),
              viewportElevationSignature: "camera-priority",
            },
          });
        });
      f.frame.renderCamera.position.x += 0.01;
      f.runtime.update(f.frame);
      await vi.waitFor(() =>
        expect(f.source.requestTile.mock.calls.map(([id]) => id.x)).toEqual([
          533,
        ])
      );
      expect(f.runtime.root.children.filter((node) => node.visible)).toEqual(
        retained
      );
      entries = entries.map((entry) => ({
        ...entry,
        priority:
          entry.id.x === 534
            ? TILE_CAMERA_PRIORITY.FOCUS
            : TILE_CAMERA_PRIORITY.PRIMARY,
      }));
      f.frame.renderCamera.position.x += 0.01;
      f.runtime.update(f.frame);
      await vi.waitFor(() =>
        expect(f.source.requestTile.mock.calls.map(([id]) => id.x)).toEqual([
          533, 534,
        ])
      );
      expect(signals[0].aborted).toBe(true);
      expect(signals[1].aborted).toBe(false);
      expect(f.runtime.root.children.filter((node) => node.visible)).toEqual(
        retained
      );
      completions.get(534)!();
      await vi.waitFor(() =>
        expect(f.source.requestTile.mock.calls.map(([id]) => id.x)).toEqual([
          533, 534, 533,
        ])
      );
      completions.get(533)!();
      await vi.waitFor(() =>
        expect(f.source.trimCache).toHaveBeenCalledTimes(2)
      );
      expect(f.onError).not.toHaveBeenCalled();
      expect(
        f.source.requestTile.mock.calls.filter(([id]) => id.x === 534)
      ).toHaveLength(1);
      expect(
        f.runtime.root.children.some((node) => node.name.endsWith("534/218"))
      ).toBe(true);
    } finally {
      f.runtime.dispose();
      worker?.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("discards a superseded worker selection before admitting its obsolete tiles", async () => {
    const f = createIdlePrefetchFixture("latest-worker-selection");
    const queued: { complete: () => void }[] = [];
    let worker: { mockRestore: () => void } | undefined;
    try {
      await f.start();
      await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledOnce());
      vi.stubGlobal("Worker", class {});
      worker = vi
        .spyOn(terrainWorkers, "runTerrainWorkerTask")
        .mockImplementation((task, signal) => {
          if (task.kind !== "select")
            return executeTerrainWorkerTask(structuredClone(task), signal);
          const selection = buildTerrainSelection(task.input, {
            getTileGridIdsForBounds: f.source.getTileGridIdsForBounds,
            getTileBounds: f.source.getTileBounds,
            getTileGeometricError: f.source.getLevelMaximumGeometricError,
            getTileDataAvailable: f.source.getTileDataAvailable,
          });
          return new Promise((resolve) => {
            queued.push({
              complete: () => resolve({ kind: "select", selection }),
            });
          });
        });
      f.source.getTileGridIdsForBounds.mockReturnValue([
        { level: 10, x: 533, y: 218 },
      ]);
      f.frame.renderCamera.position.x += 0.01;
      f.runtime.update(f.frame);
      f.source.getTileGridIdsForBounds.mockReturnValue([
        { level: 10, x: 534, y: 218 },
      ]);
      f.frame.renderCamera.position.x += 0.01;
      f.runtime.update(f.frame);
      expect(queued).toHaveLength(1);
      queued[0].complete();
      await vi.waitFor(() => expect(queued).toHaveLength(2));
      expect(f.source.requestTile.mock.calls.some(([id]) => id.x === 533)).toBe(
        false
      );
      queued[1].complete();
      await vi.waitFor(() =>
        expect(
          f.source.requestTile.mock.calls.some(([id]) => id.x === 534)
        ).toBe(true)
      );
      expect(f.source.requestTile.mock.calls.some(([id]) => id.x === 533)).toBe(
        false
      );
    } finally {
      f.runtime.dispose();
      worker?.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it.each(["none", "camera", "sun", "geographic-edge"] as const)(
    "cancels offscreen requests during continuous motion before selection replies (protection=%s)",
    async (protection) => {
      const f = createIdlePrefetchFixture(`continuous-motion-${protection}`);
      let signal: AbortSignal | undefined;
      let worker: { mockRestore: () => void } | undefined;
      const extra = new OrthographicCamera(
        -50_000,
        50_000,
        50_000,
        -50_000,
        1,
        100_000
      );
      extra.position.set(0, 20_000, 0);
      extra.lookAt(0, 0, 0);
      extra.updateMatrixWorld(true);
      const frame = {
        ...f.frame,
        tileCameraViews: snapshotTileCameraViews([]),
      };
      try {
        await f.start();
        await vi.waitFor(() =>
          expect(f.source.trimCache).toHaveBeenCalledOnce()
        );
        const floor = [...f.runtime.root.children];
        f.source.requestTile.mockImplementation(
          (_id, requestSignal) =>
            new Promise((_resolve, reject) => {
              signal = requestSignal;
              signal!.addEventListener("abort", () => reject(signal!.reason), {
                once: true,
              });
            })
        );
        f.source.getTileGridIdsForBounds.mockReturnValue([
          { level: 10, x: 533, y: 218 },
        ]);
        frame.renderCamera.position.x += 0.01;
        f.runtime.update(frame);
        await vi.waitFor(() => expect(signal).toBeDefined());
        vi.stubGlobal("Worker", class {});
        worker = vi
          .spyOn(terrainWorkers, "runTerrainWorkerTask")
          .mockImplementation((task, workerSignal) =>
            task.kind === "select"
              ? new Promise(() => {})
              : executeTerrainWorkerTask(structuredClone(task), workerSignal)
          );
        const observer = new PerspectiveCamera(60, 1, 1, 100);
        observer.position.set(10_000_000, 0, 0);
        frame.renderCamera = observer;
        f.map.getBounds.mockReturnValue({
          getWest: () => (protection === "geographic-edge" ? 7.2 : 10),
          getEast: () => (protection === "geographic-edge" ? 7.3 : 10.1),
          getSouth: () => 51,
          getNorth: () => 51.3,
        });
        if (protection === "camera")
          frame.tileCameraViews = snapshotTileCameraViews([
            {
              id: "retain-caster",
              camera: extra,
              viewport: [800, 600],
              errorTargetPixels: 2,
              role: TILE_CAMERA_ROLE.GEOMETRY,
            },
          ]);
        if (protection === "sun")
          f.runtime.setShadowView({
            camera: extra,
            shadowMapSize: { width: 1024, height: 1024 },
          });
        for (let index = 0; index < 6; index++) {
          observer.position.x += 1;
          f.runtime.update(frame);
          expect(signal!.aborted).toBe(protection === "none");
        }
        // No selection has replied; further changes still reject stale work
        // immediately once its last extra camera/caster consumer is removed.
        frame.tileCameraViews = [];
        f.runtime.setShadowView(null);
        f.map.getBounds.mockReturnValue({
          getWest: () => 10,
          getEast: () => 10.1,
          getSouth: () => 51,
          getNorth: () => 51.3,
        });
        observer.position.x += 1;
        f.runtime.update(frame);
        expect(signal!.aborted).toBe(true);
        for (const node of floor) expect(node.parent).toBe(f.runtime.root);
        expect(f.onError).not.toHaveBeenCalled();
        expect(
          vi
            .mocked(terrainWorkers.runTerrainWorkerTask)
            .mock.calls.filter(([task]) => task.kind === "select")
        ).toHaveLength(1);
      } finally {
        f.runtime.dispose();
        worker?.mockRestore();
        vi.unstubAllGlobals();
      }
    }
  );

  it("shares terrain payloads across cameras and promotes geometry without requesting again", async () => {
    const f = createIdlePrefetchFixture("shared-camera-pool");
    const observer = new PerspectiveCamera(60, 1, 1, 100);
    observer.position.set(10_000_000, 0, 0);
    observer.updateMatrixWorld(true);
    f.frame.renderCamera = observer;
    const extra = new OrthographicCamera(
      -1_000_000,
      1_000_000,
      1_000_000,
      -1_000_000,
      1,
      3_000_000
    );
    extra.position.set(0, 1_000_000, 0);
    extra.lookAt(0, 0, 0);
    const views = ["rays-a", "rays-b"].map((id) => ({
      id,
      camera: extra,
      viewport: [800, 600] as const,
      errorTargetPixels: 2,
      role: TILE_CAMERA_ROLE.GEOMETRY,
    }));
    const frame = {
      ...f.frame,
      tileCameraViews: snapshotTileCameraViews(views),
    };
    try {
      await f.start();
      f.runtime.update(frame);
      await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalled());
      const meshes: Mesh[] = [];
      f.runtime.root.traverse((object) => {
        if (object instanceof Mesh) meshes.push(object);
      });
      expect(meshes.length).toBeGreaterThan(0);
      const payload = meshes[0];
      expect(payload.receiveShadow).toBe(false);
      expect(f.source.requestTile).toHaveBeenCalledTimes(1);
      frame.tileCameraViews = snapshotTileCameraViews([
        { ...views[0], role: TILE_CAMERA_ROLE.RECEIVER },
      ]);
      f.runtime.update(frame);
      expect(payload.receiveShadow).toBe(true);
      expect(payload.visible).toBe(true);
      expect(f.source.requestTile).toHaveBeenCalledTimes(1);
      expect(acquireRasterDemTerrainTileSource).toHaveBeenCalledTimes(1);
    } finally {
      f.runtime.dispose();
    }
  });

  it.each([false, true])(
    "releases its raster source exactly once (acquired=%s)",
    async (acquired) => {
      const { runtime, source, start } = createIdlePrefetchFixture(
        `source-release-${acquired}`
      );
      if (acquired) await start();
      runtime.dispose();
      runtime.dispose();
      await vi.waitFor(() => expect(source.release).toHaveBeenCalledOnce());
    }
  );

  it("retains the loaded visible surface when drag-start selection has no replacement", async () => {
    const f = createIdlePrefetchFixture("drag-coverage");
    const camera = new OrthographicCamera(
      -50_000,
      50_000,
      50_000,
      -50_000,
      1,
      100_000
    );
    camera.position.set(0, 10_000, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    f.frame.renderCamera = camera;
    await f.start();
    await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledTimes(1));
    const visible = f.runtime.root.children.filter((node) => node.visible);
    expect(visible).toHaveLength(1);
    const geometry = (visible[0].children[0] as Mesh).geometry;
    const dispose = vi.spyOn(geometry, "dispose");

    f.listeners.get("movestart")!();
    f.source.getTileGridIdsForBounds.mockReturnValue([]);
    f.frame.lodCamera.position.x += 100;
    f.runtime.update(f.frame);
    await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledTimes(2));
    expect(visible[0].visible).toBe(true);
    expect(visible[0].parent).toBe(f.runtime.root);
    expect(dispose).not.toHaveBeenCalled();
    f.runtime.dispose();
  });

  it("retains an offscreen caster in the shadow frustum across an empty transient selection", async () => {
    const f = createIdlePrefetchFixture("offscreen-caster-retention");
    const shadowCamera = new OrthographicCamera(
      -50000,
      50000,
      50000,
      -50000,
      1,
      100000
    );
    shadowCamera.position.set(0, 10000, 0);
    shadowCamera.lookAt(0, 0, 0);
    shadowCamera.updateMatrixWorld(true);
    f.runtime.setShadowView({
      camera: shadowCamera,
      shadowMapSize: { width: 1024, height: 1024 },
    });
    await f.start();
    await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledTimes(1));
    const visible = f.runtime.root.children.filter((node) => node.visible);
    expect(visible).toHaveLength(1);
    f.source.getTileGridIdsForBounds.mockReturnValue([]);
    // Mutating the external controller must not mutate the accepted shadow view.
    shadowCamera.position.x += 1000000;
    shadowCamera.updateMatrixWorld(true);
    f.frame.lodCamera.position.x += 100;
    f.runtime.update(f.frame);
    await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledTimes(2));
    expect(visible[0].visible).toBe(true);
    f.runtime.dispose();
  });

  it("reports target-LOD readiness only after its selected terrain is published", async () => {
    const f = createIdlePrefetchFixture("corridor-readiness");
    const region = new Box3(
      new Vector3(-100, -100, -100),
      new Vector3(100, 200, 100)
    );
    expect(f.runtime.isShadowRegionReady?.(region)).toBe(false);
    await f.start();
    await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledTimes(1));
    expect(f.runtime.isShadowRegionReady?.(region)).toBe(true);
    f.runtime.dispose();
    expect(f.runtime.isShadowRegionReady?.(region)).toBe(false);
  });

  it("does not prefetch before the complete foreground cut is published", async () => {
    const { runtime, source, makeTile, start } =
      createIdlePrefetchFixture("coverage-first");
    let finishTile: (() => void) | undefined;
    source.requestTile.mockImplementationOnce(
      (id) =>
        new Promise((resolve) => {
          finishTile = () => resolve(makeTile(id));
        })
    );
    expect(runtime.getIdlePrefetchAvailability()).toEqual({
      ready: false,
      remaining: 0,
    });
    await start();
    await vi.waitFor(() => expect(finishTile).toBeDefined());
    expect(await runtime.prefetchIdleTerrain()).toMatchObject({
      prepared: 0,
      remaining: 0,
    });
    expect(source.requestTile).toHaveBeenCalledTimes(1);
    finishTile!();
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability()).toEqual({
        ready: true,
        remaining: 8,
      })
    );
    runtime.dispose();
  });

  it("warms one bounded neighbour ring without retaining or publishing meshes", async () => {
    const { runtime, source, map, frame, start, onContentChanged } =
      createIdlePrefetchFixture("warm-ring");
    await start();
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    runtime.update(frame);
    const nodes = [...runtime.root.children];
    const volumes = runtime.getActiveTileVolumes();
    const projectionVersion = runtime.mapStyleProjectionVersion?.();
    onContentChanged.mockClear();
    map.triggerRepaint.mockClear();
    setSharedThreeTerrainLoading.mockClear();
    notifySharedThreeTerrainChanged.mockClear();

    expect(await runtime.prefetchIdleTerrain()).toEqual({
      prepared: 8,
      failed: 0,
      remaining: 0,
      aborted: false,
    });
    runtime.update(frame);
    expect(runtime.root.children).toEqual(nodes);
    expect(runtime.root.children.every((node) => node.visible)).toBe(true);
    expect(runtime.getActiveTileVolumes()).toEqual(volumes);
    expect(runtime.mapStyleProjectionVersion?.()).toBe(projectionVersion);
    expect(onContentChanged).not.toHaveBeenCalled();
    expect(map.triggerRepaint).not.toHaveBeenCalled();
    expect(setSharedThreeTerrainLoading).not.toHaveBeenCalled();
    expect(notifySharedThreeTerrainChanged).not.toHaveBeenCalled();
    expect(source.requestTile).toHaveBeenCalledTimes(9);
    expect(
      source.requestTile.mock.calls.slice(1).every(([id]) => id.level === 9)
    ).toBe(true);
    expect(await runtime.prefetchIdleTerrain()).toEqual({
      prepared: 0,
      failed: 0,
      remaining: 0,
      aborted: false,
    });
    expect(source.requestTile).toHaveBeenCalledTimes(9);
    runtime.dispose();
  });

  it.each(["signal", "movement", "view", "shadow", "dispose"] as const)(
    "cancels its idle source waiter on %s and ignores late replies",
    async (reason) => {
      const { runtime, source, makeTile, start, frame, listeners } =
        createIdlePrefetchFixture(`abort-${reason}`);
      await start();
      await vi.waitFor(() =>
        expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
      );
      let finishTile: (() => void) | undefined;
      source.requestTile.mockImplementationOnce(
        (id) =>
          new Promise((resolve) => {
            finishTile = () => resolve(makeTile(id));
          })
      );
      const controller = new AbortController();
      const work = runtime.prefetchIdleTerrain(controller.signal);
      await vi.waitFor(() => expect(finishTile).toBeDefined());
      expect(source.requestTile).toHaveBeenCalledTimes(2);
      if (reason === "signal") controller.abort();
      else if (reason === "movement") listeners.get("movestart")!();
      else if (reason === "view")
        runtime.update({ ...frame, viewport: new Vector2(900, 900) });
      else if (reason === "shadow")
        runtime.setShadowView({
          camera: new OrthographicCamera(-10, 10, 10, -10, 1, 100),
          shadowMapSize: { width: 64, height: 64 },
        });
      else runtime.dispose();
      finishTile!();
      expect(await work).toMatchObject({
        prepared: 0,
        failed: 0,
        aborted: true,
      });
      expect(source.requestTile).toHaveBeenCalledTimes(2);
      expect(source.requestTile.mock.calls[1][1]).toBeInstanceOf(AbortSignal);
      expect(source.requestTile.mock.calls[1][1]?.aborted).toBe(true);
      runtime.dispose();
    }
  );

  it("keeps speculative failures out of foreground loading and error UI", async () => {
    const { runtime, source, start, onError } =
      createIdlePrefetchFixture("warm-failure");
    await start();
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    source.requestTile.mockRejectedValueOnce(new Error("prefetch unavailable"));
    setSharedThreeTerrainLoading.mockClear();
    expect(await runtime.prefetchIdleTerrain()).toMatchObject({
      prepared: 0,
      failed: 1,
      aborted: false,
    });
    expect(source.requestTile).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
    expect(setSharedThreeTerrainLoading).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("offers stable shadow regions after cache warming without publishing a coarse cut", async () => {
    const { runtime, start } = createIdlePrefetchFixture("shadow-regions");
    expect(runtime.getIdleShadowRegions()).toEqual([]);
    await start();
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    const before = runtime.getIdleShadowRegions();
    expect(before).toHaveLength(8);
    expect(before.every(({ terrainLevel }) => terrainLevel === 9)).toBe(true);
    await runtime.prefetchIdleTerrain();
    const after = runtime.getIdleShadowRegions();
    expect(after.map(({ id }) => id)).toEqual(before.map(({ id }) => id));
    expect(
      after.every(
        ({ receiverBounds }, index) =>
          receiverBounds.getSize(new Vector3()).y <
          before[index].receiverBounds.getSize(new Vector3()).y
      )
    ).toBe(true);
    after[0].receiverBounds.makeEmpty();
    expect(runtime.getIdleShadowRegions()[0].receiverBounds.isEmpty()).toBe(
      false
    );
    runtime.dispose();
    expect(runtime.getIdleShadowRegions()).toEqual([]);
  });

  it("leases detached depth-only geometry and owns its disposal, never the live material", async () => {
    const { runtime, source, start, frame, map, onContentChanged } =
      createIdlePrefetchFixture("shadow-lease");
    await start();
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    runtime.update(frame);
    const candidate = runtime.getIdleShadowRegions()[0];
    const nodes = [...runtime.root.children];
    const volumes = runtime.getActiveTileVolumes();
    const projectionVersion = runtime.mapStyleProjectionVersion?.();
    onContentChanged.mockClear();
    setSharedThreeTerrainLoading.mockClear();
    notifySharedThreeTerrainChanged.mockClear();
    map.triggerRepaint.mockClear();
    const casterBounds = candidate.receiverBounds.clone();
    const lease = await runtime.prepareIdleShadowRegion({
      ...candidate,
      casterBounds,
    });
    expect(lease.covered).toBe(true);
    expect(lease.isCurrent()).toBe(true);
    expect(lease.group?.parent).toBeNull();
    expect(lease.group?.children).toHaveLength(1);
    const mesh = lease.group!.children[0] as Mesh;
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(false);
    expect(lease.dependencyBounds).toEqual([casterBounds]);
    casterBounds.makeEmpty();
    expect(lease.dependencyBounds[0].isEmpty()).toBe(false);
    expect(source.requestTile).toHaveBeenCalledTimes(2);
    expect(runtime.getIdlePrefetchAvailability().ready).toBe(false);
    const second = await runtime.prepareIdleShadowRegion({
      ...candidate,
      casterBounds: candidate.receiverBounds.clone(),
    });
    expect(second.reason).toBe(TERRAIN_IDLE_SHADOW_REASON.unavailable);
    expect(source.requestTile).toHaveBeenCalledTimes(2);
    expect(runtime.root.children).toEqual(nodes);
    expect(runtime.getActiveTileVolumes()).toEqual(volumes);
    expect(runtime.mapStyleProjectionVersion?.()).toBe(projectionVersion);
    expect(onContentChanged).not.toHaveBeenCalled();
    expect(setSharedThreeTerrainLoading).not.toHaveBeenCalled();
    expect(notifySharedThreeTerrainChanged).not.toHaveBeenCalled();
    expect(map.triggerRepaint).not.toHaveBeenCalled();
    const disposeGeometry = vi.spyOn(mesh.geometry, "dispose");
    const disposeMaterial = vi.spyOn(
      mesh.material as MeshLambertMaterial,
      "dispose"
    );
    const temporaryHost = new Group();
    temporaryHost.add(lease.group!);
    lease.dispose();
    lease.dispose();
    expect(temporaryHost.children).toHaveLength(0);
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).not.toHaveBeenCalled();
    expect(lease.covered).toBe(false);
    expect(lease.group).toBeNull();
    expect(runtime.getIdlePrefetchAvailability().ready).toBe(true);
    runtime.dispose();
  });

  it("keeps resident neighbour tiles eligible for shadows when revisiting a settled view", async () => {
    const { runtime, source, start, frame } =
      createIdlePrefetchFixture("shadow-revisit");
    await start();
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    const originalRegions = runtime.getIdleShadowRegions().map(({ id }) => id);
    const [level, x, y] = originalRegions[0].split("/").map(Number);
    // A real camera and negligible error keep the visited neighbour at its
    // intended coarse LOD; the generic fixture's fov-less Camera refines it.
    const revisitFrame = { ...frame, renderCamera: frame.lodCamera };
    source.getLevelMaximumGeometricError.mockReturnValue(0.000001);
    source.getTileGridIdsForBounds.mockReturnValue([{ level, x, y }]);
    runtime.update({ ...revisitFrame, viewport: new Vector2(900, 900) });
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    source.getTileGridIdsForBounds.mockReturnValue([
      { level: 10, x: 532, y: 218 },
    ]);
    expect(source.requestTile.mock.calls.map(([id]) => id)).toContainEqual({
      level,
      x,
      y,
    });
    runtime.update({ ...revisitFrame, viewport: new Vector2(800, 800) });
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    expect(runtime.getIdleShadowRegions().map(({ id }) => id)).toEqual(
      originalRegions
    );
    // Cache warming skips the resident neighbour; shadow-region planning does not.
    expect(runtime.getIdlePrefetchAvailability().remaining).toBe(7);
    runtime.dispose();
  });

  it.each(["signal", "movement", "view", "shadow", "dispose"] as const)(
    "cancels a shadow lease source waiter on %s and ignores late replies",
    async (reason) => {
      const { runtime, source, makeTile, start, listeners, frame } =
        createIdlePrefetchFixture(`shadow-lease-abort-${reason}`);
      await start();
      await vi.waitFor(() =>
        expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
      );
      const candidate = runtime.getIdleShadowRegions()[0];
      const region = {
        ...candidate,
        casterBounds: candidate.receiverBounds.clone(),
      };
      let finishTile: (() => void) | undefined;
      source.requestTile.mockImplementationOnce(
        (id) =>
          new Promise((resolve) => {
            finishTile = () => resolve(makeTile(id));
          })
      );
      const controller = new AbortController();
      const work = runtime.prepareIdleShadowRegion(region, controller.signal);
      await vi.waitFor(() => expect(finishTile).toBeDefined());
      if (reason === "signal") controller.abort();
      else if (reason === "movement") listeners.get("movestart")!();
      else if (reason === "view")
        runtime.update({ ...frame, viewport: new Vector2(900, 900) });
      else if (reason === "shadow")
        runtime.setShadowView({
          camera: new OrthographicCamera(-10, 10, 10, -10, 1, 100),
          shadowMapSize: { width: 64, height: 64 },
        });
      else runtime.dispose();
      expect((await runtime.prepareIdleShadowRegion(region)).covered).toBe(
        false
      );
      expect(source.requestTile).toHaveBeenCalledTimes(2);
      finishTile!();
      const lease = await work;
      expect(lease.covered).toBe(false);
      expect(lease.group).toBeNull();
      expect(lease.reason).toBe(TERRAIN_IDLE_SHADOW_REASON.aborted);
      expect(source.requestTile.mock.calls[1][1]).toBeInstanceOf(AbortSignal);
      expect(source.requestTile.mock.calls[1][1]?.aborted).toBe(true);
      runtime.dispose();
    }
  );

  it("invalidates and disposes an already prepared lease on movement", async () => {
    const { runtime, start, listeners } =
      createIdlePrefetchFixture("ready-shadow-abort");
    await start();
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    const candidate = runtime.getIdleShadowRegions()[0];
    const lease = await runtime.prepareIdleShadowRegion({
      ...candidate,
      casterBounds: candidate.receiverBounds.clone(),
    });
    expect(lease.covered).toBe(true);
    const disposeGeometry = vi.spyOn(
      (lease.group!.children[0] as Mesh).geometry,
      "dispose"
    );
    listeners.get("movestart")!();
    expect(lease.covered).toBe(false);
    expect(lease.isCurrent()).toBe(false);
    expect(lease.group).toBeNull();
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });

  it("refuses missing or invalid terrain without changing foreground UI", async () => {
    const { runtime, source, start, makeTile, onError } =
      createIdlePrefetchFixture("shadow-missing");
    await start();
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    const candidate = runtime.getIdleShadowRegions()[0];
    const region = {
      ...candidate,
      casterBounds: candidate.receiverBounds.clone(),
    };
    source.getTileDataAvailable.mockReturnValueOnce(false);
    expect((await runtime.prepareIdleShadowRegion(region)).reason).toBe(
      TERRAIN_IDLE_SHADOW_REASON.missing
    );
    expect(source.requestTile).toHaveBeenCalledTimes(1);
    source.requestTile.mockImplementationOnce(async (id) => {
      const tile = makeTile(id);
      tile.heightMeters[0] = NaN;
      return tile;
    });
    setSharedThreeTerrainLoading.mockClear();
    const lease = await runtime.prepareIdleShadowRegion(region);
    expect(lease.covered).toBe(false);
    expect(lease.reason).toBe(TERRAIN_IDLE_SHADOW_REASON.missing);
    expect(lease.group).toBeNull();
    expect(runtime.getIdlePrefetchAvailability().ready).toBe(true);
    expect(setSharedThreeTerrainLoading).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("counts a retained backing buffer, not only a small attribute view, against 32 MiB", async () => {
    const { runtime, start } = createIdlePrefetchFixture(
      "shadow-memory-budget"
    );
    await start();
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    const candidate = runtime.getIdleShadowRegions()[0];
    createProjectedTerrainTileGeometry.mockImplementationOnce(() => {
      const geometry = new BufferGeometry();
      const backing = new ArrayBuffer(33 * 1024 * 1024);
      const positions = new Float32Array(backing, 0, 12);
      positions.set([0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 1]);
      geometry.setAttribute("position", new BufferAttribute(positions, 3));
      geometry.setIndex([0, 2, 1, 1, 2, 3]);
      geometry.computeVertexNormals();
      return geometry;
    });
    const lease = await runtime.prepareIdleShadowRegion({
      ...candidate,
      casterBounds: candidate.receiverBounds.clone(),
    });
    expect(lease.reason).toBe(TERRAIN_IDLE_SHADOW_REASON.budget);
    expect(lease.covered).toBe(false);
    expect(lease.group).toBeNull();
    expect(runtime.getIdlePrefetchAvailability().ready).toBe(true);
    runtime.dispose();
  });

  it("yields and observes cancellation while validating a restored-size height grid", async () => {
    const { runtime, source, start, makeTile } = createIdlePrefetchFixture(
      "shadow-validation-yield"
    );
    await start();
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    const candidate = runtime.getIdleShadowRegions()[0];
    const controller = new AbortController();
    const count = 129 * 129;
    source.requestTile.mockImplementationOnce(async (id) => ({
      ...makeTile(id),
      heightMeters: new Float32Array(count).fill(100),
    }));
    createProjectedTerrainTileGeometry.mockImplementationOnce(({ tile }) => {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(count * 3), 3)
      );
      geometry.setAttribute(
        "normal",
        new BufferAttribute(new Float32Array(count * 3), 3)
      );
      geometry.setIndex(new BufferAttribute(tile.indices, 1));
      setTimeout(() => controller.abort(), 0);
      return geometry;
    });
    const lease = await runtime.prepareIdleShadowRegion(
      {
        ...candidate,
        casterBounds: candidate.receiverBounds.clone(),
      },
      controller.signal
    );
    expect(lease.reason).toBe(TERRAIN_IDLE_SHADOW_REASON.aborted);
    expect(lease.covered).toBe(false);
    expect(lease.group).toBeNull();
    expect(runtime.getIdlePrefetchAvailability().ready).toBe(true);
    runtime.dispose();
  });

  it("caps an excessive configured request concurrency per terrain origin", async () => {
    const tileIds = Array.from({ length: 30 }, (_, x) => ({
      level: 10,
      x,
      y: 0,
    }));
    const requestTile = vi.fn(() => new Promise(() => undefined));
    const source = {
      requestTile,
      getTileGridIdsForBounds: vi.fn(() => tileIds),
      getTileBounds: vi.fn(() => ({
        west: 7,
        south: 51,
        east: 7.4,
        north: 51.3,
      })),
      getLevelMaximumGeometricError: vi.fn(() => 0.00001),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(() => 150),
      trimCache: vi.fn(),
      release: vi.fn(),
    };
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const runtime = buildRasterDemTerrainRuntime(
      "bounded-terrain",
      terrainConfig("https://example.test/bounded-terrain"),
      [7.15, 51.256],
      {
        minimumLevel: 10,
        maximumLevel: 10,
        maxSelectionTiles: tileIds.length,
        requestConcurrency: 256,
      }
    );
    const map = {
      getBounds: vi.fn(() => ({
        getWest: () => 7,
        getSouth: () => 51,
        getEast: () => 7.4,
        getNorth: () => 51.3,
      })),
      triggerRepaint: vi.fn(),
    };
    runtime.onAdd?.(map as never);
    await vi.waitFor(() => {
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    });
    const lodCamera = new PerspectiveCamera(60, 1, 1, 10_000);
    lodCamera.position.set(0, 1_000, 0);

    runtime.update({
      map: map as never,
      renderCamera: new Camera(),
      lodCamera,
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new Matrix4(),
        sceneFromLocalRotation: new Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new Matrix4(),
        referenceToCurrent: new Matrix4(),
        currentToReference: new Matrix4(),
      },
    });

    await vi.waitFor(() => expect(requestTile).toHaveBeenCalledTimes(24));
    runtime.dispose();
  });

  it("transfers coverage without copies and publishes fast replacement tiles before slow ones", async () => {
    const ids = [
      { level: 10, x: 532, y: 218 },
      { level: 10, x: 533, y: 218 },
    ];
    const makeTile = (id: (typeof ids)[number]) => ({
      id,
      heightMeters: new Float32Array([100]),
      westIndices: new Uint32Array(),
      southIndices: new Uint32Array(),
      eastIndices: new Uint32Array(),
      northIndices: new Uint32Array(),
    });
    let releaseSlow!: () => void;
    const slow = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    const source = {
      requestTile: vi.fn(async (id) => makeTile(id)),
      getTileGridIdsForBounds: vi.fn(() => ids),
      getTileBounds: vi.fn(() => ({
        west: 7,
        south: 51,
        east: 7.4,
        north: 51.3,
      })),
      getLevelMaximumGeometricError: vi.fn(() => 0.00001),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(() => 150),
      trimCache: vi.fn(),
      release: vi.fn(),
    };
    const replacementSource = {
      ...source,
      requestTile: vi.fn(async (id) => {
        if (id.x === 533) await slow;
        return makeTile(id);
      }),
    };
    acquireRasterDemTerrainTileSource
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(replacementSource);
    const origin: [number, number] = [7.15, 51.256];
    const previous = buildRasterDemTerrainRuntime(
      "previous",
      terrainConfig("/previous"),
      origin,
      { minimumLevel: 10, maximumLevel: 10 }
    );
    const map = {
      getBounds: () => ({
        getWest: () => 7,
        getSouth: () => 51,
        getEast: () => 7.4,
        getNorth: () => 51.3,
      }),
      triggerRepaint: vi.fn(),
    };
    const camera = new PerspectiveCamera(60, 1, 1, 10_000);
    camera.position.set(0, 1_000, 0);
    const frame = {
      map: map as never,
      renderCamera: new Camera(),
      lodCamera: camera,
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new Matrix4(),
        sceneFromLocalRotation: new Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new Matrix4(),
        referenceToCurrent: new Matrix4(),
        currentToReference: new Matrix4(),
      },
    };
    previous.onAdd?.(map as never);
    await vi.waitFor(() =>
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalledTimes(1)
    );
    previous.update(frame);
    await previous.ready;
    await vi.waitFor(() =>
      expect(
        previous.root.children.filter((node) => node.visible)
      ).toHaveLength(2)
    );
    const oldNodes = [...previous.root.children] as Group[];
    const oldGeometry = oldNodes.map(
      (node) => (node.children[0] as Mesh).geometry
    );
    const disposed = oldGeometry.map((geometry) =>
      vi.spyOn(geometry, "dispose")
    );
    const oldAttributes = oldGeometry.map((geometry) => ({
      position: geometry.getAttribute("position"),
      normal: geometry.getAttribute("normal"),
      index: geometry.getIndex(),
    }));
    const replacement = buildRasterDemTerrainRuntime(
      "replacement",
      terrainConfig("/replacement"),
      origin,
      { minimumLevel: 10, maximumLevel: 10 }
    );
    replacement.adoptPresentation(previous);
    previous.dispose();
    expect(replacement.root.children).toEqual(oldNodes);
    expect(oldNodes.every((node) => node.visible)).toBe(true);
    expect(disposed.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    expect(createProjectedTerrainTileGeometry).toHaveBeenCalledTimes(2);
    expect(previous.mapStyleProjectionVersion?.()).toBe(1);
    replacement.onAdd?.(map as never);
    await vi.waitFor(() =>
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalledTimes(2)
    );
    replacement.update(frame);
    const oldFast = oldNodes.find((node) => node.name.endsWith("10/532/218"))!;
    const oldSlow = oldNodes.find((node) => node.name.endsWith("10/533/218"))!;
    await vi.waitFor(() => expect(oldFast.parent).toBeNull());
    expect(oldSlow.parent).toBe(replacement.root);
    expect(oldSlow.visible).toBe(true);
    const slowIndex = oldNodes.indexOf(oldSlow);
    const slowGeometry = (oldSlow.children[0] as Mesh).geometry;
    expect(slowGeometry.getAttribute("position")).toBe(
      oldAttributes[slowIndex].position
    );
    expect(slowGeometry.getAttribute("normal")).toBe(
      oldAttributes[slowIndex].normal
    );
    expect(slowGeometry.getIndex()).toBe(oldAttributes[slowIndex].index);
    expect(
      replacement.root.children.filter((node) => node.visible)
    ).toHaveLength(2);
    expect(createProjectedTerrainTileGeometry).toHaveBeenCalledTimes(3);
    releaseSlow();
    await vi.waitFor(() => expect(oldSlow.parent).toBeNull());
    expect(
      replacement.root.children.filter((node) => node.visible)
    ).toHaveLength(2);
    expect(disposed.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    replacement.dispose();
  });

  it("interpolates coarse neighbor normals", async () => {
    const coarseId = { level: 10, x: 532, y: 218 };
    const fineParentId = { level: 10, x: 533, y: 218 };
    const fineId = { level: 11, x: 1066, y: 436 };
    const isFineTile = (id: TerrainTileId) =>
      id.level === fineId.level && id.x === fineId.x && id.y === fineId.y;
    createProjectedTerrainTileGeometry.mockImplementation(({ tile }) => {
      const id = tile.id as TerrainTileId;
      const fine = isFineTile(id);
      const width = id.level === 10 ? 1 : 0.5;
      const west = id.level === 10 ? id.x - 532 : 1 + (id.x - 1066) * width;
      const north = id.level === 10 ? 0 : -(id.y - 436);
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new Float32BufferAttribute(
          fine
            ? [
                west,
                2,
                north,
                west,
                2,
                north - 0.5,
                west,
                2,
                north - 1,
                west + width,
                1,
                north,
                west + width,
                1,
                north - 0.5,
                west + width,
                1,
                north - 1,
              ]
            : [
                west,
                0,
                north,
                west,
                0,
                north - (id.level === 10 ? 2 : 1),
                west + width,
                0,
                north,
                west + width,
                0,
                north - (id.level === 10 ? 2 : 1),
              ],
          3
        )
      );
      geometry.setIndex(
        fine ? [0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5] : [0, 2, 1, 1, 2, 3]
      );
      geometry.computeVertexNormals();
      if (fine) {
        const normal = geometry.getAttribute("normal");
        fineBoundaryNormalBeforeSmoothing = new Vector3(
          normal.getX(1),
          normal.getY(1),
          normal.getZ(1)
        );
      }
      return geometry;
    });
    const source = {
      requestTile: vi.fn(async (id) => ({
        id,
        heightMeters: isFineTile(id)
          ? new Float32Array([456])
          : new Float32Array([100]),
        westIndices: isFineTile(id)
          ? new Uint32Array([0, 1, 2])
          : new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices:
          id.level === coarseId.level && id.x === coarseId.x
            ? new Uint32Array([2, 3])
            : new Uint32Array(),
        northIndices: new Uint32Array(),
      })),
      getTileGridIdsForBounds: vi.fn(() => [coarseId, fineParentId]),
      getTileBounds: vi.fn((id: TerrainTileId) => {
        const scale = 2 ** (id.level - 10);
        const west = 7 + (id.x / scale - 532) * 0.2;
        const north = 51.3 - (id.y / scale - 218) * 0.3;
        return {
          west,
          east: west + 0.2 / scale,
          south: north - 0.3 / scale,
          north,
        };
      }),
      getLevelMaximumGeometricError: vi.fn((level) =>
        level === 10 ? 0.01 : 0.00001
      ),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(() => 150),
      trimCache: vi.fn(),
      release: vi.fn(),
    };
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const runtime = buildRasterDemTerrainRuntime(
      "mixed-lod-terrain",
      terrainConfig("https://example.test/mixed-lod-terrain"),
      [7.3, 51.25],
      { minimumLevel: 10, maximumLevel: 11 }
    );
    const map = {
      getBounds: vi.fn(() => ({
        getWest: () => 7,
        getSouth: () => 51,
        getEast: () => 7.4,
        getNorth: () => 51.3,
      })),
      triggerRepaint: vi.fn(),
    };
    runtime.onAdd?.(map as never);
    await vi.waitFor(() => {
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    });
    const lodCamera = new PerspectiveCamera(60, 1, 1, 10_000);
    lodCamera.position.set(0, 1_000, 0);
    runtime.update({
      map: map as never,
      renderCamera: new Camera(),
      lodCamera,
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new Matrix4(),
        sceneFromLocalRotation: new Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new Matrix4(),
        referenceToCurrent: new Matrix4(),
        currentToReference: new Matrix4(),
      },
    });

    await expect(runtime.ready).resolves.toBe(true);
    await vi.waitFor(() =>
      expect(
        runtime.root.children.some((child) =>
          child.name.endsWith("11/1066/436")
        )
      ).toBe(true)
    );
    const fineMesh = (
      runtime.root.children.find((child) =>
        child.name.endsWith("11/1066/436")
      ) as Group
    ).children[0] as Mesh;
    // ready means first visible terrain, not completion of the asynchronous
    // worker seam pass. Wait for the final geometry to be published.
    await vi.waitFor(() =>
      expect(fineMesh.geometry.getAttribute("position").getY(0)).toBe(0)
    );
    const smoothedNormal = fineMesh.geometry.getAttribute("normal");
    const stitchedPosition = fineMesh.geometry.getAttribute("position");

    expect(fineBoundaryNormalBeforeSmoothing).not.toBeNull();
    expect(stitchedPosition.getY(0)).toBe(0);
    expect(stitchedPosition.getY(1)).toBe(0);
    expect(stitchedPosition.getY(2)).toBe(0);
    expect(smoothedNormal.getY(1)).toBeGreaterThan(
      fineBoundaryNormalBeforeSmoothing!.y + 0.1
    );
    expect(fineMesh.parent!.visible).toBe(true);
    const visible = runtime.root.children.filter((child) => child.visible);
    expect(visible).toHaveLength(5);
    expect(visible.some((child) => child.name.endsWith("10/532/218"))).toBe(
      true
    );
    for (const x of [1066, 1067])
      for (const y of [436, 437])
        expect(
          visible.some((child) => child.name.endsWith(`11/${x}/${y}`))
        ).toBe(true);

    runtime.dispose();
  });

  it("adds a shadeable terrain mesh in the shared local-meter frame", async () => {
    const tileId = { level: 10, x: 532, y: 218 };
    const sunTileId = { level: 10, x: 533, y: 218 };
    const source = {
      requestTile: vi.fn(async (id) => ({
        id,
        heightMeters: new Float32Array([100]),
        westIndices:
          id.x === sunTileId.x ? new Uint32Array([0, 1]) : new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices:
          id.x === tileId.x ? new Uint32Array([2, 3]) : new Uint32Array(),
        northIndices: new Uint32Array(),
      })),
      getTileGridIdsForBounds: vi.fn((bounds) =>
        bounds.east > 7.25 ? [tileId, sunTileId] : [tileId]
      ),
      getTileBounds: vi.fn((id) =>
        id.x === sunTileId.x
          ? { west: 7.4, south: 51, east: 7.5, north: 51.3 }
          : { west: 7, south: 51, east: 7.2, north: 51.3 }
      ),
      getLevelMaximumGeometricError: vi.fn(() => 0.01),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(() => 150),
      trimCache: vi.fn(),
      release: vi.fn(),
    };
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const onContentChanged = vi.fn();
    const runtime = buildRasterDemTerrainRuntime(
      "terrain",
      terrainConfig("https://example.test/terrain"),
      [7.15, 51.256],
      {
        minimumLevel: 10,
        maximumLevel: 10,
        shadowLevelOffset: 0,
        onContentChanged,
        receivesMapStyleTexture: true,
        boundsPaddingMeters: [5_000, 0, 0],
      }
    );
    const map = {
      getBounds: vi.fn(() => ({
        getWest: () => 7,
        getSouth: () => 51,
        getEast: () => 7.2,
        getNorth: () => 51.3,
      })),
      triggerRepaint: vi.fn(),
    };
    runtime.onAdd?.(map as never);
    await vi.waitFor(() => {
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    });
    const lodCamera = new PerspectiveCamera(60, 1, 1, 10_000);
    lodCamera.position.set(0, 1_000, 0);
    runtime.update({
      map: map as never,
      renderCamera: new Camera(),
      lodCamera,
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new Matrix4(),
        sceneFromLocalRotation: new Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new Matrix4(),
        referenceToCurrent: new Matrix4(),
        currentToReference: new Matrix4(),
      },
    });

    await expect(runtime.ready).resolves.toBe(true);
    expect(runtime.root.children).toHaveLength(1);
    expect(
      runtime.root.children.some((child) =>
        child.name.endsWith("-viewport-coverage")
      )
    ).toBe(false);
    const tileNode = runtime.root.children.find((child) =>
      child.name.includes("source:")
    ) as Group;
    expect(tileNode.children).toHaveLength(1);
    const mesh = tileNode.children[0] as Mesh & {
      castShadow: boolean;
      receiveShadow: boolean;
      material: { side: number; shadowSide: number | null };
      customDepthMaterial?: unknown;
      geometry: { getAttribute: (name: string) => { count: number } };
    };
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    expect(mesh.material).toBeInstanceOf(MeshLambertMaterial);
    expect(mesh.material.side).toBe(FrontSide);
    expect(mesh.material.shadowSide).toBe(FrontSide);
    // Standard depth pass: acne control lives in the light's texel-scaled
    // normal bias, not in a per-mesh depth material.
    expect(mesh.customDepthMaterial).toBeUndefined();
    expect(mesh.geometry.getAttribute("position").count).toBe(4);
    expect(source.requestTile.mock.calls.map(([id]) => id)).toContainEqual(
      tileId
    );
    expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(notifySharedThreeTerrainChanged).toHaveBeenCalledWith(map)
    );
    expect(onContentChanged).not.toHaveBeenCalled();
    const frame = {
      map: map as never,
      renderCamera: new Camera(),
      lodCamera,
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new Matrix4(),
        sceneFromLocalRotation: new Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new Matrix4(),
        referenceToCurrent: new Matrix4(),
        currentToReference: new Matrix4(),
      },
    };
    runtime.update(frame);
    runtime.update(frame);
    expect(onContentChanged).toHaveBeenCalledOnce();
    const debugVolumes = runtime.getActiveTileVolumes();
    expect(debugVolumes).toHaveLength(1);
    expect(debugVolumes[0]).toMatchObject({
      id: "terrain:source:10/532/218",
      kind: "terrain-tile",
    });
    expect(debugVolumes[0]?.minimum.every(Number.isFinite)).toBe(true);
    expect(debugVolumes[0]?.maximum.every(Number.isFinite)).toBe(true);
    expect(debugVolumes[0]?.minimum[1]).toBeGreaterThan(99);
    expect(debugVolumes[0]?.maximum[1]).toBeLessThan(101);
    const publishedBounds = onContentChanged.mock.calls[0][0];
    expect(publishedBounds).toHaveLength(1);
    expect(publishedBounds[0].min.toArray()).toEqual(debugVolumes[0].minimum);
    expect(publishedBounds[0].max.toArray()).toEqual(debugVolumes[0].maximum);

    const receiverCamera = new OrthographicCamera(
      -20_000,
      20_000,
      20_000,
      -20_000,
      1,
      50_000
    );
    receiverCamera.position.set(0, 20_000, 0);
    receiverCamera.lookAt(0, 0, 0);
    receiverCamera.updateMatrixWorld(true);
    runtime.update({ ...frame, renderCamera: receiverCamera });
    const receiverMaterial = mesh.material as MeshLambertMaterial;
    expect(mesh.receiveShadow).toBe(true);
    const receivesStyle = runtime.receivesMapStyleTexture;
    expect(
      typeof receivesStyle === "function" && receivesStyle(receiverMaterial)
    ).toBe(true);
    expect(runtime.getActiveTileVolumes()[0].loadReason).toBe("viewport");

    const offscreenCamera = receiverCamera.clone();
    offscreenCamera.position.x += 4_000;
    offscreenCamera.updateMatrixWorld(true);
    runtime.update({ ...frame, renderCamera: offscreenCamera });
    expect(mesh.receiveShadow).toBe(true);
    expect(mesh.material).toBe(receiverMaterial);
    expect(runtime.getActiveTileVolumes()[0].loadReason).toBe("viewport");

    offscreenCamera.position.x += 200_000;
    offscreenCamera.updateMatrixWorld(true);
    runtime.update({ ...frame, renderCamera: offscreenCamera });
    expect(mesh.receiveShadow).toBe(false);
    expect(mesh.castShadow).toBe(true);
    expect(tileNode.visible).toBe(true);
    expect(mesh.material).not.toBe(receiverMaterial);
    expect(
      typeof receivesStyle === "function" && receivesStyle(mesh.material)
    ).toBe(false);
    expect(mesh.material).toMatchObject({
      colorWrite: false,
      depthWrite: false,
      isMeshBasicMaterial: true,
    });
    expect(runtime.getActiveTileVolumes()[0].loadReason).toBe("shadow");

    const copyFramebufferToTexture = vi.fn();
    const projection = createSharedThreeMapStyleProjection(
      "terrain-style",
      new Map([[runtime.id, runtime]]),
      frame.viewport
    );
    projection.attach(
      { ...map, on: vi.fn(), off: vi.fn() } as never,
      { copyFramebufferToTexture } as never
    );
    const clipMatrix = new Matrix4();
    projection.capture(clipMatrix, false);
    expect(projection.getState(0).enabled).toBe(false);
    expect(copyFramebufferToTexture).not.toHaveBeenCalled();

    // A sliver of the bounds is enough: neither the tile center nor its old
    // asynchronous selection reason may keep a visible tile caster-only.
    const edgeCamera = receiverCamera.clone();
    edgeCamera.position.x = publishedBounds[0].max.x + edgeCamera.right - 1;
    edgeCamera.updateMatrixWorld(true);
    clipMatrix.multiplyMatrices(
      edgeCamera.projectionMatrix,
      edgeCamera.matrixWorldInverse
    );
    const edgeFrustum = new Frustum().setFromProjectionMatrix(clipMatrix);
    expect(edgeFrustum.intersectsBox(publishedBounds[0])).toBe(true);
    expect(
      edgeFrustum.containsPoint(publishedBounds[0].getCenter(new Vector3()))
    ).toBe(false);
    const casterVersion = runtime.mapStyleProjectionVersion?.();
    runtime.update({ ...frame, renderCamera: edgeCamera });
    expect(mesh.receiveShadow).toBe(true);
    expect(mesh.material).toBe(receiverMaterial);
    expect(runtime.mapStyleProjectionVersion?.()).toBeGreaterThan(
      casterVersion!
    );
    expect(runtime.getActiveTileVolumes()[0].loadReason).toBe("viewport");
    projection.capture(clipMatrix, false);
    expect(projection.getState(1).enabled).toBe(true);
    expect(copyFramebufferToTexture).toHaveBeenCalledOnce();
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <project_vertex>",
      fragmentShader: "#include <common>\n#include <map_fragment>",
    };
    receiverMaterial.onBeforeCompile(shader as never, {} as never);
    expect(shader.uniforms).toMatchObject({
      carmaMapStyleTexture: {
        value: copyFramebufferToTexture.mock.calls[0][0],
      },
      carmaMapStyleEnabled: { value: 1 },
    });
    projection.dispose();

    runtime.update({ ...frame, renderCamera: receiverCamera });
    expect(mesh.receiveShadow).toBe(true);
    expect(mesh.material).toBe(receiverMaterial);

    const shadowCamera = new OrthographicCamera(
      -1_000,
      1_000,
      1_000,
      -1_000,
      1,
      40_000
    );
    shadowCamera.position.set(20_000, 1_000, 0);
    // The eastern tile must lie sunward of the visible receiver, not merely
    // inside a disconnected, vertically illuminated shadow-camera frustum.
    shadowCamera.lookAt(0, 0, 0);
    shadowCamera.updateProjectionMatrix();
    shadowCamera.updateMatrixWorld(true);
    runtime.setShadowView({
      camera: shadowCamera,
      shadowMapSize: { width: 1_000, height: 1_000 },
    });
    runtime.update({
      map: map as never,
      renderCamera: new Camera(),
      lodCamera,
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new Matrix4(),
        sceneFromLocalRotation: new Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new Matrix4(),
        referenceToCurrent: new Matrix4(),
        currentToReference: new Matrix4(),
      },
    });
    await vi.waitFor(() => {
      expect(source.requestTile.mock.calls.map(([id]) => id)).toContainEqual(
        sunTileId
      );
      expect(runtime.root.children).toHaveLength(2);
    });
    runtime.update(frame);
    expect(onContentChanged).toHaveBeenCalledTimes(2);
    const nextPublishedBounds = onContentChanged.mock.calls[1][0];
    expect(nextPublishedBounds.length).toBeGreaterThan(0);
    expect(nextPublishedBounds.every((bounds: Box3) => !bounds.isEmpty())).toBe(
      true
    );
    const viewportNormal = (
      (
        runtime.root.children.find((child) =>
          child.name.endsWith("10/532/218")
        ) as Group
      ).children[0] as Mesh
    ).geometry.getAttribute("normal");
    const occluderNormal = (
      (
        runtime.root.children.find((child) =>
          child.name.endsWith("10/533/218")
        ) as Group
      ).children[0] as Mesh
    ).geometry.getAttribute("normal");
    expect(viewportNormal.getX(2)).toBeCloseTo(occluderNormal.getX(0));
    expect(viewportNormal.getY(2)).toBeCloseTo(occluderNormal.getY(0));

    runtime.dispose();
    expect(runtime.root.children).toHaveLength(0);
  });

  it("loads the viewport on the first update without an interaction gate", async () => {
    const tileId = { level: 10, x: 532, y: 218 };
    const source = {
      requestTile: vi.fn(async (id) => ({
        id,
        heightMeters: new Float32Array([100]),
        westIndices: new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices: new Uint32Array(),
        northIndices: new Uint32Array(),
      })),
      getTileGridIdsForBounds: vi.fn(() => [tileId]),
      getTileBounds: vi.fn(() => ({
        west: 7,
        south: 51,
        east: 7.2,
        north: 51.3,
      })),
      getLevelMaximumGeometricError: vi.fn(() => 0.01),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(() => 150),
      trimCache: vi.fn(),
      release: vi.fn(),
    };
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const runtime = buildRasterDemTerrainRuntime(
      "initial-viewport-terrain",
      terrainConfig("https://example.test/initial-viewport-terrain"),
      [7.15, 51.256],
      { minimumLevel: 10, maximumLevel: 10 }
    );
    const map = {
      getBounds: vi.fn(() => ({
        getWest: () => 7,
        getSouth: () => 51,
        getEast: () => 7.2,
        getNorth: () => 51.3,
      })),
      triggerRepaint: vi.fn(),
    };
    runtime.onAdd?.(map as never);
    expect(setSharedThreeTerrainLoading).toHaveBeenCalledWith(
      map,
      "initial-viewport-terrain",
      true
    );
    await vi.waitFor(() => {
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    });

    runtime.update({
      map: map as never,
      renderCamera: new Camera(),
      lodCamera: new PerspectiveCamera(60, 1, 1, 10_000),
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new Matrix4(),
        sceneFromLocalRotation: new Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new Matrix4(),
        referenceToCurrent: new Matrix4(),
        currentToReference: new Matrix4(),
      },
    });

    await expect(runtime.ready).resolves.toBe(true);
    expect(source.requestTile.mock.calls.map(([id]) => id)).toContainEqual(
      tileId
    );
    await vi.waitFor(() =>
      expect(setSharedThreeTerrainLoading).toHaveBeenLastCalledWith(
        map,
        "initial-viewport-terrain",
        false,
        0
      )
    );
    expect(setSharedThreeTerrainLoading).toHaveBeenCalledWith(
      map,
      "initial-viewport-terrain",
      true,
      0.5
    );
    runtime.dispose();
  });

  it("uses orthographic shadow resolution to refine offscreen occluders", async () => {
    const parentId = { level: 10, x: 532, y: 218 };
    const source = {
      requestTile: vi.fn(async (id) => ({
        id,
        heightMeters: new Float32Array([100]),
        westIndices: new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices: new Uint32Array(),
        northIndices: new Uint32Array(),
      })),
      getTileGridIdsForBounds: vi.fn(() => [parentId]),
      getTileBounds: vi.fn((id) => {
        if (id.level === parentId.level) {
          return { west: 7.4, south: 51.24, east: 7.46, north: 51.27 };
        }
        const west = id.x % 2 === 0 ? 7.4 : 7.43;
        const north = id.y % 2 === 0 ? 51.27 : 51.255;
        return { west, south: north - 0.015, east: west + 0.03, north };
      }),
      getLevelMaximumGeometricError: vi.fn(() => 100),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(),
      trimCache: vi.fn(),
      release: vi.fn(),
    };
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const originLngLat: [number, number] = [7.15, 51.256];
    const runtime = buildRasterDemTerrainRuntime(
      "orthographic-shadow-terrain",
      terrainConfig("https://example.test/orthographic-shadow-terrain"),
      originLngLat,
      {
        minimumLevel: 10,
        maximumLevel: 11,
        errorTargetPixels: 2.5,
        shadowLevelOffset: 2,
      }
    );
    const map = {
      getBounds: vi.fn(() => ({
        getWest: () => 7.1,
        getSouth: () => 51.24,
        getEast: () => 7.2,
        getNorth: () => 51.27,
      })),
      triggerRepaint: vi.fn(),
    };
    runtime.onAdd?.(map as never);
    await vi.waitFor(() => {
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    });
    const origin = MercatorCoordinate.fromLngLat(originLngLat, 0);
    const coordinate = MercatorCoordinate.fromLngLat(
      [7.43, originLngLat[1]],
      0
    );
    const meterScale = origin.meterInMercatorCoordinateUnits();
    const x = (coordinate.x - origin.x) / meterScale;
    const z = (coordinate.y - origin.y) / meterScale;
    const shadowCamera = new OrthographicCamera(-500, 500, 500, -500, 1, 5_000);
    shadowCamera.position.set(x, 1_000, z);
    shadowCamera.lookAt(x, 0, z);
    shadowCamera.updateProjectionMatrix();
    shadowCamera.updateMatrixWorld(true);
    runtime.setShadowView({
      camera: shadowCamera,
      shadowMapSize: { width: 1_000, height: 1_000 },
    });
    const lodCamera = new PerspectiveCamera(60, 1, 1, 100_000);
    lodCamera.position.set(0, 1_000, 0);
    runtime.update({
      map: map as never,
      renderCamera: new Camera(),
      lodCamera,
      lookTarget: new Vector3(),
      // Deliberately unrelated to the 1,000 px shadow map: terrain shadow LOD
      // must follow the raster it is rendered into, not the browser viewport.
      viewport: new Vector2(1, 1),
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new Matrix4(),
        sceneFromLocalRotation: new Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new Matrix4(),
        referenceToCurrent: new Matrix4(),
        currentToReference: new Matrix4(),
      },
    });

    await expect(runtime.ready).resolves.toBe(true);
    expect(source.requestTile.mock.calls.some(([id]) => id.level === 11)).toBe(
      true
    );
    expect(source.requestTile.mock.calls.map(([id]) => id)).not.toContainEqual(
      parentId
    );
    runtime.dispose();
  });

  it.each([
    { sourceMaxzoom: 18, maximumLevel: 14, finalLevel: 14 },
    {
      sourceMaxzoom: NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN.maxzoom,
      maximumLevel: undefined,
      finalLevel: 16,
    },
    { sourceMaxzoom: 15, maximumLevel: undefined, finalLevel: 15 },
    { sourceMaxzoom: 16, maximumLevel: 20, finalLevel: 16 },
  ])(
    "publishes complete coarse coverage before each refinement up to $finalLevel (source $sourceMaxzoom, limit $maximumLevel)",
    async ({ sourceMaxzoom, maximumLevel, finalLevel }) => {
      const visibleIds = () =>
        runtime.root.children
          .filter((child) => child.visible)
          .map((child) => child.name.match(/source:(\d+)\/(\d+)\/(\d+)$/)!)
          .map((match) => ({
            level: Number(match[1]),
            x: Number(match[2]),
            y: Number(match[3]),
          }));
      const expectCompleteCut = () => {
        const ids = visibleIds();
        // A disjoint dyadic cut has exactly one root's area, at every stage.
        expect(ids.reduce((area, id) => area + 4 ** (10 - id.level), 0)).toBe(
          1
        );
        for (const id of ids)
          expect(
            ids.some(
              (other) =>
                other !== id &&
                other.level <= id.level &&
                Math.floor(id.x / 2 ** (id.level - other.level)) === other.x &&
                Math.floor(id.y / 2 ** (id.level - other.level)) === other.y
            )
          ).toBe(false);
      };
      const source = {
        requestTile: vi.fn(async (id: TerrainTileId) => {
          if (id.level > 11) {
            expectCompleteCut();
            expect(
              visibleIds().some(
                (ancestor) =>
                  ancestor.level < id.level &&
                  Math.floor(id.x / 2 ** (id.level - ancestor.level)) ===
                    ancestor.x &&
                  Math.floor(id.y / 2 ** (id.level - ancestor.level)) ===
                    ancestor.y
              )
            ).toBe(true);
          }
          return {
            id,
            heightMeters: new Float32Array([100]),
            westIndices: new Uint32Array(),
            southIndices: new Uint32Array(),
            eastIndices: new Uint32Array(),
            northIndices: new Uint32Array(),
          };
        }),
        getTileGridIdsForBounds: vi.fn(() => [{ level: 10, x: 0, y: 0 }]),
        getTileBounds: vi.fn((id: TerrainTileId) => {
          const width = 0.2 / 2 ** (id.level - 10);
          const west = 7.1 + id.x * width;
          const north = 51.35 - id.y * width;
          return { west, east: west + width, south: north - width, north };
        }),
        getLevelMaximumGeometricError: vi.fn(
          (level) => 0.1 / 2 ** (level - 10)
        ),
        getTileDataAvailable: vi.fn(() => true),
        sampleHeight: vi.fn(),
        trimCache: vi.fn(),
        release: vi.fn(),
      };
      acquireRasterDemTerrainTileSource.mockResolvedValue(source);
      const runtime = buildRasterDemTerrainRuntime(
        "skip-ancestors",
        {
          ...terrainConfig("https://example.test/skip-ancestors"),
          maxzoom: sourceMaxzoom,
        },
        [7.101, 51.349],
        { minimumLevel: 10, maximumLevel, errorTargetPixels: 0.5 }
      );
      const map = {
        getBounds: () => ({
          getWest: () => 7.1005,
          getSouth: () => 51.3485,
          getEast: () => 7.1015,
          getNorth: () => 51.3495,
        }),
        triggerRepaint: vi.fn(),
      };
      runtime.onAdd?.(map as never);
      await vi.waitFor(() =>
        expect(registerSharedThreeTerrainSampler).toHaveBeenCalled()
      );
      const lodCamera = new PerspectiveCamera(60, 1, 1, 100_000);
      lodCamera.position.set(0, 1000, 0);
      runtime.update({
        map: map as never,
        renderCamera: new Camera(),
        lodCamera,
        lookTarget: new Vector3(),
        viewport: new Vector2(1000, 1000),
        localFrame: {
          lngLat: [7.15, 51.25] as const,
          revision: 1,
          sceneFromLocal: new Matrix4(),
          sceneFromLocalRotation: new Matrix4(),
          referenceLngLat: [7.15, 51.25] as const,
          sceneFromLocalReference: new Matrix4(),
          referenceToCurrent: new Matrix4(),
          currentToReference: new Matrix4(),
        },
      });
      await runtime.ready;
      await vi.waitFor(() => expect(source.trimCache).toHaveBeenCalled());
      const requestedIds = source.requestTile.mock.calls.map(([id]) => id);
      // The bounded first-coverage stage may start with at most four tiles;
      // once published, every deeper stage must retain full root coverage.
      expect(Math.min(...requestedIds.map(({ level }) => level))).toBe(11);
      expectCompleteCut();
      const expectedFinalCut = [{ level: finalLevel, x: 0, y: 0 }];
      for (let level = 11; level <= finalLevel; level += 1) {
        // Only the focus branch refines. Its three support siblings remain at
        // each level, even when a useful preview skips the branch's parent LOD.
        expectedFinalCut.push(
          { level, x: 1, y: 0 },
          { level, x: 0, y: 1 },
          { level, x: 1, y: 1 }
        );
      }
      const idKey = ({ level, x, y }: TerrainTileId) => `${level}/${x}/${y}`;
      expect(visibleIds().map(idKey).sort()).toEqual(
        expectedFinalCut.map(idKey).sort()
      );
      expect(new Set(requestedIds.map(idKey)).size).toBe(requestedIds.length);
      expect(Math.max(...requestedIds.map(({ level }) => level))).toBe(
        finalLevel
      );
      expect(Math.max(...visibleIds().map(({ level }) => level))).toBe(
        finalLevel
      );
      runtime.dispose();
    }
  );

  it.each([true, false])(
    "publishes a parent only within 16 px, retains detail on pan (within target: %s)",
    async (withinInitialTarget) => {
      const parentId = { level: 10, x: 532, y: 218 };
      let resolveNeighbor = () => undefined;
      const neighborReady = new Promise<void>((resolve) => {
        resolveNeighbor = resolve;
      });
      let resolveChildren = () => undefined;
      const childrenReady = new Promise<void>((resolve) => {
        resolveChildren = resolve;
      });
      const createTile = (id: typeof parentId) => ({
        id,
        bounds: { west: 7, south: 51, east: 7.4, north: 51.4 },
        heightMeters: new Float32Array([100]),
        westIndices: new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices: new Uint32Array(),
        northIndices: new Uint32Array(),
      });
      const source = {
        requestTile: vi.fn(async (id: typeof parentId) => {
          if (id.level > parentId.level) await childrenReady;
          if (id.level > parentId.level && id.x >= 1066) await neighborReady;
          return createTile(id);
        }),
        getTileGridIdsForBounds: vi.fn(() => [parentId]),
        getTileBounds: vi.fn((id: typeof parentId) => {
          if (id.level === parentId.level) {
            return { west: 7, south: 51, east: 7.4, north: 51.4 };
          }
          const west = id.x % 2 === 0 ? 7 : 7.2;
          const north = id.y % 2 === 0 ? 51.4 : 51.2;
          return { west, south: north - 0.2, east: west + 0.2, north };
        }),
        getLevelMaximumGeometricError: vi.fn(() =>
          withinInitialTarget ? 1 : 1_000_000
        ),
        getTileDataAvailable: vi.fn(() => true),
        sampleHeight: vi.fn(),
        trimCache: vi.fn(),
        release: vi.fn(),
      };
      acquireRasterDemTerrainTileSource.mockResolvedValue(source);
      const runtime = buildRasterDemTerrainRuntime(
        "progressive-terrain",
        terrainConfig("https://example.test/progressive-terrain"),
        [7.2, 51.2],
        {
          minimumLevel: 10,
          maximumLevel: 11,
          errorTargetPixels: 0.001,
          heightRangeMeters: [0, 200],
        }
      );
      const map = {
        getBounds: vi.fn(() => ({
          getWest: () => 7,
          getSouth: () => 51,
          getEast: () => 7.4,
          getNorth: () => 51.4,
        })),
        triggerRepaint: vi.fn(),
      };
      runtime.onAdd?.(map as never);
      await vi.waitFor(() => {
        expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
      });
      const lodCamera = new PerspectiveCamera(60, 1, 1, 100_000);
      lodCamera.position.set(0, 1_000, 0);
      runtime.update({
        map: map as never,
        renderCamera: new Camera(),
        lodCamera,
        lookTarget: new Vector3(),
        viewport: new Vector2(1_000, 1_000),
        localFrame: {
          lngLat: [7.15, 51.25] as const,
          revision: 1,
          sceneFromLocal: new Matrix4(),
          sceneFromLocalRotation: new Matrix4(),
          referenceLngLat: [7.15, 51.25] as const,
          sceneFromLocalReference: new Matrix4(),
          referenceToCurrent: new Matrix4(),
          currentToReference: new Matrix4(),
        },
      });

      if (withinInitialTarget) await expect(runtime.ready).resolves.toBe(true);
      else
        await vi.waitFor(() => expect(source.requestTile).toHaveBeenCalled());
      const parentNode = runtime.root.children.find((child) =>
        child.name.includes("source:10/532/218")
      );
      if (withinInitialTarget) expect(parentNode?.visible).toBe(true);
      else
        expect(
          source.requestTile.mock.calls.map(([id]) => id)
        ).not.toContainEqual(parentId);

      resolveChildren();
      await expect(runtime.ready).resolves.toBe(true);
      await vi.waitFor(() => {
        expect(parentNode?.visible ?? false).toBe(false);
        expect(
          runtime.root.children.filter(
            (child) => child.visible && child.name.includes("source:11/")
          )
        ).toHaveLength(4);
      });

      // A pan adds another root whose children are still loading. The cached
      // coarse stage must not replace the already displayed detailed children.
      source.getTileGridIdsForBounds.mockReturnValue([
        parentId,
        { level: 10, x: 533, y: 218 },
      ]);
      lodCamera.position.x += 100;
      runtime.update({
        map: map as never,
        renderCamera: new Camera(),
        lodCamera,
        lookTarget: new Vector3(),
        viewport: new Vector2(1_000, 1_000),
        localFrame: {
          lngLat: [7.15, 51.25] as const,
          revision: 1,
          sceneFromLocal: new Matrix4(),
          sceneFromLocalRotation: new Matrix4(),
          referenceLngLat: [7.15, 51.25] as const,
          sceneFromLocalReference: new Matrix4(),
          referenceToCurrent: new Matrix4(),
          currentToReference: new Matrix4(),
        },
      });
      await vi.waitFor(() => {
        expect(
          source.requestTile.mock.calls.some(
            ([id]) => id.level === 11 && id.x >= 1066
          )
        ).toBe(true);
      });
      expect(parentNode?.visible ?? false).toBe(false);
      expect(
        runtime.root.children.filter(
          (child) => child.visible && child.name.includes("source:11/")
        )
      ).toHaveLength(4);
      if (withinInitialTarget) {
        // New pan coverage is published while its fine children are delayed;
        // the already visible fine neighbor must not regress to its parent.
        expect(
          runtime.root.children.find((child) =>
            child.name.includes("source:10/533/218")
          )?.visible
        ).toBe(true);
      }
      resolveNeighbor();
      await vi.waitFor(() => {
        expect(
          runtime.root.children.filter(
            (child) => child.visible && child.name.includes("source:11/")
          )
        ).toHaveLength(8);
      });

      runtime.dispose();
    }
  );

  it("publishes an independent viewport root without waiting for its neighbor", async () => {
    const westId = { level: 10, x: 532, y: 218 };
    const eastId = { level: 10, x: 533, y: 218 };
    let resolveEast = () => undefined;
    const eastReady = new Promise<void>((resolve) => {
      resolveEast = resolve;
    });
    const source = {
      requestTile: vi.fn(async (id: typeof westId) => {
        if (id.x === eastId.x) await eastReady;
        return {
          id,
          heightMeters: new Float32Array([100]),
          westIndices: new Uint32Array(),
          southIndices: new Uint32Array(),
          eastIndices: new Uint32Array(),
          northIndices: new Uint32Array(),
        };
      }),
      getTileGridIdsForBounds: vi.fn(() => [westId, eastId]),
      getTileBounds: vi.fn((id: typeof westId) => ({
        west: id.x === westId.x ? 7 : 7.2,
        south: 51,
        east: id.x === westId.x ? 7.2 : 7.4,
        north: 51.4,
      })),
      getLevelMaximumGeometricError: vi.fn(() => 0.01),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(),
      trimCache: vi.fn(),
      release: vi.fn(),
    };
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const runtime = buildRasterDemTerrainRuntime(
      "partial-root-terrain",
      terrainConfig("https://example.test/partial-root-terrain"),
      [7.2, 51.2],
      { minimumLevel: 10, maximumLevel: 10 }
    );
    const map = {
      getBounds: vi.fn(() => ({
        getWest: () => 7,
        getSouth: () => 51,
        getEast: () => 7.4,
        getNorth: () => 51.4,
      })),
      triggerRepaint: vi.fn(),
    };
    runtime.onAdd?.(map as never);
    await vi.waitFor(() => {
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    });
    const lodCamera = new PerspectiveCamera(60, 1, 1, 100_000);
    lodCamera.position.set(0, 1_000, 0);
    runtime.update({
      map: map as never,
      renderCamera: new Camera(),
      lodCamera,
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new Matrix4(),
        sceneFromLocalRotation: new Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new Matrix4(),
        referenceToCurrent: new Matrix4(),
        currentToReference: new Matrix4(),
      },
    });

    await expect(runtime.ready).resolves.toBe(true);
    expect(
      runtime.root.children.find((child) =>
        child.name.includes("source:10/532/218")
      )?.visible
    ).toBe(true);
    expect(
      runtime.root.children.find((child) =>
        child.name.includes("source:10/533/218")
      )
    ).toBeUndefined();

    resolveEast();
    await vi.waitFor(() => {
      expect(
        runtime.root.children.find((child) =>
          child.name.includes("source:10/533/218")
        )?.visible
      ).toBe(true);
    });
    runtime.dispose();
  });

  it("leaves unavailable and no-data terrain transparent", async () => {
    const zeroSourceId = { level: 10, x: 531, y: 218 };
    const sourceId = { level: 10, x: 532, y: 218 };
    const flatId = { level: 10, x: 533, y: 218 };
    const source = {
      requestTile: vi.fn(async (id) => ({
        id,
        bounds:
          id.x === zeroSourceId.x
            ? { west: 6.8, south: 51, east: 7, north: 51.3 }
            : { west: 7, south: 51, east: 7.2, north: 51.3 },
        u: new Float32Array([0, 0, 1, 1]),
        v: new Float32Array([0, 1, 0, 1]),
        heightMeters:
          id.x === zeroSourceId.x
            ? new Float32Array([0, 0, 0, 0])
            : new Float32Array([123, 123, 123, 0]),
        indices: new Uint32Array([0, 2, 1, 1, 2, 3]),
        westIndices: new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices:
          id.x === sourceId.x ? new Uint32Array([2, 3]) : new Uint32Array(),
        northIndices: new Uint32Array(),
      })),
      getTileGridIdsForBounds: vi.fn(() => [zeroSourceId, sourceId, flatId]),
      getTileBounds: vi.fn((id) =>
        id.x === flatId.x
          ? { west: 7.2, south: 51, east: 7.4, north: 51.3 }
          : id.x === zeroSourceId.x
          ? { west: 6.8, south: 51, east: 7, north: 51.3 }
          : { west: 7, south: 51, east: 7.2, north: 51.3 }
      ),
      getLevelMaximumGeometricError: vi.fn(() => 0.01),
      getTileDataAvailable: vi.fn((id) => id.x !== flatId.x),
      sampleHeight: vi.fn(),
      trimCache: vi.fn(),
      release: vi.fn(),
    };
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const runtime = buildRasterDemTerrainRuntime(
      "terrain-with-flat-coverage",
      terrainConfig("https://example.test/terrain-with-flat-coverage"),
      [7.15, 51.256],
      { minimumLevel: 10, maximumLevel: 10, noDataHeightMeters: 0 }
    );
    const map = {
      getBounds: vi.fn(() => ({
        getWest: () => 7,
        getSouth: () => 51,
        getEast: () => 7.4,
        getNorth: () => 51.3,
      })),
      triggerRepaint: vi.fn(),
    };
    runtime.onAdd?.(map as never);
    await vi.waitFor(() => {
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    });
    const lodCamera = new PerspectiveCamera(60, 1, 1, 10_000);
    lodCamera.position.set(0, 1_000, 0);
    runtime.update({
      map: map as never,
      renderCamera: new Camera(),
      lodCamera,
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new Matrix4(),
        sceneFromLocalRotation: new Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new Matrix4(),
        referenceToCurrent: new Matrix4(),
        currentToReference: new Matrix4(),
      },
    });

    await expect(runtime.ready).resolves.toBe(true);
    expect(source.requestTile).toHaveBeenCalledTimes(2);
    expect(source.requestTile.mock.calls.map(([id]) => id)).toContainEqual(
      zeroSourceId
    );
    expect(source.requestTile.mock.calls.map(([id]) => id)).toContainEqual(
      sourceId
    );
    expect(runtime.root.children).toHaveLength(2);
    expect(
      runtime.root.children.some((child) => child.name.includes("flat:"))
    ).toBe(false);
    const zeroSourceNode = runtime.root.children.find((child) =>
      child.name.includes("source:10/531/218")
    ) as Group;
    expect(zeroSourceNode.children).toHaveLength(0);
    const mixedSourceNode = runtime.root.children.find((child) =>
      child.name.includes("source:10/532/218")
    ) as Group;
    expect(mixedSourceNode.children).toHaveLength(1);
    expect(
      mixedSourceNode.children.some((child) => child.name.endsWith("-base"))
    ).toBe(false);
    const reliefSourceMesh = mixedSourceNode.children.find((child) =>
      child.name.endsWith("-relief")
    ) as Mesh;
    expect(reliefSourceMesh.castShadow).toBe(true);
    expect(reliefSourceMesh.receiveShadow).toBe(true);
    expect(reliefSourceMesh.customDepthMaterial).toBeUndefined();
    expect(reliefSourceMesh.geometry.getAttribute("position").count).toBe(4);
    expect(Array.from(reliefSourceMesh.geometry.getIndex()!.array)).toEqual([
      0, 2, 1,
    ]);
    expect(
      createProjectedTerrainTileGeometry.mock.calls.some(
        ([{ tile }]) => tile.id?.x === flatId.x
      )
    ).toBe(false);

    runtime.dispose();
  });

  it("keeps a coarse parent whole when a child quadrant has no data", async () => {
    const parentId = { level: 10, x: 532, y: 218 };
    const sourceChildId = { level: 11, x: 1_064, y: 436 };
    const source = {
      requestTile: vi.fn(async (id) => ({
        id,
        heightMeters: new Float32Array([100]),
        westIndices: new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices: new Uint32Array(),
        northIndices: new Uint32Array(),
      })),
      getTileGridIdsForBounds: vi.fn(() => [parentId]),
      getTileBounds: vi.fn((id) => {
        if (id.level === parentId.level) {
          return { west: 7, south: 51, east: 7.4, north: 51.4 };
        }
        const west = id.x % 2 === 0 ? 7 : 7.2;
        const north = id.y % 2 === 0 ? 51.4 : 51.2;
        return { west, south: north - 0.2, east: west + 0.2, north };
      }),
      getLevelMaximumGeometricError: vi.fn(() => 1_000_000),
      getTileDataAvailable: vi.fn(
        (id) => id.level === parentId.level || id.x === sourceChildId.x
      ),
      sampleHeight: vi.fn(),
      trimCache: vi.fn(),
      release: vi.fn(),
    };
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const runtime = buildRasterDemTerrainRuntime(
      "terrain-mixed-children",
      terrainConfig("https://example.test/terrain-mixed-children"),
      [7.2, 51.2],
      { minimumLevel: 10, maximumLevel: 11, errorTargetPixels: 0.1 }
    );
    const map = {
      getBounds: vi.fn(() => ({
        getWest: () => 7,
        getSouth: () => 51,
        getEast: () => 7.4,
        getNorth: () => 51.4,
      })),
      triggerRepaint: vi.fn(),
    };
    runtime.onAdd?.(map as never);
    await vi.waitFor(() => {
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    });
    const lodCamera = new PerspectiveCamera(60, 1, 1, 100_000);
    lodCamera.position.set(0, 1_000, 0);
    const lowResolutionShadowCamera = new OrthographicCamera(
      -50_000,
      50_000,
      50_000,
      -50_000,
      1,
      5_000
    );
    lowResolutionShadowCamera.position.set(0, 1_000, 0);
    lowResolutionShadowCamera.lookAt(0, 0, 0);
    lowResolutionShadowCamera.updateProjectionMatrix();
    lowResolutionShadowCamera.updateMatrixWorld(true);
    runtime.setShadowView({
      camera: lowResolutionShadowCamera,
      shadowMapSize: { width: 1_000, height: 1_000 },
    });
    runtime.update({
      map: map as never,
      renderCamera: new Camera(),
      lodCamera,
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new Matrix4(),
        sceneFromLocalRotation: new Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new Matrix4(),
        referenceToCurrent: new Matrix4(),
        currentToReference: new Matrix4(),
      },
    });

    await expect(runtime.ready).resolves.toBe(true);
    // Splitting would trade the parent's real ground for sea-level plates in
    // the quadrants without data - a hole in the view, and up-sun a hole in
    // the shadow. The parent stays whole; refinement ends at the
    // availability boundary.
    expect(source.requestTile).toHaveBeenCalledTimes(1);
    expect(source.requestTile.mock.calls.map(([id]) => id)).toContainEqual(
      parentId
    );
    expect(
      runtime.root.children.some((child) => child.name.includes("source:10/"))
    ).toBe(true);
    expect(
      runtime.root.children.some((child) => child.name.includes("flat:11/"))
    ).toBe(false);

    runtime.dispose();
  });

  it("refines the viewport to its error target before the sun coverage", async () => {
    // One viewport tile and three sun-coverage tiles west of it compete for a
    // budget that only fits the viewport split. The view must reach its own
    // pixel-error target regardless of how demanding the sun coverage is, and
    // its tiles must be first in the download order.
    const viewportId = { level: 10, x: 532, y: 218 };
    // A one-tile gap to the viewport keeps edge-touching out of the picture.
    const westIds = [
      { level: 10, x: 528, y: 218 },
      { level: 10, x: 529, y: 218 },
      { level: 10, x: 530, y: 218 },
    ];
    const boundsOf = (id: { level: number; x: number; y: number }) => {
      const scale = 2 ** (id.level - 10);
      const width = 0.1 / scale;
      const west = 7.1 + (id.x - 532 * scale) * width;
      const north = 51.3 - (id.y - 218 * scale) * width;
      return { west, south: north - width, east: west + width, north };
    };
    const intersects = (
      a: { west: number; south: number; east: number; north: number },
      b: { west: number; south: number; east: number; north: number }
    ) =>
      a.west < b.east &&
      a.east > b.west &&
      a.south < b.north &&
      a.north > b.south;
    const source = {
      requestTile: vi.fn(async (id) => ({
        id,
        heightMeters: new Float32Array([100]),
        westIndices: new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices: new Uint32Array(),
        northIndices: new Uint32Array(),
      })),
      getTileGridIdsForBounds: vi.fn((bounds) =>
        [...westIds, viewportId].filter((id) =>
          intersects(boundsOf(id), bounds)
        )
      ),
      getTileBounds: vi.fn(boundsOf),
      getLevelMaximumGeometricError: vi.fn((level) => 200 / 2 ** (level - 10)),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(),
      trimCache: vi.fn(),
      release: vi.fn(),
    };
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const originLngLat: [number, number] = [7.15, 51.25];
    const runtime = buildRasterDemTerrainRuntime(
      "viewport-priority-terrain",
      terrainConfig("https://example.test/viewport-priority-terrain"),
      originLngLat,
      {
        minimumLevel: 10,
        maximumLevel: 11,
        errorTargetPixels: 0.1,
        shadowLevelOffset: 0,
        // Roots (4) plus the viewport split (net +3) fit; the sun-coverage
        // split (net +3 more) must not.
        maxSelectionTiles: 7,
      }
    );
    const map = {
      getBounds: vi.fn(() => ({
        getWest: () => 7.1,
        getSouth: () => 51.2,
        getEast: () => 7.2,
        getNorth: () => 51.3,
      })),
      triggerRepaint: vi.fn(),
    };
    runtime.onAdd?.(map as never);
    await vi.waitFor(() => {
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    });
    const origin = MercatorCoordinate.fromLngLat(originLngLat, 0);
    const meterScale = origin.meterInMercatorCoordinateUnits();
    const westCenter = MercatorCoordinate.fromLngLat([6.65, 51.25], 0);
    const shadowCamera = new OrthographicCamera(
      -12_000,
      12_000,
      12_000,
      -12_000,
      1,
      50_000
    );
    shadowCamera.position.set(
      (westCenter.x - origin.x) / meterScale,
      2_000,
      (westCenter.y - origin.y) / meterScale
    );
    // Sweep from the visible frontier toward these western caster roots.
    shadowCamera.lookAt(0, 0, 0);
    shadowCamera.updateProjectionMatrix();
    shadowCamera.updateMatrixWorld(true);
    runtime.setShadowView({
      camera: shadowCamera,
      shadowMapSize: { width: 1_000, height: 1_000 },
    });
    const lodCamera = new PerspectiveCamera(60, 1, 1, 100_000);
    lodCamera.position.set(0, 500, 0);
    runtime.update({
      map: map as never,
      renderCamera: new Camera(),
      lodCamera,
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new Matrix4(),
        sceneFromLocalRotation: new Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new Matrix4(),
        referenceToCurrent: new Matrix4(),
        currentToReference: new Matrix4(),
      },
    });
    await expect(runtime.ready).resolves.toBe(true);

    // ready resolves on visible coverage, before offscreen caster work starts.
    expect(
      source.requestTile.mock.calls.every(
        ([id]) => id.level === 11 && id.x >> 1 === 532
      )
    ).toBe(true);
    await vi.waitFor(() => {
      for (const westId of westIds)
        expect(source.requestTile.mock.calls.map(([id]) => id)).toContainEqual(
          westId
        );
    });
    const requestedIds = source.requestTile.mock.calls.map(([id]) => id);
    // The viewport root split into its level-11 children ...
    expect(
      requestedIds.filter((id) => id.level === 11 && id.x >> 1 === 532)
    ).toHaveLength(4);
    // ... while the sun coverage stayed at its root level: the leftover
    // budget cannot fit another split.
    expect(
      requestedIds.filter((id) => id.level === 11 && id.x >> 1 !== 532)
    ).toHaveLength(0);
    for (const westId of westIds) {
      expect(requestedIds).toContainEqual(westId);
    }
    // Download order: everything in view comes before the sun coverage.
    const viewportIndices = requestedIds
      .map((id, index) => ({ id, index }))
      .filter(({ id }) => id.level === 11 || (id.level === 10 && id.x === 532))
      .map(({ index }) => index);
    const coverageIndices = requestedIds
      .map((id, index) => ({ id, index }))
      .filter(({ id }) => id.level === 10 && id.x !== 532)
      .map(({ index }) => index);
    expect(Math.max(...viewportIndices)).toBeLessThan(
      Math.min(...coverageIndices)
    );

    runtime.dispose();
  });

  it("refines elevated neighbor tiles whose 3D bounds enter the camera frustum", async () => {
    const centerId = { level: 10, x: 532, y: 218 };
    const foregroundId = { level: 10, x: 532, y: 219 };
    const boundsOf = (id: { level: number; x: number; y: number }) => {
      const scale = 2 ** (id.level - 10);
      const width = 0.02 / scale;
      const west = 7.14 + (id.x - 532 * scale) * width;
      const north = 51.26 - (id.y - 218 * scale) * width;
      return { west, south: north - width, east: west + width, north };
    };
    const source = {
      requestTile: vi.fn(async (id) => ({
        id,
        heightMeters: new Float32Array([200, 220]),
        westIndices: new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices: new Uint32Array(),
        northIndices: new Uint32Array(),
      })),
      getTileGridIdsForBounds: vi.fn(() => [centerId, foregroundId]),
      getTileBounds: vi.fn(boundsOf),
      getLevelMaximumGeometricError: vi.fn(
        (level) => 1_000 / 2 ** (level - 10)
      ),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(),
      trimCache: vi.fn(),
      release: vi.fn(),
    };
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const runtime = buildRasterDemTerrainRuntime(
      "frustum-volume-terrain",
      terrainConfig("https://example.test/frustum-volume-terrain"),
      [7.15, 51.25],
      {
        minimumLevel: 10,
        maximumLevel: 11,
        errorTargetPixels: 50,
        maxSelectionTiles: 10,
      }
    );
    const map = {
      getBounds: vi.fn(() => ({
        getWest: () => 7.145,
        getSouth: () => 51.245,
        getEast: () => 7.155,
        getNorth: () => 51.255,
      })),
      triggerRepaint: vi.fn(),
    };
    runtime.onAdd?.(map as never);
    await vi.waitFor(() => {
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    });
    const viewport = new Vector2(1_200, 600);
    const renderAt = (z: number) => {
      const camera = new PerspectiveCamera(80, 2, 1, 100_000);
      camera.position.set(0, 210, z);
      camera.lookAt(0, 210, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      runtime.update({
        map: map as never,
        renderCamera: camera,
        lodCamera: camera,
        lookTarget: new Vector3(0, 210, 0),
        viewport,
        localFrame: {
          lngLat: [7.15, 51.25] as const,
          revision: 1,
          sceneFromLocal: new Matrix4(),
          sceneFromLocalRotation: new Matrix4(),
          referenceLngLat: [7.15, 51.25] as const,
          sceneFromLocalReference: new Matrix4(),
          referenceToCurrent: new Matrix4(),
          currentToReference: new Matrix4(),
        },
      });
    };

    // Load both roots from a distant view. The foreground tile is outside the
    // planar map bounds, but its height volume is visible in the real frustum.
    renderAt(20_000);
    await expect(runtime.ready).resolves.toBe(true);
    expect(source.requestTile.mock.calls.map(([id]) => id)).toContainEqual(
      centerId
    );
    expect(source.requestTile.mock.calls.map(([id]) => id)).toContainEqual(
      foregroundId
    );

    source.requestTile.mockClear();
    renderAt(5_000);
    await vi.waitFor(() => {
      const requestedIds = source.requestTile.mock.calls.map(([id]) => id);
      expect(
        requestedIds.filter(
          (id) => id.level === 11 && id.y >> 1 === foregroundId.y
        )
      ).toHaveLength(4);
      expect(
        requestedIds.filter((id) => id.level === 11 && id.y >> 1 === centerId.y)
      ).toHaveLength(4);
    });

    runtime.dispose();
  });

  it("keeps visible ground untouched when a superseded batch lands", async () => {
    const boundsOf = (id: { level: number; x: number; y: number }) => {
      const width = 0.125;
      const west = 7.125 + (id.x - 532) * width;
      return { west, south: 51.2, east: west + width, north: 51.3 };
    };
    const intersects = (
      a: { west: number; south: number; east: number; north: number },
      b: { west: number; south: number; east: number; north: number }
    ) =>
      a.west < b.east &&
      a.east > b.west &&
      a.south < b.north &&
      a.north > b.south;
    const allIds = [
      { level: 10, x: 532, y: 218 },
      { level: 10, x: 533, y: 218 },
      { level: 10, x: 534, y: 218 },
    ];
    const pendingResolvers: Array<() => void> = [];
    const source = {
      requestTile: vi.fn(
        (id) =>
          new Promise((resolve) => {
            pendingResolvers.push(() =>
              resolve({
                id,
                heightMeters: new Float32Array([100]),
                westIndices: new Uint32Array(),
                southIndices: new Uint32Array(),
                eastIndices: new Uint32Array(),
                northIndices: new Uint32Array(),
              })
            );
          })
      ),
      getTileGridIdsForBounds: vi.fn((bounds) =>
        allIds.filter((id) => intersects(boundsOf(id), bounds))
      ),
      getTileBounds: vi.fn(boundsOf),
      getLevelMaximumGeometricError: vi.fn(() => 0.0001),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(),
      trimCache: vi.fn(),
      release: vi.fn(),
    };
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const runtime = buildRasterDemTerrainRuntime(
      "superseded-batch-terrain",
      terrainConfig("https://example.test/superseded-batch-terrain"),
      [7.15, 51.25],
      { minimumLevel: 10, maximumLevel: 10 }
    );
    let viewEast = 7.2;
    const map = {
      getBounds: vi.fn(() => ({
        getWest: () => 7.125,
        getSouth: () => 51.2,
        getEast: () => viewEast,
        getNorth: () => 51.3,
      })),
      triggerRepaint: vi.fn(),
    };
    runtime.onAdd?.(map as never);
    await vi.waitFor(() => {
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    });
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    const renderAt = (x: number) => {
      const lodCamera = new PerspectiveCamera(60, 1, 1, 100_000);
      lodCamera.position.set(x, 1_000, 0);
      lodCamera.updateMatrixWorld(true);
      runtime.update({
        map: map as never,
        renderCamera: new Camera(),
        lodCamera,
        lookTarget: new Vector3(),
        viewport: new Vector2(1_000, 1_000),
        localFrame: {
          lngLat: [7.15, 51.25] as const,
          revision: 1,
          sceneFromLocal: new Matrix4(),
          sceneFromLocalRotation: new Matrix4(),
          referenceLngLat: [7.15, 51.25] as const,
          sceneFromLocalReference: new Matrix4(),
          referenceToCurrent: new Matrix4(),
          currentToReference: new Matrix4(),
        },
      });
    };

    renderAt(0);
    await vi.waitFor(() => expect(pendingResolvers).toHaveLength(1));
    pendingResolvers.splice(0).forEach((resolve) => resolve());
    await flush();
    const visibleNode = () =>
      runtime.root.children.find((child) =>
        child.name.includes("source:10/532/")
      );
    await vi.waitFor(() => expect(visibleNode()?.visible).toBe(true));

    viewEast = 7.3;
    renderAt(100);
    await flush();
    expect(pendingResolvers).toHaveLength(1);
    viewEast = 7.45;
    renderAt(200);
    await flush();
    // The overlapping second tile keeps its existing preparation job instead
    // of being fetched/projected again for the superseding camera selection.
    expect(pendingResolvers).toHaveLength(2);
    pendingResolvers.splice(1).forEach((resolve) => resolve());
    await flush();
    expect(visibleNode()?.visible).toBe(true);
    pendingResolvers.splice(0).forEach((resolve) => resolve());
    await flush();
    expect(visibleNode()?.visible).toBe(true);

    for (const id of allIds) {
      expect(
        source.requestTile.mock.calls.filter(([requested]) => requested === id)
      ).toHaveLength(1);
    }
    expect(createProjectedTerrainTileGeometry).toHaveBeenCalledTimes(
      allIds.length
    );
    runtime.dispose();
  });
});
