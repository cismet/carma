import { describe, expect, it, vi } from "vitest";

import {
  createTiledVerticalOffsetModel,
  type Float32VerticalOffsetTile,
  InvalidVerticalOffsetTileError,
  UnsupportedVerticalOffsetRegionError,
  VerticalOffsetTileLoadError,
} from "./tiled-vertical-offset";

const encode = (values: number[]) => {
  const bytes = new Uint8Array(new Float32Array(values).buffer);
  return btoa(String.fromCharCode(...bytes));
};

interface TileOptions {
  grid?: Partial<Float32VerticalOffsetTile["grid"]>;
  valueAt?: (sourceColumn: number, sourceRow: number) => number;
}

const tile = (
  id: string,
  bounds: [number, number, number, number],
  options: TileOptions = {}
): Float32VerticalOffsetTile => {
  const grid = {
    firstLongitude: 0.25,
    firstLatitude: 0.25,
    stepLongitude: 0.5,
    stepLatitude: 0.5,
    columnStart: 0,
    rowStart: 0,
    width: 8,
    height: 8,
    noDataValue: -32_768,
    ...options.grid,
  };
  const valueAt =
    options.valueAt ??
    ((sourceColumn: number, sourceRow: number) =>
      sourceColumn + 10 * sourceRow);
  const values = Array.from(
    { length: grid.width * grid.height },
    (_, index) => {
      const column = grid.columnStart + (index % grid.width);
      const row = grid.rowStart + Math.floor(index / grid.width);
      return valueAt(column, row);
    }
  );

  return {
    format: "carma-gcg2016-float32-tile-v2",
    id,
    bounds,
    grid,
    values: {
      encoding: "base64-float32-little-endian",
      data: encode(values),
    },
  };
};

