import { Cartesian3 } from "@carma-cesium";

export type CandidateRingSample = {
  normalX: number;
  normalY: number;
  normalZ: number;
  timestampMs: number;
};

const SAMPLE_NORMAL_SCRATCH = new Cartesian3();
const REFERENCE_NORMAL_SCRATCH = new Cartesian3();

const orientNormalTowardReference = (
  normal: Cartesian3,
  reference: Cartesian3
): Cartesian3 => {
  if (Cartesian3.dot(normal, reference) < 0) {
    return Cartesian3.negate(normal, normal);
  }
  return normal;
};

export const pushCandidateRingSample = ({
  samples,
  normal,
  maxSampleCount,
  timestampMs = performance.now(),
}: {
  samples: CandidateRingSample[];
  normal: Cartesian3;
  maxSampleCount: number;
  timestampMs?: number;
}) => {
  const incoming = Cartesian3.clone(normal, SAMPLE_NORMAL_SCRATCH);
  if (samples.length > 0) {
    const lastSample = samples[samples.length - 1];
    if (lastSample) {
      REFERENCE_NORMAL_SCRATCH.x = lastSample.normalX;
      REFERENCE_NORMAL_SCRATCH.y = lastSample.normalY;
      REFERENCE_NORMAL_SCRATCH.z = lastSample.normalZ;
      orientNormalTowardReference(incoming, REFERENCE_NORMAL_SCRATCH);
    }
  }

  samples.push({
    normalX: incoming.x,
    normalY: incoming.y,
    normalZ: incoming.z,
    timestampMs,
  });

  const overflowCount = samples.length - maxSampleCount;
  if (overflowCount > 0) {
    samples.splice(0, overflowCount);
  }
};

export const getAveragedCandidateRingNormal = ({
  samples,
  fallbackNormal,
  result,
  epsilonSquared,
  maxSampleAgeMs,
  weightDecayWindowMs = maxSampleAgeMs,
  weightDecayGamma = 1,
  nowMs = performance.now(),
}: {
  samples: CandidateRingSample[];
  fallbackNormal: Cartesian3;
  result: Cartesian3;
  epsilonSquared: number;
  maxSampleAgeMs: number;
  weightDecayWindowMs?: number;
  weightDecayGamma?: number;
  nowMs?: number;
}): Cartesian3 => {
  const cutoffTimestamp = nowMs - Math.max(0, maxSampleAgeMs);
  while (samples.length > 0 && samples[0]!.timestampMs < cutoffTimestamp) {
    samples.shift();
  }

  if (samples.length === 0) {
    return fallbackNormal;
  }

  let sumNormalX = 0;
  let sumNormalY = 0;
  let sumNormalZ = 0;
  let totalWeight = 0;
  const effectiveWeightDecayWindowMs = Math.max(0, weightDecayWindowMs);
  const effectiveWeightDecayGamma = Math.max(weightDecayGamma, 0.01);

  for (const sample of samples) {
    SAMPLE_NORMAL_SCRATCH.x = sample.normalX;
    SAMPLE_NORMAL_SCRATCH.y = sample.normalY;
    SAMPLE_NORMAL_SCRATCH.z = sample.normalZ;
    orientNormalTowardReference(SAMPLE_NORMAL_SCRATCH, fallbackNormal);
    const sampleAgeMs = Math.max(0, nowMs - sample.timestampMs);
    const sampleWeight =
      effectiveWeightDecayWindowMs > 0
        ? Math.pow(
            Math.max(0, 1 - sampleAgeMs / effectiveWeightDecayWindowMs),
            effectiveWeightDecayGamma
          )
        : 1;

    if (sampleWeight <= 0) {
      continue;
    }

    sumNormalX += SAMPLE_NORMAL_SCRATCH.x * sampleWeight;
    sumNormalY += SAMPLE_NORMAL_SCRATCH.y * sampleWeight;
    sumNormalZ += SAMPLE_NORMAL_SCRATCH.z * sampleWeight;
    totalWeight += sampleWeight;
  }

  if (totalWeight <= 0) {
    result.x = fallbackNormal.x;
    result.y = fallbackNormal.y;
    result.z = fallbackNormal.z;
    return result;
  }

  const inverseTotalWeight = 1 / totalWeight;

  result.x = sumNormalX * inverseTotalWeight;
  result.y = sumNormalY * inverseTotalWeight;
  result.z = sumNormalZ * inverseTotalWeight;

  if (Cartesian3.magnitudeSquared(result) <= epsilonSquared) {
    result.x = fallbackNormal.x;
    result.y = fallbackNormal.y;
    result.z = fallbackNormal.z;
  } else {
    Cartesian3.normalize(result, result);
    orientNormalTowardReference(result, fallbackNormal);
  }

  return result;
};
