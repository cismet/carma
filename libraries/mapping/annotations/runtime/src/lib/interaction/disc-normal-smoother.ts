import { Vector3 } from "three";
import {
  GUIDE_NORMAL_EPSILON_SQUARED,
  getAveragedCandidateRingNormal,
  pushCandidateRingSample,
  type CandidateRingSample,
} from "@carma-mapping/annotations/core";

export type DiscNormalSmootherSettings = {
  maxSampleCount: number;
  maxSampleAgeMs: number;
  weightDecayGamma: number;
};

/** Averages the recent disc normals into a trail so the disc does not jitter. */
export const createDiscNormalSmoother = (
  readSettings: () => DiscNormalSmootherSettings
) => {
  let samples: CandidateRingSample[] = [];
  const averagedNormal = new Vector3();

  return {
    hasTrail: () => samples.length > 1,
    push: (normal: Vector3) =>
      pushCandidateRingSample({
        samples,
        normal,
        maxSampleCount: readSettings().maxSampleCount,
        timestampMs: performance.now(),
      }),
    /** The averaged normal, in a scratch vector the next call overwrites. */
    average: (fallbackNormal: Vector3) => {
      const { maxSampleAgeMs, weightDecayGamma } = readSettings();
      return getAveragedCandidateRingNormal({
        samples,
        fallbackNormal,
        result: averagedNormal,
        epsilonSquared: GUIDE_NORMAL_EPSILON_SQUARED,
        maxSampleAgeMs,
        weightDecayGamma,
        nowMs: performance.now(),
      });
    },
    clear: () => {
      samples = [];
    },
  };
};

export type DiscNormalSmoother = ReturnType<typeof createDiscNormalSmoother>;
