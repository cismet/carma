import { Cartesian3 } from "@carma-cesium";
import { describe, expect, it } from "vitest";

import {
  getAveragedCandidateRingNormal,
  pushCandidateRingSample,
} from "./candidate-ring-normal-smoothing";

describe("candidateRingNormalSmoothing", () => {
  it("weights newer samples more strongly as they age through the decay window", () => {
    const samples = [] as Array<{
      normalX: number;
      normalY: number;
      normalZ: number;
      timestampMs: number;
    }>;
    const fallbackNormal = new Cartesian3(0, 1, 0);
    const result = new Cartesian3();

    pushCandidateRingSample({
      samples,
      normal: new Cartesian3(1, 0, 0),
      maxSampleCount: 4,
      timestampMs: 0,
    });
    pushCandidateRingSample({
      samples,
      normal: new Cartesian3(0, 1, 0),
      maxSampleCount: 4,
      timestampMs: 80,
    });

    const averagedNormal = getAveragedCandidateRingNormal({
      samples,
      fallbackNormal,
      result,
      epsilonSquared: 1e-8,
      maxSampleAgeMs: 120,
      weightDecayWindowMs: 120,
      nowMs: 100,
    });

    expect(averagedNormal.y).toBeGreaterThan(averagedNormal.x);
    expect(averagedNormal.y).toBeGreaterThan(0.9);
    expect(averagedNormal.x).toBeLessThan(0.4);
  });

  it("keeps the latest sample as the stable target after its decay window", () => {
    const samples = [] as Array<{
      normalX: number;
      normalY: number;
      normalZ: number;
      timestampMs: number;
    }>;
    const fallbackNormal = new Cartesian3(0, 0, 1);
    const result = new Cartesian3();

    pushCandidateRingSample({
      samples,
      normal: new Cartesian3(1, 0, 0),
      maxSampleCount: 4,
      timestampMs: 0,
    });

    const averagedNormal = getAveragedCandidateRingNormal({
      samples,
      fallbackNormal,
      result,
      epsilonSquared: 1e-8,
      maxSampleAgeMs: 200,
      weightDecayWindowMs: 50,
      nowMs: 50,
    });

    expect(averagedNormal.x).toBe(1);
    expect(averagedNormal.y).toBe(0);
    expect(averagedNormal.z).toBe(0);
    expect(samples).toHaveLength(1);
  });

  it("converges to only the latest sample after pointer input stops", () => {
    const samples = [] as Array<{
      normalX: number;
      normalY: number;
      normalZ: number;
      timestampMs: number;
    }>;
    const result = new Cartesian3();

    pushCandidateRingSample({
      samples,
      normal: new Cartesian3(1, 0, 0),
      maxSampleCount: 4,
      timestampMs: 0,
    });
    pushCandidateRingSample({
      samples,
      normal: new Cartesian3(0, 1, 0),
      maxSampleCount: 4,
      timestampMs: 80,
    });

    const averagedNormal = getAveragedCandidateRingNormal({
      samples,
      fallbackNormal: new Cartesian3(0, 0, 1),
      result,
      epsilonSquared: 1e-8,
      maxSampleAgeMs: 120,
      weightDecayWindowMs: 120,
      nowMs: 201,
    });

    expect(samples).toHaveLength(1);
    expect(averagedNormal.x).toBe(0);
    expect(averagedNormal.y).toBe(1);
    expect(averagedNormal.z).toBe(0);
  });

  it("lets callers bias the smoothing more strongly toward newer samples via gamma", () => {
    const samples = [] as Array<{
      normalX: number;
      normalY: number;
      normalZ: number;
      timestampMs: number;
    }>;
    const fallbackNormal = new Cartesian3(0, 1, 0);
    const linearResult = new Cartesian3();
    const gammaResult = new Cartesian3();

    pushCandidateRingSample({
      samples,
      normal: new Cartesian3(1, 0, 0),
      maxSampleCount: 4,
      timestampMs: 0,
    });
    pushCandidateRingSample({
      samples,
      normal: new Cartesian3(0, 1, 0),
      maxSampleCount: 4,
      timestampMs: 80,
    });

    getAveragedCandidateRingNormal({
      samples,
      fallbackNormal,
      result: linearResult,
      epsilonSquared: 1e-8,
      maxSampleAgeMs: 120,
      weightDecayWindowMs: 120,
      weightDecayGamma: 1,
      nowMs: 100,
    });

    getAveragedCandidateRingNormal({
      samples,
      fallbackNormal,
      result: gammaResult,
      epsilonSquared: 1e-8,
      maxSampleAgeMs: 120,
      weightDecayWindowMs: 120,
      weightDecayGamma: 2,
      nowMs: 100,
    });

    expect(gammaResult.y).toBeGreaterThan(linearResult.y);
    expect(gammaResult.x).toBeLessThan(linearResult.x);
  });
});
