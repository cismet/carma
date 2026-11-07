import { Vector3 } from "three";

export type CandidateRingSample = {
  normalX: number;
  normalY: number;
  normalZ: number;
  timestampMs: number;
};

const SAMPLE_NORMAL_SCRATCH = new Vector3();
const REFERENCE_NORMAL_SCRATCH = new Vector3();

const orientNormalTowardReference = (
  normal: Vector3,
  reference: Vector3
): Vector3 => {
  if (normal.dot(reference) < 0) {
    return normal.negate();
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
  normal: Vector3;
  maxSampleCount: number;
  timestampMs?: number;
}) => {
  const incoming = SAMPLE_NORMAL_SCRATCH.copy(normal);
  if (samples.length > 0) {
    const lastSample = samples[samples.length - 1];
    if (lastSample) {
      orientNormalTowardReference(
        incoming,
        REFERENCE_NORMAL_SCRATCH.set(
          lastSample.normalX,
          lastSample.normalY,
          lastSample.normalZ
        )
      );
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
  fallbackNormal: Vector3;
  result: Vector3;
  epsilonSquared: number;
  maxSampleAgeMs: number;
  weightDecayWindowMs?: number;
  weightDecayGamma?: number;
  nowMs?: number;
}): Vector3 => {
  const cutoffTimestamp = nowMs - Math.max(0, maxSampleAgeMs);
  // The newest sample stays as the stable target after pointer input stops;
  // only older samples age out, else the smoothed normal would keep a trail.
  while (samples.length > 1 && samples[0]!.timestampMs < cutoffTimestamp) {
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

  const latestSample = samples[samples.length - 1]!;
  for (const sample of samples) {
    SAMPLE_NORMAL_SCRATCH.set(sample.normalX, sample.normalY, sample.normalZ);
    orientNormalTowardReference(SAMPLE_NORMAL_SCRATCH, fallbackNormal);
    const sampleAgeMs = Math.max(0, nowMs - sample.timestampMs);
    const sampleWeight =
      sample === latestSample
        ? 1
        : effectiveWeightDecayWindowMs > 0
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
    return result.copy(fallbackNormal);
  }

  const inverseTotalWeight = 1 / totalWeight;

  result.set(
    sumNormalX * inverseTotalWeight,
    sumNormalY * inverseTotalWeight,
    sumNormalZ * inverseTotalWeight
  );

  if (result.lengthSq() <= epsilonSquared) {
    result.copy(fallbackNormal);
  } else {
    result.normalize();
    orientNormalTowardReference(result, fallbackNormal);
  }

  return result;
};
