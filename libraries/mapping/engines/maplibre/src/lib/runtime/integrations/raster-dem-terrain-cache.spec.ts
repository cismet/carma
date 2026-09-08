import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  PerspectiveCamera,
  Vector2,
  Vector3,
} from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { acquireSource, cache, createCache, registerSampler, runTask } =
  vi.hoisted(() => {
    const cache = { get: vi.fn(), set: vi.fn() };
    return {
      acquireSource: vi.fn(),
      cache,
      createCache: vi.fn(() => cache),
      registerSampler: vi.fn(
        (
          _map: unknown,
          _id: string,
          _sample: (longitude: number, latitude: number) => number | undefined
        ) => vi.fn()
      ),
      runTask: vi.fn(),
    };
  });

vi.mock("./projected-terrain-geometry-cache", () => ({
  createProjectedTerrainGeometryCache: createCache,
}));
vi.mock("./raster-dem-terrain-tile-source", () => ({
  acquireRasterDemTerrainTileSource: acquireSource,
  isConfirmedTerrainServerError: () => false,
  terrainTileKey: ({ level, x, y }: Record<string, number>) =>
    `${level}/${x}/${y}`,
}));
vi.mock("./terrain-worker-client", () => ({ runTerrainWorkerTask: runTask }));
vi.mock("./shared-three-terrain-registry", () => ({
  registerSharedThreeTerrainSampler: registerSampler,
  notifySharedThreeTerrainChanged: vi.fn(),
  setSharedThreeTerrainLoading: vi.fn(),
}));

import { buildRasterDemTerrainRuntime } from "./raster-dem-terrain-runtime";
import { executeTerrainWorkerTask } from "./terrain-worker-task";

