import { Cartesian3 } from "@carma-cesium";

export type CandidateRingSample = {
  normalX: number;
  normalY: number;
  normalZ: number;
  timestampMs: number;
};

export type PreviewRingSample = CandidateRingSample;

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

export const pushPreviewRingSample = pushCandidateRingSample;

export const getAveragedCandidateRingNormal = ({
  samples,
  fallbackNormal,
  result,
  epsilonSquared,
  maxSampleAgeMs,
  nowMs = performance.now(),
}: {
  samples: CandidateRingSample[];
  fallbackNormal: Cartesian3;
  result: Cartesian3;
  epsilonSquared: number;
  maxSampleAgeMs: number;
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

  for (const sample of samples) {
    SAMPLE_NORMAL_SCRATCH.x = sample.normalX;
    SAMPLE_NORMAL_SCRATCH.y = sample.normalY;
    SAMPLE_NORMAL_SCRATCH.z = sample.normalZ;
    orientNormalTowardReference(SAMPLE_NORMAL_SCRATCH, fallbackNormal);
    sumNormalX += SAMPLE_NORMAL_SCRATCH.x;
    sumNormalY += SAMPLE_NORMAL_SCRATCH.y;
    sumNormalZ += SAMPLE_NORMAL_SCRATCH.z;
  }

  const sampleCount = Math.max(1, samples.length);
  const inverseSampleCount = 1 / sampleCount;

  result.x = sumNormalX * inverseSampleCount;
  result.y = sumNormalY * inverseSampleCount;
  result.z = sumNormalZ * inverseSampleCount;

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

export const getAveragedPreviewRingNormal = getAveragedCandidateRingNormal;
