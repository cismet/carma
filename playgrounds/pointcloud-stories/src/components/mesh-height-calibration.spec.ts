import { describe, expect, it } from "vitest";

import {
  averageMeshHeightSamplesByControlPoint,
  calculateMeshHeightErrorMetrics,
  calculateMeshHeightResiduals,
  type MeshHeightSample,
} from "./mesh-height-calibration";

const samples: MeshHeightSample[] = [
  {
    annotationId: "a",
    controlPointId: 1,
    sampledEllipsoidalHeight: 100.1,
    officialEllipsoidalHeight: 100,
  },
  {
    annotationId: "b",
    controlPointId: 2,
    sampledEllipsoidalHeight: 199.8,
    officialEllipsoidalHeight: 200,
  },
];

describe("mesh height calibration", () => {
  it("uses sampled minus official as the signed residual", () => {
    expect(
      calculateMeshHeightResiduals(samples).map(({ residualMeters }) =>
        Number(residualMeters.toFixed(3))
      )
    ).toEqual([0.1, -0.2]);
  });

  it("summarizes live vertical error without horizontal claims", () => {
    const metrics = calculateMeshHeightErrorMetrics(samples)!;
    expect(metrics).toMatchObject({
      count: 2,
      sampleCount: 2,
    });
    expect(metrics.meanBiasMeters).toBeCloseTo(-0.05);
    expect(metrics.meanAbsoluteErrorMeters).toBeCloseTo(0.15);
    expect(metrics.minimumResidualMeters).toBeCloseTo(-0.2);
    expect(metrics.maximumResidualMeters).toBeCloseTo(0.1);
    expect(calculateMeshHeightErrorMetrics([])).toBeNull();
  });

  it("averages repeat samples per control before global statistics", () => {
    const repeated = [
      samples[0],
      { ...samples[0], annotationId: "a2", sampledEllipsoidalHeight: 99.9 },
      samples[1],
    ];
    expect(averageMeshHeightSamplesByControlPoint(repeated)).toHaveLength(2);
    const metrics = calculateMeshHeightErrorMetrics(repeated)!;
    expect(metrics).toMatchObject({
      count: 2,
      sampleCount: 3,
    });
    expect(metrics.meanBiasMeters).toBeCloseTo(-0.1);
  });
});
