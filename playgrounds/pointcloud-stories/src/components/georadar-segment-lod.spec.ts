import { describe, expect, it } from "vitest";

import {
  buildGeoradarLodSliceIndices,
  buildGeoradarLodSampleWindows,
  buildGeoradarRenderSegments,
  selectGeoradarLodStep,
} from "./georadar-segment-lod";

describe("buildGeoradarRenderSegments", () => {
  it("builds contiguous physical segments with one shared boundary anchor", () => {
    const sliceMeters = Array.from({ length: 27 }, (_, index) => index);
    const segments = buildGeoradarRenderSegments(sliceMeters, 10);

    expect(segments).toHaveLength(3);
    expect(
      segments.map(({ sliceStart, sliceEndExclusive }) => [
        sliceStart,
        sliceEndExclusive,
      ])
    ).toEqual([
      [0, 11],
      [10, 21],
      [20, 27],
    ]);
  });

  it("keeps irregular station boundaries close to the requested length", () => {
    const segments = buildGeoradarRenderSegments(
      [0, 2.9, 6.1, 9.8, 13.2, 16.2, 19.9, 23.1],
      10
    );

    expect(
      segments.map(({ stationMaximumMeters }) => stationMaximumMeters)
    ).toEqual([9.8, 19.9, 23.1]);
  });

  it("partitions the delivered 258.25 m station profile into 26 segments", () => {
    const sliceMeters = Array.from(
      { length: 3515 },
      (_, index) => (index / 3514) * 258.25196617242716
    );
    const segments = buildGeoradarRenderSegments(sliceMeters, 10);

    expect(segments).toHaveLength(26);
    expect(segments[0].sliceStart).toBe(0);
    expect(segments.at(-1)!.sliceEndExclusive).toBe(3515);
    for (let index = 1; index < segments.length; index += 1) {
      expect(segments[index].sliceStart).toBe(
        segments[index - 1].sliceEndExclusive - 1
      );
    }
  });
});

describe("buildGeoradarLodSliceIndices", () => {
  it("always retains both segment endpoints", () => {
    expect(buildGeoradarLodSliceIndices(10, 18, 4)).toEqual([10, 14, 17]);
  });

  it("keeps shared endpoints exact while covering every native sample", () => {
    expect(buildGeoradarLodSampleWindows([10, 14, 17], 10, 18)).toEqual([
      { start: 10, end: 11 },
      { start: 11, end: 17 },
      { start: 17, end: 18 },
    ]);
  });
});

describe("selectGeoradarLodStep", () => {
  it("selects the coarsest power-of-two step below the pixel target", () => {
    expect(
      selectGeoradarLodStep({
        maximumNativeIntervalPixels: 0.08,
        targetIntervalPixels: 0.8,
      })
    ).toBe(8);
    expect(
      selectGeoradarLodStep({
        maximumNativeIntervalPixels: 1.2,
        targetIntervalPixels: 0.8,
      })
    ).toBe(1);
  });

  it("uses hysteresis when crossing an LOD boundary", () => {
    expect(
      selectGeoradarLodStep({
        maximumNativeIntervalPixels: 0.09,
        targetIntervalPixels: 0.8,
        previousStep: 8,
      })
    ).toBe(8);
    expect(
      selectGeoradarLodStep({
        maximumNativeIntervalPixels: 0.12,
        targetIntervalPixels: 0.8,
        previousStep: 8,
      })
    ).toBe(4);
  });
});
