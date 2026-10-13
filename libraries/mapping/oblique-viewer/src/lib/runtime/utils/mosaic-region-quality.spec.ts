import { describe, expect, it, vi } from "vitest";
import type {
  ImageLevel,
  ImageLevelStack,
  ImageRect,
} from "@carma-commons/image-pyramid";
import { readMosaicRegionQuality } from "./mosaic-region-quality";

const rect = (x = 0, y = 0, width = 256, height = 256) =>
  ({ x, y, width, height } as ImageRect);
const level = (
  id: number,
  width: number,
  height = width,
  tileWidth = 128,
  tileHeight = tileWidth
): ImageLevel =>
  ({
    level: id,
    width,
    height,
    tileWidth,
    tileHeight,
    cols: Math.ceil(width / tileWidth),
    rows: Math.ceil(height / tileHeight),
  } as ImageLevel);
const bitmap = () =>
  ({ width: 128, height: 128, close: vi.fn() } as unknown as ImageBitmap);
type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
type StackFixture = {
  pyramid: Mutable<NonNullable<ImageLevelStack["pyramid"]>>;
  plan: Mutable<NonNullable<ImageLevelStack["plan"]>>;
  tile: ImageLevelStack["tile"];
};

const setup = () => {
  const resident = new Map<string, ImageBitmap>();
  const stack = {
    pyramid: {
      native: { width: 256, height: 256 },
      levels: [level(0, 256), level(1, 128)],
    },
    plan: { layers: [1, 0] },
    tile: vi.fn((id: number, col: number, row: number) =>
      resident.get(`${id}:${col}:${row}`)
    ),
  } as unknown as StackFixture;
  const put = (id: number, col = 0, row = 0, value = bitmap()) => {
    resident.set(`${id}:${col}:${row}`, value);
    return value;
  };
  const allFine = () => {
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 2; col++) put(0, col, row);
  };
  return { stack, resident, put, allFine };
};