describe("createTiledVerticalOffsetModel", () => {
  it("loads once and applies the five-by-five natural bicubic spline", async () => {
    const loader = vi.fn(async () =>
      tile("N00E000", [0, 0, 4, 4], {
        valueAt: (column, row) => column ** 3 + 2 * row ** 3,
      })
    );
    const model = createTiledVerticalOffsetModel({
      supportedRegion: { west: 0, south: 0, east: 4, north: 4 },
      rootTileSizeDegrees: 4,
      tileLoaders: { N00E000: loader },
    });

    await expect(model.getOffset(1.375, 1.5)).resolves.toBeCloseTo(
      42.67745535714286,
      12
    );
    await model.getOffset(1.375, 1.5);
    expect(loader).toHaveBeenCalledOnce();
    expect(model.cachedTileCount).toBe(1);
  });

  it("prefetches the current tile and available neighbors", async () => {
    const center = vi.fn(async () => tile("N00E000", [0, 0, 4, 4]));
    const east = vi.fn(async () =>
      tile("N00E004", [4, 0, 8, 4], {
        grid: { columnStart: 8 },
      })
    );
    const model = createTiledVerticalOffsetModel({
      supportedRegion: { west: 0, south: 0, east: 8, north: 4 },
      rootTileSizeDegrees: 4,
      tileLoaders: { N00E000: center, N00E004: east },
    });

    await model.prefetch(2, 2, 1);
    expect(center).toHaveBeenCalledOnce();
    expect(east).toHaveBeenCalledOnce();
    expect(model.cachedTileCount).toBe(2);
  });

  it("rejects coordinates outside the region, incomplete stencils, and NoData", async () => {
    const model = createTiledVerticalOffsetModel({
      supportedRegion: { west: 0, south: 0, east: 4, north: 4 },
      rootTileSizeDegrees: 4,
      tileLoaders: {
        N00E000: async () =>
          tile("N00E000", [0, 0, 4, 4], {
            valueAt: (column, row) =>
              column === 2 && row === 2 ? -32_768 : column + 10 * row,
          }),
      },
    });

    await expect(model.getOffset(4, 2)).rejects.toBeInstanceOf(
      UnsupportedVerticalOffsetRegionError
    );
    await expect(model.getOffset(0.1, 2)).rejects.toBeInstanceOf(
      UnsupportedVerticalOffsetRegionError
    );
    await expect(model.getOffset(1.375, 1.5)).rejects.toBeInstanceOf(
      UnsupportedVerticalOffsetRegionError
    );
  });

  it("loads only the requested tile and propagates failures", async () => {
    const needed = vi.fn(async () => tile("N00E000", [0, 0, 4, 4]));
    const unused = vi.fn(async () =>
      tile("N00E004", [4, 0, 8, 4], {
        grid: { columnStart: 8 },
      })
    );
    const model = createTiledVerticalOffsetModel({
      supportedRegion: { west: 0, south: 0, east: 8, north: 4 },
      rootTileSizeDegrees: 4,
      tileLoaders: { N00E000: needed, N00E004: unused },
    });

    await model.getOffset(1.375, 1.5);
    expect(needed).toHaveBeenCalledOnce();
    expect(unused).not.toHaveBeenCalled();

    const failing = createTiledVerticalOffsetModel({
      supportedRegion: { west: 0, south: 0, east: 4, north: 4 },
      rootTileSizeDegrees: 4,
      tileLoaders: {
        N00E000: async () => {
          throw new Error("network unavailable");
        },
      },
    });
    const failure = await failing.getOffset(2, 2).catch((error) => error);
    expect(failure).toBeInstanceOf(VerticalOffsetTileLoadError);
    expect(failure).toMatchObject({
      tileId: "N00E000",
      cause: expect.objectContaining({ message: "network unavailable" }),
    });
  });

  it("rejects malformed resources and retries after the failed load", async () => {
    const loader = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce({
        ...tile("N00E000", [0, 0, 4, 4]),
        values: {
          encoding: "base64-float32-little-endian",
          data: "not base64",
        },
      })
      .mockResolvedValueOnce(tile("N00E000", [0, 0, 4, 4]));
    const model = createTiledVerticalOffsetModel({
      supportedRegion: { west: 0, south: 0, east: 4, north: 4 },
      rootTileSizeDegrees: 4,
      tileLoaders: { N00E000: loader },
    });

    await expect(model.getOffset(1.375, 1.5)).rejects.toBeInstanceOf(
      InvalidVerticalOffsetTileError
    );
    await expect(model.getOffset(1.375, 1.5)).resolves.toBeCloseTo(27.25, 12);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("accepts a zero prefetch radius and rejects invalid radii", async () => {
    const loader = vi.fn(async () => tile("N00E000", [0, 0, 4, 4]));
    const model = createTiledVerticalOffsetModel({
      supportedRegion: { west: 0, south: 0, east: 4, north: 4 },
      rootTileSizeDegrees: 4,
      tileLoaders: { N00E000: loader },
    });

    await expect(model.prefetch(2, 2, 0)).resolves.toBeUndefined();
    await expect(model.prefetch(2, 2, -1)).rejects.toThrow(
      "finite non-negative"
    );
  });

  it("loads a neighboring tile only when the spline stencil crosses its border", async () => {
    const west = vi.fn(async () => tile("N00E000", [0, 0, 4, 4]));
    const east = vi.fn(async () =>
      tile("N00E004", [4, 0, 8, 4], {
        grid: { columnStart: 8 },
      })
    );
    const model = createTiledVerticalOffsetModel({
      supportedRegion: { west: 0, south: 0, east: 8, north: 4 },
      rootTileSizeDegrees: 4,
      tileLoaders: { N00E000: west, N00E004: east },
    });

    await expect(model.getOffset(1.375, 1.5)).resolves.toBeCloseTo(27.25, 12);
    expect(east).not.toHaveBeenCalled();

    await expect(model.getOffset(3.75, 1.5)).resolves.toBeCloseTo(32, 12);
    expect(west).toHaveBeenCalledOnce();
    expect(east).toHaveBeenCalledOnce();
  });
});
