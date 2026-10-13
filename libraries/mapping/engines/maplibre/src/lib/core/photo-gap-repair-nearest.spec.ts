import { describe, expect, it } from "vitest";
import {
  repairPhotoGapsNearest,
  type PhotoGapRepairNearestInput,
} from "./photo-gap-repair-nearest";

const raster = (
  width: number,
  height: number,
  position = (x: number, y: number) => [x, y, 0]
) => {
  const positions = new Float32Array(width * height * 4);
  const photograph = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      positions.set([...position(x, y), 1], (y * width + x) * 4);
  return { width, height, positions, photograph };
};
const donor = (
  input: ReturnType<typeof raster>,
  x: number,
  y: number,
  alpha = 255
) => {
  const index = y * input.width + x;
  input.photograph.set([31, 63, 127, alpha], index * 4);
  return index;
};

describe("metric photo gap donors", () => {
  it("repairs only intersection receivers while keeping outside donors and surface neighbours", () => {
    const input = raster(7, 3);
    const outsideDonor = donor(input, 0, 1);
    const inside = 1 * 7 + 3;
    input.positions[inside * 4 + 3] = 2;
    const originalPositions = input.positions.slice();
    const result = repairPhotoGapsNearest({ ...input, intersectionOnly: true });
    expect(result.donorIndices[inside]).toBe(outsideDonor);
    expect(result.donorIndices[outsideDonor]).toBe(outsideDonor);
    expect(result.donorIndices[1 * 7 + 2]).toBe(-1);
    expect(result.donorIndices[1 * 7 + 4]).toBe(-1);
    expect(result.statistics.validPixels).toBe(21);
    expect(result.statistics.normalPixels).toBe(21);
    expect(result.statistics.surfaceComponents).toBe(1);
    expect(result.statistics.missingPixels).toBe(1);
    expect(result.statistics.repairedPixels).toBe(1);
    expect(result.statistics.unresolvedPixels).toBe(0);
    expect(result.surfaceAndDonorPositions[(1 * 7 + 2) * 4 + 3]).toBe(1);
    expect(input.positions).toEqual(originalPositions);
  });

  it("does not fill a disjoint intersection but preserves the optional legacy scope", () => {
    const input = raster(3, 3);
    donor(input, 0, 1);
    const result = repairPhotoGapsNearest({ ...input, intersectionOnly: true });
    expect(result.statistics.missingPixels).toBe(0);
    expect(result.statistics.repairedPixels).toBe(0);
    expect(result.donorIndices[4]).toBe(-1);
    expect(repairPhotoGapsNearest(input).donorIndices[4]).toBe(3);
  });

  it("chooses the world-nearest donor even when it is farther away in the raster", () => {
    const xs = [0, 10, 11, 12, 0.5];
    const input = raster(5, 3, (x, y) => [xs[x], y, 0]);
    donor(input, 1, 1);
    const closer = donor(input, 4, 1);
    const result = repairPhotoGapsNearest(input);
    expect(result.donorIndices[5]).toBe(closer);
    expect([...result.donorCoordinates.slice(20, 24)]).toEqual([5, 0, 2, 0]);
    expect([...result.surfaceAndDonorPositions.slice(20, 24)]).toEqual([
      0, 1, 0, 1,
    ]);
    expect([
      ...result.surfaceAndDonorPositions.slice(60 + 20, 60 + 24),
    ]).toEqual([0.5, 1, 0, 1]);
    expect(result.surfaceAndDonorPositions[60 + closer * 4 + 3]).toBe(0);
  });

  it("does not propagate photograph colour around a roof/facade right angle", () => {
    const input = raster(7, 5, (x, y) => (x <= 3 ? [x, y, 0] : [3, y, x - 3]));
    donor(input, 6, 2);
    const result = repairPhotoGapsNearest(input);
    expect(result.donorIndices[2 * 7 + 1]).toBe(-1);
    expect(result.donorIndices[2 * 7 + 5]).toBe(2 * 7 + 6);
    expect(result.statistics.surfaceComponents).toBeGreaterThanOrEqual(2);
  });

  it("never promotes repaired pixels into donors beyond the original radius", () => {
    const input = raster(5, 3, (x, y) => [x * 10, y, 0]);
    const original = donor(input, 0, 1, 1);
    const before = input.photograph.slice();
    const result = repairPhotoGapsNearest(input);
    expect(result.donorIndices[1 * 5 + 2]).toBe(original);
    expect(result.donorIndices[1 * 5 + 3]).toBe(-1);
    expect(result.donorIndices[1 * 5 + 4]).toBe(-1);
    expect(result.statistics.donorPixels).toBe(1);
    expect(result.surfaceAndDonorPositions[60 + (1 * 5 + 2) * 4 + 3]).toBe(1);
    expect(result.surfaceAndDonorPositions[60 + (1 * 5 + 3) * 4 + 3]).toBe(0);
    expect([
      ...new Set([...result.donorIndices].filter((v) => v >= 0)),
    ]).toEqual([original]);
    expect(input.photograph).toEqual(before);
  });

  it("rejects incompatible endpoint normals across a locally connected bend", () => {
    const input = raster(33, 3, (x, y) => [
      10 * Math.sin(x * 0.05),
      y,
      10 * (1 - Math.cos(x * 0.05)),
    ]);
    donor(input, 30, 1);
    const result = repairPhotoGapsNearest(input);
    expect(result.statistics.surfaceComponents).toBe(1);
    expect(result.donorIndices[33]).toBe(-1);
  });

  it("continues the exact search after rejecting a nearer parallel endpoint on a folded surface", () => {
    const input = raster(75, 3, (x, y) =>
      x <= 10
        ? [x - 10, y, 0]
        : [
            3 * Math.sin(((x - 10) * Math.PI) / 64),
            y,
            3 * (1 - Math.cos(((x - 10) * Math.PI) / 64)),
          ]
    );
    const coplanar = donor(input, 0, 1);
    donor(input, 74, 1);
    const result = repairPhotoGapsNearest(input);
    expect(result.statistics.surfaceComponents).toBe(1);
    // The far endpoint is only6m away but lies on a different parallel plane;
    // the original coplanar donor10m away must win instead.
    expect(result.donorIndices[75 + 10]).toBe(coplanar);
  });

  it("includes exactly20 metres but excludes donors outside the configurable radius", () => {
    const input = raster(3, 3, (x, y) => [x * 10, y, 0]);
    const original = donor(input, 0, 1);
    expect(repairPhotoGapsNearest(input).donorIndices[5]).toBe(original);
    expect(
      repairPhotoGapsNearest({ ...input, radiusMeters: 19.99 }).donorIndices[5]
    ).toBe(-1);
  });

  it("breaks equal metric distances by original raster index", () => {
    const input = raster(5, 3);
    const first = donor(input, 0, 1);
    donor(input, 4, 1);
    const result = repairPhotoGapsNearest(input);
    expect(result.donorIndices[7]).toBe(first);
    expect(repairPhotoGapsNearest(input).donorCoordinates).toEqual(
      result.donorCoordinates
    );
  });

  it("keeps disconnected coplanar patches separate across missing geometry", () => {
    const input = raster(7, 4);
    for (let y = 0; y < 4; y++) input.positions[(y * 7 + 3) * 4 + 3] = 0;
    donor(input, 1, 2);
    const result = repairPhotoGapsNearest(input);
    expect(result.donorIndices[2 * 7 + 5]).toBe(-1);
    expect(result.donorIndices[2 * 7 + 2]).toBe(2 * 7 + 1);
  });

  it("uses the plane tolerance to separate parallel surfaces with a height step", () => {
    const input = raster(8, 5, (x, y) => [x, y, x < 4 ? 0 : 0.5]);
    donor(input, 6, 2);
    expect(
      repairPhotoGapsNearest({
        ...input,
        normalDotThreshold: 0.85,
        planeToleranceMeters: 0.1,
      }).donorIndices[17]
    ).toBe(-1);
    expect(
      repairPhotoGapsNearest({
        ...input,
        normalDotThreshold: 0.85,
        planeToleranceMeters: 0.6,
      }).donorIndices[17]
    ).toBe(22);
  });

  it("matches a brute-force metric oracle across a nonuniform plane", () => {
    const input = raster(17, 11, (x, y) => [x * x * 0.09, y * 0.37, 3]);
    const sources = [
      donor(input, 0, 0),
      donor(input, 4, 7),
      donor(input, 11, 2),
      donor(input, 16, 10),
    ];
    const result = repairPhotoGapsNearest(input);
    for (let i = 0; i < input.width * input.height; i++) {
      if (sources.includes(i)) continue;
      const expected =
        sources
          .map((index) => ({
            index,
            d: [0, 1, 2].reduce(
              (sum, axis) =>
                sum +
                (input.positions[index * 4 + axis] -
                  input.positions[i * 4 + axis]) **
                  2,
              0
            ),
          }))
          .filter(({ d }) => d <= 400)
          .sort((a, b) => a.d - b.d || a.index - b.index)[0]?.index ?? -1;
      expect(result.donorIndices[i]).toBe(expected);
    }
  });

  it("packs uint16 donor coordinates without wrapping at255", () => {
    const input = raster(258, 3);
    const original = donor(input, 256, 1);
    const result = repairPhotoGapsNearest(input);
    expect(result.donorIndices[258 + 257]).toBe(original);
    expect([
      ...result.donorCoordinates.slice((258 + 257) * 4, (258 + 258) * 4),
    ]).toEqual([1, 1, 2, 0]);
  });

  it("handles absent, truncated and nonfinite buffers without inventing donors", () => {
    expect(repairPhotoGapsNearest(null).donorCoordinates).toHaveLength(0);
    const input = raster(3, 3);
    donor(input, 1, 1);
    input.positions[4 * 4] = NaN;
    expect(repairPhotoGapsNearest(input).statistics.donorPixels).toBe(0);
    expect(
      repairPhotoGapsNearest({ ...input, positions: null }).donorIndices
    ).toEqual(new Int32Array(9).fill(-1));
    expect(
      repairPhotoGapsNearest({
        ...input,
        positions: new Float32Array(3),
        photograph: null,
      }).statistics.validPixels
    ).toBe(0);
  });

  it("does not extrapolate a surface normal from a line or singleton", () => {
    const line = raster(3, 1);
    donor(line, 0, 0);
    expect([...repairPhotoGapsNearest(line).donorIndices]).toEqual([0, -1, -1]);
    const point = raster(1, 1);
    donor(point, 0, 0);
    expect([...repairPhotoGapsNearest(point).donorCoordinates]).toEqual([
      1, 0, 1, 0,
    ]);
  });

  it.each([
    { width: -1 },
    { width: 65536 },
    { width: 2048, height: 2048 },
    { radiusMeters: -1 },
    { planeToleranceMeters: NaN },
    { normalDotThreshold: 1.01 },
  ])("rejects unsafe dimensions or tolerances: %o", (options) => {
    expect(() =>
      repairPhotoGapsNearest({
        ...raster(2, 2),
        ...options,
      } as PhotoGapRepairNearestInput)
    ).toThrow(RangeError);
  });
});
