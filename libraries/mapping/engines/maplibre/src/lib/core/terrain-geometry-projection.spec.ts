import { Box3 } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getGeodeticPatchBounds } from "@carma-geo/proj";
import { createTerrainGeodeticProjection } from "./terrain-geometry-projection";

vi.mock("@carma-geo/proj", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@carma-geo/proj")>();
  return {
    ...actual,
    getGeodeticPatchBounds: vi.fn(actual.getGeodeticPatchBounds),
  };
});

const bounds = { west: 7.1, south: 51.2, east: 7.2, north: 51.3 };
const heights = [0, 500] as const;

beforeEach(() => vi.clearAllMocks());

describe("terrain geodetic envelopes", () => {
  it("reuses equal numeric inputs without sharing mutable output boxes", () => {
    const projection = createTerrainGeodeticProjection([7.15, 51.25]);
    const first = projection.bounds(bounds, heights);
    const expected = first.clone();
    first.makeEmpty();
    const target = new Box3();
    expect(projection.bounds({ ...bounds }, [...heights], target)).toBe(target);
    expect(target.equals(expected)).toBe(true);
    expect(getGeodeticPatchBounds).toHaveBeenCalledTimes(1);
  });

  it("recomputes after in-place geographic, height or reference-frame changes", () => {
    const projection = createTerrainGeodeticProjection([7.15, 51.25]);
    const mutableBounds = { ...bounds };
    const mutableHeights: [number, number] = [...heights];
    const original = projection.bounds(mutableBounds, mutableHeights);
    mutableBounds.east += 0.1;
    expect(
      projection.bounds(mutableBounds, mutableHeights).equals(original)
    ).toBe(false);
    mutableHeights[1] += 100;
    const beforeFrameChange = projection.bounds(mutableBounds, mutableHeights);
    projection.localFromEcef.elements[12] += 100;
    const afterFrameChange = projection.bounds(mutableBounds, mutableHeights);
    expect(afterFrameChange.min.x - beforeFrameChange.min.x).toBeCloseTo(100);
    expect(getGeodeticPatchBounds).toHaveBeenCalledTimes(4);
    expect(
      afterFrameChange.equals(
        getGeodeticPatchBounds(
          mutableBounds,
          mutableHeights,
          projection.localFromEcef
        )
      )
    ).toBe(true);
  });

  it("evicts the least recently queried envelope at the bounded capacity", () => {
    const projection = createTerrainGeodeticProjection([7.15, 51.25]);
    for (let index = 0; index < 512; index++)
      projection.bounds(bounds, [index, index + 500]);
    const first = projection.bounds(bounds, [0, 500]);
    projection.bounds(bounds, [512, 1012]);
    expect(projection.bounds(bounds, [0, 500]).equals(first)).toBe(true);
    expect(getGeodeticPatchBounds).toHaveBeenCalledTimes(513);
    projection.bounds(bounds, [1, 501]);
    expect(getGeodeticPatchBounds).toHaveBeenCalledTimes(514);
  });

  it("does not retain invalid geographic queries", () => {
    const projection = createTerrainGeodeticProjection([7.15, 51.25]);
    const wrapped = { ...bounds, west: 170, east: -170 };
    expect(() => projection.bounds(wrapped, heights)).toThrow(RangeError);
    expect(() => projection.bounds(wrapped, heights)).toThrow(RangeError);
    expect(getGeodeticPatchBounds).toHaveBeenCalledTimes(2);
  });
});