describe("mosaic resident-region quality receipts", () => {
  it("accepts a partial finer upgrade but rejects losing any previously captured detail", () => {
    const { stack, put, resident } = setup();
    put(1);
    const coarse = readMosaicRegionQuality(stack, rect())!;
    expect(coarse.tiles.map((tile) => tile.density)).toEqual([0.5]);
    put(0);
    const upgraded = readMosaicRegionQuality(stack, rect(), coarse)!;
    expect(upgraded.tiles.map((tile) => tile.density)).toEqual([0.5, 1]);
    resident.delete("0:0:0");
    expect(readMosaicRegionQuality(stack, rect(), upgraded)).toBeNull();
    put(0);
    resident.delete("1:0:0");
    expect(readMosaicRegionQuality(stack, rect(), upgraded)).toBeNull();
  });
  it("allows a coarse region to be completely replaced by the union of finer subtiles", () => {
    const { stack, put, resident, allFine } = setup();
    put(1);
    const coarse = readMosaicRegionQuality(stack, rect())!;
    resident.clear();
    allFine();
    const next = readMosaicRegionQuality(stack, rect(), coarse)!;
    expect(next.tiles).toHaveLength(4);
    expect(next.tiles.every((tile) => tile.density === 1)).toBe(true);
    resident.delete("0:1:1");
    expect(readMosaicRegionQuality(stack, rect(), coarse)).toBeNull();
  });
  it("does not mistake overlapping areas for full coverage of a previous rectangle", () => {
    const { stack, put, resident } = setup();
    put(1);
    const coarse = readMosaicRegionQuality(stack, rect())!;
    resident.clear();
    stack.pyramid!.levels = [level(0, 256), level(1, 256)];
    put(0, 0, 0);
    put(0, 0, 1);
    put(1, 0, 0);
    put(1, 0, 1);
    expect(readMosaicRegionQuality(stack, rect(), coarse)).toBeNull();
  });
  it("clips receipts and previous coverage to the requested native ROI", () => {
    const { stack, put, resident } = setup();
    put(1);
    const previous = readMosaicRegionQuality(stack, rect())!;
    resident.clear();
    put(0);
    const next = readMosaicRegionQuality(
      stack,
      rect(20, 30, 40, 50),
      previous
    )!;
    expect(next.tiles).toEqual([
      { rect: rect(20, 30, 40, 50), density: 1, token: expect.any(Number) },
    ]);
    expect(readMosaicRegionQuality(stack, rect(300, 300, 20, 20))).toBeNull();
  });
  it("uses true last-tile dimensions rather than equal-width column estimates", () => {
    const { stack, put } = setup();
    stack.pyramid!.native = { width: 300, height: 150 } as never;
    stack.pyramid!.levels = [level(1, 150, 75, 100)];
    stack.plan!.layers = [1];
    put(1, 1, 0);
    const next = readMosaicRegionQuality(stack, rect(0, 0, 300, 150))!;
    expect(next.tiles[0]).toMatchObject({
      rect: rect(200, 0, 100, 150),
      density: 0.5,
    });
  });
  it("detects bitmap replacement but ignores statistics, compressed readiness, repeated and reordered layers", () => {
    const { stack, put } = setup();
    const first = put(1);
    put(0);
    const previous = readMosaicRegionQuality(stack, rect())!;
    Object.assign(stack, {
      metrics: { compressedBytes: 999999, requests: 42 },
    });
    stack.plan!.layers = [0, 1, 1, 0];
    expect(readMosaicRegionQuality(stack, rect(), previous)).toBeNull();
    const replacement = put(1);
    const next = readMosaicRegionQuality(stack, rect(), previous)!;
    expect(next.signature).not.toBe(previous.signature);
    expect(next.tiles).toHaveLength(2);
    expect(first.close).not.toHaveBeenCalled();
    expect(replacement.close).not.toHaveBeenCalled();
    expect(readMosaicRegionQuality(stack, rect(), next)).toBeNull();
  });
  it("returns primitive receipts without bitmap ownership or strong decoded references", () => {
    const { stack, put, resident } = setup();
    const image = put(1);
    const result = readMosaicRegionQuality(stack, rect())!;
    expect(Object.keys(result)).toEqual(["signature", "tiles"]);
    expect(Object.keys(result.tiles[0])).toEqual(["rect", "density", "token"]);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(JSON.stringify(result)).not.toContain("close");
    resident.clear();
    expect(readMosaicRegionQuality(stack, rect(), result)).toBeNull();
    expect(image.close).not.toHaveBeenCalled();
  });
  it("keeps bitmap tokens stable across sources without conflating distinct bitmap objects", () => {
    const a = setup(),
      b = setup();
    const image = a.put(1);
    b.put(1, 0, 0, image);
    const one = readMosaicRegionQuality(a.stack, rect())!;
    expect(readMosaicRegionQuality(b.stack, rect())!.signature).toBe(
      one.signature
    );
    b.put(1);
    expect(readMosaicRegionQuality(b.stack, rect())!.signature).not.toBe(
      one.signature
    );
  });
  it("rejects missing data, closed bitmaps and malformed metadata before enumerating unbounded ranges", () => {
    const { stack, put } = setup();
    expect(readMosaicRegionQuality(stack, rect())).toBeNull();
    put(1, 0, 0, { width: 0, height: 0 } as ImageBitmap);
    expect(readMosaicRegionQuality(stack, rect())).toBeNull();
    put(1);
    expect(readMosaicRegionQuality(stack, rect(0, 0, NaN, 1))).toBeNull();
    expect(readMosaicRegionQuality(stack, rect(0, 0, -1, 1))).toBeNull();
    stack.pyramid!.levels = [{ ...level(1, 128), cols: Infinity }];
    vi.mocked(stack.tile).mockClear();
    expect(readMosaicRegionQuality(stack, rect())).toBeNull();
    expect(stack.tile).not.toHaveBeenCalled();
    stack.pyramid!.levels = [level(1, 128)];
    stack.pyramid!.native = { width: 0, height: 256 } as never;
    expect(readMosaicRegionQuality(stack, rect())).toBeNull();
    expect(
      readMosaicRegionQuality({ ...stack, pyramid: undefined } as never, rect())
    ).toBeNull();
    expect(
      readMosaicRegionQuality({ ...stack, plan: undefined } as never, rect())
    ).toBeNull();
  });
});
