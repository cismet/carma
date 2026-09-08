import { describe, expect, it } from "vitest";
import {
  decodeTerrainHeightMetadata,
  encodeTerrainHeightMetadata,
  mergeTerrainHeightMetadata,
} from "./terrain-height-metadata";

describe("source-LOD terrain height metadata", () => {
  it("roundtrips exact extrema independently of geometry, origin and error target in 40 bytes per tile", () => {
    const ranges = new Map<string, readonly [number, number]>([
      ["16/34000/21800", [123.00390625, 321.99609375]],
    ]);
    const data = encodeTerrainHeightMetadata(ranges);
    expect(data.byteLength).toBe(40);
    expect(decodeTerrainHeightMetadata(data)).toEqual(ranges);
  });
  it("merges observations conservatively without confusing pyramid levels", () => {
    const result = decodeTerrainHeightMetadata(
      mergeTerrainHeightMetadata(
        new Float64Array([15, 17000, 10900, 100, 200]),
        new Float64Array([
          15, 17000, 10900, 120, 240, 16, 34000, 21800, 150, 350,
        ])
      )
    );
    expect(result.get("15/17000/10900")).toEqual([100, 240]);
    expect(result.get("16/34000/21800")).toEqual([150, 350]);
    expect(result.has("16/34001/21800")).toBe(false);
  });
  it.each([
    null,
    {},
    new Float32Array(5),
    new Float64Array([1, 0, 0, 3]),
    new Float64Array([1, 0, 0, 3, NaN]),
    new Float64Array([1, 5, 0, 1, 2]),
    new Float64Array([1, 0, 0, 3, 2]),
  ])("rejects incomplete or corrupt records", (value) => {
    expect(decodeTerrainHeightMetadata(value).size).toBe(0);
  });
});
