import { describe, expect, it } from "vitest";
import type { ObliqueDataset, ObliqueImageRecord, ObliquePose } from "../types";
import { getOrComputeObliquePose } from "./oblique-pose";

describe("catalog camera pose reuse", () => {
  it("returns a precomputed catalog pose without touching calibration", () => {
    const pose: ObliquePose = {
      longitude: 7.2,
      latitude: 51.27,
      z: 800,
      bearingDeg: 324.8,
      pitchDeg: 45,
      rollDeg: 0.2,
      direction: [0, 0, -1],
      up: [0, 1, 0],
      utmConvergenceRad: 0,
    };
    const record = { pose } as ObliqueImageRecord;

    expect(getOrComputeObliquePose(record, {} as ObliqueDataset)).toBe(pose);
  });

  it("derives a missing pose once and stores it on the record", () => {
    const record = {
      id: "series::image",
      cameraId: "camera",
      centerWGS84: [7.2, 51.27, 800],
      x: 370000,
      y: 5680000,
      z: 800,
      m: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    } as ObliqueImageRecord;
    const dataset = {
      id: "series",
      cameras: {
        camera: {
          upMapping: { rowIndex: 1, negate: false },
          imageUpInCamera: [0, 1, 0],
        },
      },
    } as unknown as ObliqueDataset;

    const first = getOrComputeObliquePose(record, dataset);
    const second = getOrComputeObliquePose(record, dataset);

    expect(first).toBe(second);
    expect(record.pose).toBe(first);
    expect(first.direction.every(Number.isFinite)).toBe(true);
    expect(first.up.every(Number.isFinite)).toBe(true);
  });
});
