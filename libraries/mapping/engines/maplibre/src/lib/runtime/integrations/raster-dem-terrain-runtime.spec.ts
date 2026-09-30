import {
  Camera,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  Vector2,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { getTileBounds } from "../../core/raster-dem-tile";
import {
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
} from "../../core/tile-camera-demand";
import * as terrainWorkers from "./terrain-worker-client";
import * as requestConcurrency from "./payload-aware-request-concurrency";
import {
  acquireRasterDemTerrainTileSource,
  registerSharedThreeTerrainSampler,
  terrainConfig,
  MOTION_SETTLE_WAIT_MS,
  createIdlePrefetchFixture,
  installRasterDemTerrainRuntimeFixture,
} from "./raster-dem-terrain-runtime.test-support";
import { buildRasterDemTerrainRuntime } from "./raster-dem-terrain-runtime";

describe("buildRasterDemTerrainRuntime setup, cache and motion", () => {
  installRasterDemTerrainRuntimeFixture();

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

  it("keeps published coverage but stops optional warming when the byte budget is full", async () => {
    const f = createIdlePrefetchFixture("byte-budget", 12, {
      maxCachedMeshBytes: 1,
    });
    try {
      await f.start();
      await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalled());
      const visible = f.runtime.root.children.filter((node) => node.visible);
      expect(visible.length).toBeGreaterThan(0);
      const [camera] = snapshotTileCameraViews([
        {
          id: "focus",
          camera: new Camera(),
          viewport: [128, 128],
          errorTargetPixels: 2,
          role: TILE_CAMERA_ROLE.GEOMETRY,
        },
      ]);
      const bounds = getTileBounds({ level: 10, x: 532, y: 218 });
      await f.runtime.prefetchZoom!(
        {
          camera,
          lngLat: [
            (bounds.west + bounds.east) / 2,
            (bounds.south + bounds.north) / 2,
          ],
          levels: 2,
        },
        new AbortController().signal
      );
      expect(f.source.requestTile).toHaveBeenCalledTimes(1);
      expect(f.runtime.root.children.filter((node) => node.visible)).toEqual(
        visible
      );
    } finally {
      f.runtime.dispose();
    }
  });

  it("evicts optional geometry that exceeds the byte budget without disturbing coverage", async () => {
    const f = createIdlePrefetchFixture("byte-eviction", 12, {
      maxCachedMeshBytes: 600,
    });
    try {
      await f.start();
      await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledOnce());
      const previous = [...f.runtime.root.children];
      const [camera] = snapshotTileCameraViews([
        {
          id: "focus",
          camera: new Camera(),
          viewport: [128, 128],
          errorTargetPixels: 2,
          role: TILE_CAMERA_ROLE.GEOMETRY,
        },
      ]);
      const bounds = getTileBounds({ level: 10, x: 532, y: 218 });
      await f.runtime.prefetchZoom!(
        {
          camera,
          lngLat: [
            (bounds.west + bounds.east) / 2,
            (bounds.south + bounds.north) / 2,
          ],
          levels: 1,
        },
        new AbortController().signal
      );
      expect(f.source.requestTile).toHaveBeenCalledTimes(2);
      expect(f.runtime.root.children).toEqual(previous);
      expect(previous.some((node) => node.visible)).toBe(true);
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

  it("publishes same-level terrain without scheduling optional stitching", async () => {
    const f = createIdlePrefetchFixture("same-level-no-stitch");
    const worker = vi.spyOn(terrainWorkers, "runTerrainWorkerTask");
    try {
      await f.start();
      await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledOnce());
      expect(f.runtime.root.children.some((node) => node.visible)).toBe(true);
      expect(f.runtime.getRequestDemand?.()).toBe(0);
      vi.useFakeTimers();
      await vi.advanceTimersByTimeAsync(1000);
      expect(worker.mock.calls.some(([task]) => task.kind === "stitch")).toBe(
        false
      );
    } finally {
      f.runtime.dispose();
      worker.mockRestore();
      vi.useRealTimers();
    }
  });

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

  it.each([
    [{ meshSegments: 128 }, 512],
    [{ maximumMeshSegments: 128 }, 128],
    [{ maximumMeshSegments: 2048 }, 512],
  ])(
    "only reduces the source grid for an explicit baseline ceiling %j",
    async (options, expected) => {
      const f = createIdlePrefetchFixture("resolution-ceiling", 10, options);
      try {
        await f.start();
        expect(acquireRasterDemTerrainTileSource).toHaveBeenLastCalledWith(
          expect.objectContaining({ tileSize: 512 }),
          expect.objectContaining({ meshSegments: expected })
        );
      } finally {
        f.runtime.dispose();
      }
    }
  );

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

  it("holds the configured target back while the map moves", async () => {
    // A fine target spends the tile budget on levels the next camera change
    // discards. With a motion target the cut stays coarse while the map moves
    // and one more cut runs at the configured target once it holds still.
    // The gesture drives it, not the camera signature: a repaint that nudges a
    // matrix would otherwise coarsen a published cut and flip its tiles.
    const f = createIdlePrefetchFixture("motion-settle", 10, {
      errorTargetPixels: 0.5,
      motionErrorTargetPixels: 8,
    });
    await f.start();
    const selections = () => f.source.getTileGridIdsForBounds.mock.calls.length;
    f.listeners.get("movestart")?.();
    f.runtime.update(f.frame);
    const afterMove = selections();
    // An unchanged view selects nothing new while the gesture runs.
    f.runtime.update(f.frame);
    expect(selections()).toBe(afterMove);
    f.listeners.get("moveend")?.();
    await new Promise((resolve) => setTimeout(resolve, MOTION_SETTLE_WAIT_MS));
    f.runtime.update(f.frame);
    expect(selections()).toBeGreaterThan(afterMove);
    f.runtime.dispose();
  });

  it("keeps one target when no motion target is configured", async () => {
    const f = createIdlePrefetchFixture("motion-off", 10, {
      errorTargetPixels: 0.5,
    });
    await f.start();
    const selections = () => f.source.getTileGridIdsForBounds.mock.calls.length;
    const afterMove = selections();
    f.listeners.get("moveend")?.();
    await new Promise((resolve) => setTimeout(resolve, MOTION_SETTLE_WAIT_MS));
    f.runtime.update(f.frame);
    expect(selections()).toBe(afterMove);
    f.runtime.dispose();
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

  it.each([undefined, 8])(
    "retains visible raster detail during motion with target %s and resumes coarsening at rest",
    async (motionErrorTargetPixels) => {
      const f = createIdlePrefetchFixture("motion-visible-detail", 11, {
        errorTargetPixels: 0.5,
        motionErrorTargetPixels,
      });
      f.source.getLevelMaximumGeometricError.mockReturnValue(1_000_000);
      f.frame.renderCamera = new OrthographicCamera(
        -1e7,
        1e7,
        1e7,
        -1e7,
        -1e7,
        1e7
      );
      const visible = () =>
        f.runtime.root.children.filter((node) => node.visible);
      try {
        await f.start();
        await vi.waitFor(() =>
          expect(
            visible().filter((node) => node.name.includes("source:11/"))
          ).toHaveLength(4)
        );
        const detailed = new Set(visible());
        f.listeners.get("movestart")?.();
        f.runtime.setErrorTarget?.(1_000_000_000);
        f.runtime.update(f.frame);
        await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalled());
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(new Set(visible())).toEqual(detailed);
        const requestsBeforeSettle = f.source.requestTile.mock.calls.length;
        f.listeners.get("moveend")?.();
        await new Promise((resolve) =>
          setTimeout(resolve, MOTION_SETTLE_WAIT_MS)
        );
        f.runtime.update(f.frame);
        await vi.waitFor(() => expect(visible()).toHaveLength(1));
        expect(visible()[0].name).toContain("source:10/");
        expect(f.source.requestTile).toHaveBeenCalledTimes(
          requestsBeforeSettle
        );
      } finally {
        f.runtime.dispose();
      }
    }
  );
});
