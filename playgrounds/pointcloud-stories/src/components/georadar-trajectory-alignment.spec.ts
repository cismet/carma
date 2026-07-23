import { describe, expect, it } from "vitest";

import {
  applyTrajectoryLocalOffsets,
  calculateTrajectorySliceFrames,
} from "./georadar-trajectory-alignment";

const centerline: [number, number][] = [
  [-2, 0],
  [0, 1],
  [2, 0],
];

describe("Georadar slice sweep frames", () => {
  it("centers every curved slice on the delivered T0 centerline", () => {
    const frames = calculateTrajectorySliceFrames({
      mode: "surface-curve",
      centerline,
      origin: [0, 0],
      alongEastNorth: [1, 0],
      acrossEastNorth: [0, 1],
      sliceMeters: [0, 2, 4],
      surfaceOffsetsMeters: [0.2, 0.4, 0.1],
    });

    expect(frames.map(({ centerUtm }) => centerUtm)).toEqual(centerline);
    expect(
      frames.map(({ surfaceOffsetMeters }) => surfaceOffsetMeters)
    ).toEqual([0.2, 0.4, 0.1]);
  });

  it("keeps the transverse axis consistently oriented", () => {
    const frames = calculateTrajectorySliceFrames({
      mode: "surface-curve",
      centerline,
      origin: [0, 0],
      alongEastNorth: [1, 0],
      acrossEastNorth: [0, 1],
      sliceMeters: [0, 2, 4],
      surfaceOffsetsMeters: [0, 0, 0],
    });

    for (const frame of frames) {
      expect(frame.acrossEastNorth[1]).toBeGreaterThan(0);
      expect(Math.hypot(...frame.acrossEastNorth)).toBeCloseTo(1, 6);
    }
  });

  it("keeps straight and surface modes on the rigid reference axis", () => {
    const surface = calculateTrajectorySliceFrames({
      mode: "surface",
      centerline,
      origin: [10, 20],
      alongEastNorth: [1, 0],
      acrossEastNorth: [0, 1],
      sliceMeters: [0, 2, 4],
      surfaceOffsetsMeters: [0.2, 0.4, 0.1],
    });
    const straight = calculateTrajectorySliceFrames({
      mode: "straight",
      centerline,
      origin: [10, 20],
      alongEastNorth: [1, 0],
      acrossEastNorth: [0, 1],
      sliceMeters: [0, 2, 4],
      surfaceOffsetsMeters: [0.2, 0.4, 0.1],
    });

    expect(surface.map(({ centerUtm }) => centerUtm)).toEqual([
      [8, 20],
      [10, 20],
      [12, 20],
    ]);
    expect(
      surface.map(({ surfaceOffsetMeters }) => surfaceOffsetMeters)
    ).toEqual([0.2, 0.4, 0.1]);
    expect(
      straight.every(({ surfaceOffsetMeters }) => surfaceOffsetMeters === 0)
    ).toBe(true);
  });

  it("moves slices to shifted stations along the spine without moving the spine", () => {
    const frames = calculateTrajectorySliceFrames({
      mode: "surface-curve",
      centerline,
      origin: [0, 0],
      alongEastNorth: [1, 0],
      acrossEastNorth: [0, 1],
      sliceMeters: [0, 2, 4],
      surfaceOffsetsMeters: [0.2, 0.4, 0.1],
    });
    const originalCenters = frames.map(({ centerUtm }) => [...centerUtm]);
    const shifted = applyTrajectoryLocalOffsets(frames, [0, 2, 4], {
      forward: 1,
      down: 0.5,
      right: 0,
    });

    expect(shifted[0].centerUtm).toEqual([-1, 0.5]);
    expect(shifted[1].centerUtm).toEqual([1, 0.5]);
    expect(shifted[0].surfaceOffsetMeters).toBeCloseTo(-0.2, 6);
    expect(shifted[1].surfaceOffsetMeters).toBeCloseTo(-0.25, 6);
    expect(frames.map(({ centerUtm }) => centerUtm)).toEqual(originalCenters);
  });
});
