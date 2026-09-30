import {
  BufferGeometry,
  Camera,
  Float32BufferAttribute,
  Matrix4,
  PerspectiveCamera,
  Vector2,
  Vector3,
} from "three";
import { beforeEach, expect, vi } from "vitest";

import type { TerrainTile, TerrainTileId } from "../../core/raster-dem-tile";
import { buildRasterDemTerrainRuntime } from "./raster-dem-terrain-runtime";

const mockHandles = vi.hoisted(() => ({
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
    createProjectedTerrainTileGeometry:
      mockHandles.createProjectedTerrainTileGeometry,
  })
);

vi.mock("./raster-dem-terrain-tile-source", () => ({
  acquireRasterDemTerrainTileSource:
    mockHandles.acquireRasterDemTerrainTileSource,
  isConfirmedTerrainServerError: () => false,
  terrainTileKey: ({ level, x, y }: Record<string, number>) =>
    `${level}/${x}/${y}`,
}));

vi.mock("./shared-three-terrain-registry", () => ({
  notifySharedThreeTerrainChanged: mockHandles.notifySharedThreeTerrainChanged,
  registerSharedThreeTerrainSampler:
    mockHandles.registerSharedThreeTerrainSampler,
  setSharedThreeTerrainLoading: mockHandles.setSharedThreeTerrainLoading,
}));

export const acquireRasterDemTerrainTileSource =
  mockHandles.acquireRasterDemTerrainTileSource;
export const createProjectedTerrainTileGeometry =
  mockHandles.createProjectedTerrainTileGeometry;
export const notifySharedThreeTerrainChanged =
  mockHandles.notifySharedThreeTerrainChanged;
export const registerSharedThreeTerrainSampler =
  mockHandles.registerSharedThreeTerrainSampler;
export const setSharedThreeTerrainLoading =
  mockHandles.setSharedThreeTerrainLoading;

export const terrainConfig = (url: string) => ({
  id: "test-terrain",
  url,
  tileSize: 512,
  minzoom: 0,
  maxzoom: 18,
  encoding: "terrarium" as const,
  bounds: [-180, -85, 180, 85] as const,
});

/** The runtime settles after 250 ms; wait past it without coupling to timers. */
export const MOTION_SETTLE_WAIT_MS = 400;

export const installRasterDemTerrainRuntimeFixture = () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
};

export const createIdlePrefetchFixture = (
  name: string,
  maximumLevel = 10,
  extraOptions: Record<string, unknown> = {}
) => {
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
    getTileBounds: vi.fn((_id: TerrainTileId) => bounds),
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
      ...extraOptions,
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
