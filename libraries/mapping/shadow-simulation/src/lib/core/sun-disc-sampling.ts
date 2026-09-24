import { degToRadNumeric } from "@carma-units";

export const SUN_ANGULAR_RADIUS_RAD = degToRadNumeric(0.53 / 2);

const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5));

/** Deterministic equal-area spiral on the apparent solar disc. */
export const getSunDiscSampleOffset = (round: number, sampleCount: number) => {
  const count = Math.max(1, Math.floor(sampleCount));
  const index = ((Math.floor(round) % count) + count) % count;
  const angularRadius =
    SUN_ANGULAR_RADIUS_RAD * Math.sqrt((index + 0.5) / count);
  const angle = index * GOLDEN_ANGLE_RAD;
  return {
    angularRadius,
    tangentA: Math.cos(angle) * angularRadius,
    tangentB: Math.sin(angle) * angularRadius,
  };
};
