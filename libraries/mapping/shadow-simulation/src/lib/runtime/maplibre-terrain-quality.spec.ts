import { describe, expect, it, vi } from "vitest";
import { Map as MapLibreMap } from "maplibre-gl";

import { SHADOW_TERRAIN_QUALITY } from "../contracts/shadow-simulation";
import { applyMapLibreTerrainQuality } from "./maplibre-terrain-quality";

describe("applyMapLibreTerrainQuality", () => {
  it.each([
    [SHADOW_TERRAIN_QUALITY.STANDARD, 1, 1024, 128, 0],
    [SHADOW_TERRAIN_QUALITY.HIGH, 0, 512, 128, 0],
    [SHADOW_TERRAIN_QUALITY.MAX, 0, 512, 128, 1],
    [SHADOW_TERRAIN_QUALITY.ULTRA, 0, 512, 128, 2],
    [SHADOW_TERRAIN_QUALITY.EXTREME, 0, 512, 128, 3],
  ] as const)(
    "applies and restores the %s terrain LOD",
    (
      quality,
      expectedDelta,
      expectedTileSize,
      expectedMeshSize,
      expectedPrivateZoomOffset
    ) => {
      const freeRtt = vi.fn();
      const source: { calculateTileZoom?: (...args: number[]) => number } = {};
      const terrain = {
        meshSize: 128,
        _meshCache: { old: {} },
        tileManager: {
          deltaZoom: 1,
          tileSize: 1024,
          tileManager: { tileSize: 1024, _source: source },
          freeRtt,
        },
      };

      const initializeNativeTileLod = vi.fn(() => {
        // Exercise MapLibre's actual public API without allocating a map/GL
        // context. Its five-argument adaptive implementation stays upstream.
        MapLibreMap.prototype.setSourceTileLodParams.call(
          {
            getSource: () => source,
            _update: vi.fn(),
          } as unknown as MapLibreMap,
          9.314,
          3,
          "terrain"
        );
      });
      const restore = applyMapLibreTerrainQuality(
        terrain,
        512,
        quality,
        initializeNativeTileLod
      );

      expect(terrain.tileManager.deltaZoom).toBe(expectedDelta);
      expect(terrain.tileManager.tileSize).toBe(expectedTileSize);
      expect(terrain.tileManager.tileManager.tileSize).toBe(expectedTileSize);
      expect(terrain.meshSize).toBe(expectedMeshSize);
      expect(terrain._meshCache).toEqual({});
      if (expectedPrivateZoomOffset > 0) {
        const calculate = source.calculateTileZoom!;
        const near = calculate(15, 1, 1, Math.SQRT2, 36.87);
        const far = calculate(15, 20, 1, Math.SQRT2, 36.87);
        expect(near).toBeCloseTo(14.8260895 + expectedPrivateZoomOffset, 6);
        expect(far).toBeLessThan(near - 5);
        expect(initializeNativeTileLod).toHaveBeenCalledOnce();
      } else {
        expect(initializeNativeTileLod).not.toHaveBeenCalled();
      }

      restore();
      expect(terrain.tileManager.deltaZoom).toBe(1);
      expect(terrain.tileManager.tileSize).toBe(1024);
      expect(terrain.tileManager.tileManager.tileSize).toBe(1024);
      expect(terrain.meshSize).toBe(128);
      expect(
        terrain.tileManager.tileManager._source.calculateTileZoom
      ).toBeUndefined();
      expect(freeRtt).toHaveBeenCalledTimes(2);
    }
  );

  it("preserves a custom adaptive hook and forwards all LOD inputs", () => {
    const original = vi.fn(() => 8.25);
    const source = { calculateTileZoom: original };
    const terrain = {
      tileManager: {
        deltaZoom: 1,
        tileSize: 1024,
        tileManager: { tileSize: 1024, _source: source },
      },
    };
    const initialize = vi.fn();
    const restore = applyMapLibreTerrainQuality(
      terrain,
      512,
      SHADOW_TERRAIN_QUALITY.MAX,
      initialize
    );
    const args = [15, 20, 1, Math.SQRT2, 36.87];
    expect(source.calculateTileZoom(...args)).toBe(9.25);
    expect(original).toHaveBeenCalledWith(...args);
    expect(initialize).not.toHaveBeenCalled();
    restore();
    expect(source.calculateTileZoom).toBe(original);
  });

  it("keeps native adaptive LOD when the public initializer is unavailable", () => {
    const source: { calculateTileZoom?: (...args: number[]) => number } = {};
    const terrain = {
      tileManager: {
        deltaZoom: 1,
        tileSize: 1024,
        tileManager: { tileSize: 1024, _source: source },
      },
    };
    applyMapLibreTerrainQuality(terrain, 512, SHADOW_TERRAIN_QUALITY.MAX);
    expect(source.calculateTileZoom).toBeUndefined();
  });

  it.each(Object.values(SHADOW_TERRAIN_QUALITY))(
    "keeps the complete %s terrain mesh within the Uint16 index range",
    (quality) => {
      const terrain = {
        // Also repair an existing unsafe grid after a quality update/HMR.
        meshSize: 256,
        _meshCache: { stale: {} },
        tileManager: {
          deltaZoom: 1,
          tileSize: 1024,
          tileManager: { tileSize: 1024 },
        },
      };

      applyMapLibreTerrainQuality(terrain, 512, quality);

      // Terrain.getTerrainMesh creates (n+1)^2 interior vertices and six
      // frame vertices per edge step. Zero skirt height does not omit them.
      const vertexCount = (terrain.meshSize + 1) * (terrain.meshSize + 7);
      // Do not reach WebGL2's Uint16 primitive-restart index either.
      expect(vertexCount - 1).toBeLessThan(2 ** 16 - 1);
      expect(terrain._meshCache).toEqual({});
    }
  );

  it("is inert when MapLibre changes the private terrain shape", () => {
    expect(() =>
      applyMapLibreTerrainQuality({}, 512, SHADOW_TERRAIN_QUALITY.MAX)()
    ).not.toThrow();
  });
});
