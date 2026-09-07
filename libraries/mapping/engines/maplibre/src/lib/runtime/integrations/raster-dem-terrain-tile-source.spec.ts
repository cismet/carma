import { afterEach, describe, expect, it, vi } from "vitest";

import { acquireRasterDemTerrainTileSource } from "./raster-dem-terrain-tile-source";
import { buildGridTile, decodeRasterDemHeight } from "./raster-dem-tile";

describe("raster DEM terrain tile source", () => {
  it("preserves asymmetric row/column samples including Terrarium blue-channel fractions", () => {
    const pixels = new Uint8ClampedArray(4 * 3 * 4);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 4; x++)
        pixels.set([128, 100 + y * 10, x * 31, 255], (y * 4 + x) * 4);
    }
    const tile = buildGridTile(
      { level: 15, x: 17023, y: 10926 },
      { width: 4, height: 3, pixels },
      4,
      1
    );
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 4; x++) {
        expect(tile.heightMeters[(y + 1) * 6 + x + 1]).toBe(
          100 + y * 10 + (x * 31) / 256
        );
      }
    }
  });
  it("includes every coarse edge breakpoint in the neighboring finer edge", () => {
    const raster = {
      width: 4,
      height: 4,
      pixels: new Uint8ClampedArray(4 * 4 * 4).fill(128),
    };
    const coarse = buildGridTile({ level: 1, x: 1, y: 0 }, raster, 4, 1);
    const fine = buildGridTile({ level: 2, x: 2, y: 2 }, raster, 4, 1);
    const fineEdge = [...fine.northIndices].map((i) => fine.u[i]);
    for (const index of coarse.southIndices) {
      const childCoordinate = coarse.u[index] * 2;
      if (childCoordinate > 1) continue;
      expect(
        fineEdge.some((value) => Math.abs(value - childCoordinate) < 1e-6)
      ).toBe(true);
    }
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes Terrarium elevations", () => {
    expect(decodeRasterDemHeight(128, 0, 0)).toBe(0);
    expect(decodeRasterDemHeight(128, 100, 128)).toBe(100.5);
  });

  it("uses XYZ tile bounds and builds a skirtless height grid", async () => {
    const pixels = new Uint8ClampedArray([
      128, 100, 0, 255, 128, 101, 0, 255, 128, 102, 0, 255, 128, 103, 0, 255,
    ]);
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 2, height: 2, close }))
    );
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        constructor(readonly width: number, readonly height: number) {}
        getContext() {
          return {
            drawImage: vi.fn(),
            getImageData: () => ({ data: pixels }),
          };
        }
      }
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(),
      }))
    );
    const source = await acquireRasterDemTerrainTileSource(
      {
        id: "test-grid",
        url: "https://example.test/{z}/{x}/{y}.png",
        tileSize: 2,
        minzoom: 0,
        maxzoom: 2,
        encoding: "terrarium",
        bounds: [-180, -85, 180, 85],
      },
      { meshSegments: 2 }
    );

    const tile = await source.requestTile({ level: 1, x: 1, y: 1 });

    expect(fetch).toHaveBeenCalledWith("https://example.test/1/1/1.png", {
      signal: undefined,
    });
    expect(tile.bounds.west).toBe(0);
    expect(tile.bounds.east).toBe(180);
    expect(tile.heightMeters).toHaveLength(16);
    expect(tile.indices).toHaveLength(54);
    expect(tile.westIndices).toEqual(new Uint32Array([0, 4, 8, 12]));
    // Native samples stay at pixel centers; only the outer ring is stitched.
    expect([...tile.u.slice(4, 8)]).toEqual([0, 0.25, 0.75, 1]);
    expect([
      tile.heightMeters[5],
      tile.heightMeters[6],
      tile.heightMeters[9],
      tile.heightMeters[10],
    ]).toEqual([100, 101, 102, 103]);
    const firstPixelLatitude =
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * 1.25) / 2))) * 180) / Math.PI;
    expect(source.sampleHeight(45, firstPixelLatitude)).toBeCloseTo(100, 8);
    expect(tile.minimumHeightMeters).toBe(100);
    expect(tile.maximumHeightMeters).toBe(103);
    expect(close).toHaveBeenCalledOnce();
  });
});
