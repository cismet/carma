import { describe, expect, it } from "vitest";
import {
  stabilizeMapLibrePitchDeg,
  stabilizeMapLibreViewTarget,
} from "./viewUtils";

describe("stabilizeMapLibrePitchDeg", () => {
  it("keeps a tiny positive epsilon at nadir to avoid bearing collapse", () => {
    const pitchDeg = stabilizeMapLibrePitchDeg(0);

    expect(pitchDeg).toBeGreaterThan(0);
    expect(pitchDeg).toBeLessThan(0.001);
  });

  it("preserves finite pitched views above the stabilization epsilon", () => {
    expect(stabilizeMapLibrePitchDeg(42)).toBeCloseTo(42, 12);
  });

  it("still clamps to the configured maximum pitch", () => {
    expect(stabilizeMapLibrePitchDeg(90, { maxPitchDeg: 85 })).toBeCloseTo(
      85,
      12
    );
  });
});

describe("stabilizeMapLibreViewTarget", () => {
  it("only adjusts nadir pitch while preserving center, zoom, and bearing", () => {
    const target = stabilizeMapLibreViewTarget({
      center: [7.17662, 51.25503],
      zoom: 14.93,
      bearing: 0,
      pitch: 0,
    });

    expect(target.center).toEqual([7.17662, 51.25503]);
    expect(target.zoom).toBeCloseTo(14.93, 12);
    expect(target.bearing).toBeCloseTo(0, 12);
    expect(target.pitch).toBeGreaterThan(0);
    expect(target.pitch).toBeLessThan(0.001);
  });
});
