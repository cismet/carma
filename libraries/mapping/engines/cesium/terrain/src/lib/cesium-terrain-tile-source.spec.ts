import { describe, expect, it, vi } from "vitest";

const { fromUrl } = vi.hoisted(() => ({ fromUrl: vi.fn() }));

vi.mock("@carma-cesium", () => {
  class Cartographic {
    constructor(public longitude: number, public latitude: number) {}

    static fromDegrees(longitude: number, latitude: number) {
      return new Cartographic(
        (longitude * Math.PI) / 180,
        (latitude * Math.PI) / 180
      );
    }
  }

  return {
    Cartographic,
    CesiumTerrainProvider: { fromUrl },
  };
});

import { acquireCesiumTerrainTileSource } from "./cesium-terrain-tile-source";

const buildProvider = () => {
  const terrainData = {
    _quantizedVertices: new Uint16Array([
      0, 0, 32767, 32767, 0, 32767, 0, 32767, 0, 16384, 16384, 32767,
    ]),
    _indices: new Uint16Array([0, 3, 1, 0, 2, 3]),
    _minimumHeight: 100,
    _maximumHeight: 200,
    _westIndices: [0, 1],
    _southIndices: [0, 2],
    _eastIndices: [2, 3],
    _northIndices: [1, 3],
    _childTileMask: 15,
    interpolateHeight: vi.fn(() => 151.5),
  };
  const tileXYToRectangle = (x: number, y: number, level: number) => {
    const width = (Math.PI * 2) / 2 ** (level + 1);
    const height = Math.PI / 2 ** level;
    const west = -Math.PI + x * width;
    const north = Math.PI / 2 - y * height;
    return { west, east: west + width, north, south: north - height };
  };
  const provider = {
    requestTileGeometry: vi.fn(async () => terrainData),
    getLevelMaximumGeometricError: vi.fn((level: number) => 64 / 2 ** level),
    getTileDataAvailable: vi.fn(() => true),
    tilingScheme: {
      tileXYToRectangle,
      positionToTileXY: (
        position: { longitude: number; latitude: number },
        level: number
      ) => {
        const xTiles = 2 ** (level + 1);
        const yTiles = 2 ** level;
        return {
          x: Math.min(
            xTiles - 1,
            Math.max(
              0,
              Math.floor(
                ((position.longitude + Math.PI) / (2 * Math.PI)) * xTiles
              )
            )
          ),
          y: Math.min(
            yTiles - 1,
            Math.max(
              0,
              Math.floor(((Math.PI / 2 - position.latitude) / Math.PI) * yTiles)
            )
          ),
        };
      },
    },
  };
  return { provider, terrainData };
};

describe("Cesium terrain tile source", () => {
  it("decodes and caches native quantized-mesh tiles", async () => {
    const { provider } = buildProvider();
    fromUrl.mockResolvedValueOnce(provider);
    const source = await acquireCesiumTerrainTileSource(
      "https://example.test/terrain-a"
    );

    const first = await source.requestTile({ level: 2, x: 4, y: 1 });
    const second = await source.requestTile({ level: 2, x: 4, y: 1 });

    expect(second).toBe(first);
    expect(provider.requestTileGeometry).toHaveBeenCalledTimes(1);
    expect([...first.u]).toEqual([0, 0, 1, 1]);
    expect([...first.v]).toEqual([0, 1, 0, 1]);
    expect(first.heightMeters[0]).toBeCloseTo(100);
    expect(first.heightMeters[3]).toBeCloseTo(200);
    expect([...first.indices]).toEqual([0, 3, 1, 0, 2, 3]);
    expect(first.geometricErrorMeters).toBe(16);
    expect(source.cachedTileCount).toBe(1);
  });

  it("maps bounds to the provider pyramid and samples cached heights", async () => {
    const { provider, terrainData } = buildProvider();
    fromUrl.mockResolvedValueOnce(provider);
    const source = await acquireCesiumTerrainTileSource(
      "https://example.test/terrain-b"
    );
    const ids = source.getTileIdsForBounds(
      { west: 0, south: 0, east: 20, north: 20 },
      2
    );
    expect(ids.length).toBeGreaterThan(0);

    await source.requestTile(ids[0]);
    expect(source.sampleHeight(10, 10)).toBe(151.5);
    expect(terrainData.interpolateHeight).toHaveBeenCalledOnce();
  });
});
