import { MercatorCoordinate } from "maplibre-gl";
import {
  Camera,
  Matrix4,
  OrthographicCamera,
  PerspectiveCamera,
  Vector2,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { getTileBounds } from "../../core/raster-dem-tile";
import {
  acquireRasterDemTerrainTileSource,
  registerSharedThreeTerrainSampler,
  terrainConfig,
  installRasterDemTerrainRuntimeFixture,
} from "./raster-dem-terrain-runtime.test-support";
import { buildRasterDemTerrainRuntime } from "./raster-dem-terrain-runtime";

describe("buildRasterDemTerrainRuntime shadow selection", () => {
  installRasterDemTerrainRuntimeFixture();

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
});
