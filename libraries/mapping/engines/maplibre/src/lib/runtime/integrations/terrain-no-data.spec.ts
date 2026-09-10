import { describe, expect, it } from "vitest";
import {
  executeTerrainWorkerTask,
  terrainResultTransfers,
} from "./terrain-worker-task";
import { terrainHeightRangeExcludesNoData } from "../../core/terrain-no-data";

const partition = (heights: number[]) =>
  executeTerrainWorkerTask({
    kind: "partition",
    positions: new Float32Array([0, 1, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1]),
    indices: new Uint16Array([0, 2, 1, 1, 2, 3]),
    heights: new Float32Array(heights),
    noDataHeightMeters: 0,
  });

describe("terrain NoData worker partition", () => {
  it("keeps only complete faces and returns transferable normals and bounds", async () => {
    const result = await partition([0, 1, 1, 1]);
    if (result.kind !== "partition") throw new Error("Unexpected task result");
    expect(Array.from(result.geometry!.indices)).toEqual([1, 2, 3]);
    expect(Array.from(result.reliefVertexMask)).toEqual([0, 1, 1, 1]);
    expect(result.geometry!.normals.every(Number.isFinite)).toBe(true);
    expect(result.geometry!.sphere.radius).toBeGreaterThan(0);
    expect(terrainResultTransfers(result)).toHaveLength(4);
  });

  it("does not create a zero plane for missing coverage", async () => {
    const result = await partition([0, 0, 0, 0]);
    if (result.kind !== "partition") throw new Error("Unexpected task result");
    expect(result.geometry).toBeNull();
    expect(Array.from(result.reliefVertexMask)).toEqual([0, 0, 0, 0]);
    expect(terrainResultTransfers(result)).toHaveLength(1);
  });

  it("preserves every face when no height is missing", async () => {
    const result = await partition([1, 1, 1, 1]);
    if (result.kind !== "partition") throw new Error("Unexpected task result");
    expect(Array.from(result.geometry!.indices)).toEqual([0, 2, 1, 1, 2, 3]);
    expect(Array.from(result.reliefVertexMask)).toEqual([1, 1, 1, 1]);
  });
});

describe("decoded height range NoData proof", () => {
  it.each<[number, number, number, boolean]>([
    [100, 200, -9999, true],
    [-200, -100, 0, true],
    [100, 200, 150, false],
    [100, 200, 100, false],
    [100, 200, 200, false],
    [0.001, 200, 0, true],
    [0.0005, 200, 0, false],
    [100.001001, 200, 100, false],
    [Number.NaN, 200, -9999, false],
    [100, Number.POSITIVE_INFINITY, -9999, false],
    [200, 100, -9999, false],
  ])(
    "classifies [%s, %s] against %s as %s",
    (minimumHeightMeters, maximumHeightMeters, noData, expected) => {
      expect(
        terrainHeightRangeExcludesNoData(
          { minimumHeightMeters, maximumHeightMeters },
          noData
        )
      ).toBe(expected);
    }
  );
});
