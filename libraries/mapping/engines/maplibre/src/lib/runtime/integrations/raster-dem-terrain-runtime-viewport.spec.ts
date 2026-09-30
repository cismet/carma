import { Camera, Matrix4, PerspectiveCamera, Vector2, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { getTileBounds } from "../../core/raster-dem-tile";
import {
  acquireRasterDemTerrainTileSource,
  registerSharedThreeTerrainSampler,
  setSharedThreeTerrainLoading,
  terrainConfig,
  installRasterDemTerrainRuntimeFixture,
} from "./raster-dem-terrain-runtime.test-support";
import { buildRasterDemTerrainRuntime } from "./raster-dem-terrain-runtime";

describe("buildRasterDemTerrainRuntime initial viewport", () => {
  installRasterDemTerrainRuntimeFixture();

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
});