describe("prepared terrain cache integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runTask.mockImplementation(executeTerrainWorkerTask);
  });

  it.each(
    (["complete", "partial", "empty"] as const).flatMap((coverage) =>
      [true, false].map((cacheHit) => ({ coverage, cacheHit }))
    )
  )(
    "publishes $coverage relief with cacheHit=$cacheHit and only necessary worker tasks",
    async ({ coverage, cacheHit }) => {
      const id = { level: 10, x: 532, y: 218 };
      const bounds = { west: 7, south: 51, east: 7.4, north: 51.3 };
      const reliefVertexMask = new Uint8Array(
        coverage === "complete"
          ? [1, 1, 1, 1]
          : coverage === "partial"
          ? [1, 1, 1, 0]
          : [0, 0, 0, 0]
      );
      const geometry = coverage === "empty" ? null : new BufferGeometry();
      if (geometry) {
        geometry.setAttribute(
          "position",
          new BufferAttribute(
            new Float32Array([0, 1, 0, 0, 1, -1, 1, 1, 0, 1, 1, -1]),
            3
          )
        );
        geometry.setIndex(
          coverage === "partial" ? [0, 2, 1] : [0, 2, 1, 1, 2, 3]
        );
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
      }
      const tile = {
        id,
        bounds,
        minimumHeightMeters: coverage === "complete" ? 123 : -9999,
        maximumHeightMeters: coverage === "empty" ? -9999 : 123,
        geometricErrorMeters: 0.01,
        byteLength: 200,
        u: new Float32Array([0, 0, 1, 1]),
        v: new Float32Array([0, 1, 0, 1]),
        heightMeters: new Float32Array(
          coverage === "empty"
            ? [-9999, -9999, -9999, -9999]
            : [123, 123, 123, coverage === "partial" ? -9999 : 123]
        ),
        indices: new Uint32Array([0, 2, 1, 1, 2, 3]),
        westIndices: new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices: new Uint32Array(),
        northIndices: new Uint32Array(),
      };
      cache.get.mockResolvedValue(
        cacheHit ? { tile, geometry, reliefVertexMask } : null
      );
      const source = {
        release: vi.fn(),
        requestTile: vi.fn(async () => tile),
        getTileGridIdsForBounds: () => [id],
        getTileBounds: () => bounds,
        getLevelMaximumGeometricError: () => 0.01,
        getTileDataAvailable: () => true,
        sampleHeight: vi.fn(() =>
          cacheHit ? undefined : coverage === "empty" ? -9999 : 123
        ),
        trimCache: vi.fn(),
      };
      acquireSource.mockResolvedValue(source);
      const runtime = buildRasterDemTerrainRuntime(
        "cached-relief",
        {
          id: "cached-relief",
          url: "https://example.test/{z}/{x}/{y}.png",
          tileSize: 512,
          minzoom: 0,
          maxzoom: 16,
          encoding: "terrarium",
          bounds: [-180, -85, 180, 85],
        },
        [7.15, 51.256],
        { minimumLevel: 10, maximumLevel: 10, noDataHeightMeters: -9999 }
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
      const lodCamera = new PerspectiveCamera(60, 1, 1, 10_000);
      lodCamera.position.set(0, 1000, 0);
      try {
        // Exercise both sampler registration paths: source-first and map-first.
        if (cacheHit)
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        runtime.onAdd?.(map as never);
        await vi.waitFor(() => expect(registerSampler).toHaveBeenCalledOnce());
        runtime.update({
          map: map as never,
          renderCamera: new Camera(),
          lodCamera,
          lookTarget: new Vector3(),
          viewport: new Vector2(1000, 1000),
        });
        await expect(runtime.ready).resolves.toBe(true);
        const sharedSampler = registerSampler.mock.calls[0][2];
        expect(sharedSampler).toBe(runtime.getElevation);
        const expectedHeight = coverage === "empty" ? undefined : 123;
        expect(runtime.getElevation(bounds.west, bounds.south)).toBe(
          expectedHeight
        );
        expect(sharedSampler(bounds.west, bounds.south)).toBe(expectedHeight);
        if (cacheHit) {
          expect(runtime.getElevation(bounds.east, bounds.north)).toBe(
            coverage === "complete" ? 123 : undefined
          );
          expect(
            runtime.getElevation(bounds.west - 0.01, bounds.south)
          ).toBeUndefined();
          source.sampleHeight.mockReturnValueOnce(321);
          expect(runtime.getElevation(bounds.west, bounds.south)).toBe(321);
          source.sampleHeight.mockReturnValueOnce(-9999);
          expect(
            runtime.getElevation(bounds.west, bounds.south)
          ).toBeUndefined();
        }
        expect(cache.get).toHaveBeenCalledWith(id, 0.01);
        if (cacheHit) {
          expect(source.requestTile).not.toHaveBeenCalled();
          expect(cache.set).not.toHaveBeenCalled();
          expect(
            runTask.mock.calls.every(([task]) => task.kind === "stitch")
          ).toBe(true);
        } else {
          expect(source.requestTile).toHaveBeenCalledOnce();
          expect(cache.set).toHaveBeenCalledWith(
            tile,
            coverage === "empty" ? null : expect.any(BufferGeometry),
            reliefVertexMask,
            expect.any(Number)
          );
          expect(
            runTask.mock.calls.filter(([task]) => task.kind === "project")
          ).toHaveLength(1);
          expect(
            runTask.mock.calls.filter(([task]) => task.kind === "partition")
          ).toHaveLength(coverage === "complete" ? 0 : 1);
        }
        expect(createCache).toHaveBeenCalledWith(
          expect.any(String),
          [7.15, 51.256],
          -9999,
          undefined // This test runs an unbundled, intentionally uncached graph.
        );
        expect(runtime.root.children).toHaveLength(1);
        expect(runtime.root.children[0].children).toHaveLength(
          coverage === "empty" ? 0 : 1
        );
      } finally {
        runtime.dispose();
        if (!cacheHit) geometry?.dispose();
      }
    }
  );
});
