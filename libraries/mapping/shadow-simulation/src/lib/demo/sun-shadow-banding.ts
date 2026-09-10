import { Vector3, type Camera } from "three";

import { clamp } from "@carma-commons/math";
import { degToRadNumeric } from "@carma-units";

import { SUN_ANGULAR_RADIUS_RAD } from "../runtime/shadow-controller";

export type SunShadowBanding = Readonly<{
  coherentP95Codes: number;
  coherentMaxCodes: number;
  profileRmsCodes: number;
  centerOffsetPixels: number | null;
  widthErrorPercent: number | null;
  profilePixels: number;
  passes: boolean;
}>;

/** Uniform-radiance disc marginal; a straight edge reveals a circular segment.
 * Small-angle reference (solar radius 0.265 degrees), not a limb-darkened sun.
 */
export const sunDiscEdgeVisibility = (offsetInRadii: number): number => {
  const x = clamp(offsetInRadii, -1, 1);
  return 0.5 - (Math.asin(x) + x * Math.sqrt(1 - x * x)) / Math.PI;
};

const crossing = (values: readonly number[], level: number): number | null => {
  for (let i = 1; i < values.length; i += 1) {
    if (values[i - 1] >= level && values[i] < level) {
      return i - 1 + (values[i - 1] - level) / (values[i - 1] - values[i]);
    }
  }
  return null;
};

/** Fixture-specific regression metric, NOT a perceptual/JND or CAMBI score.
 * Average parallel profiles first: coherent contour errors survive, random
 * noise does not. Measure residual curvature at 2/4/8/16/32 display pixels.
 * Report width separately so blurring/flattening cannot win the banding gate.
 * A "code" here is 1/255 solar visibility, not a final sRGB code value.
 */
export const measureSunShadowBanding = (
  profiles: readonly (readonly number[])[],
  expected: readonly number[]
): SunShadowBanding => {
  if (
    !profiles.length ||
    expected.length < 65 ||
    profiles.some((p) => p.length !== expected.length) ||
    [...expected, ...profiles.flat()].some(
      (v) => !Number.isFinite(v) || v < -1e-5 || v > 1 + 1e-5
    )
  ) {
    throw new Error(
      "Banding measurement requires finite, equal-length visibility profiles in [0,1]"
    );
  }
  const actual = expected.map(
    (_, i) =>
      profiles.reduce((sum, profile) => sum + profile[i], 0) / profiles.length
  );
  const a50 = crossing(actual, 0.5),
    e50 = crossing(expected, 0.5);
  const centerOffsetPixels = a50 === null || e50 === null ? null : a50 - e50;
  // Shadow depth/normal bias shifts the whole edge. Register translation ONLY
  // for the contour score, report the offset and unregistered RMS separately.
  // Never fit width: a broader/blurred shadow still fails the width guard.
  const residual = actual.map((value, i) => {
    const coordinate = clamp(
      i - (centerOffsetPixels ?? 0),
      0,
      expected.length - 1
    );
    const lower = Math.floor(coordinate),
      fraction = coordinate - lower;
    const reference =
      expected[lower] * (1 - fraction) +
      expected[Math.min(lower + 1, expected.length - 1)] * fraction;
    return value - reference;
  });
  let coherentP95Codes = 0;
  let coherentMaxCodes = 0;
  let squared = 0;
  let count = 0;
  for (let i = 0; i < actual.length; i += 1) {
    if (expected[i] > 0.1 && expected[i] < 0.9) {
      squared += (actual[i] - expected[i]) ** 2;
      count += 1;
    }
  }
  if (count < 64)
    throw new Error("Insufficient visible penumbra for banding measurement");
  for (const span of [2, 4, 8, 16, 32]) {
    const errors: number[] = [];
    for (let i = span; i < actual.length - span; i += 1) {
      if (expected[i] <= 0.1 || expected[i] >= 0.9) continue;
      // Translation registration must not manufacture a contour at a cropped
      // profile boundary by extending the endpoint as a constant value.
      if (
        i - span - (centerOffsetPixels ?? 0) < 0 ||
        i + span - (centerOffsetPixels ?? 0) > expected.length - 1
      )
        continue;
      errors.push(
        255 *
          Math.abs(residual[i] - (residual[i - span] + residual[i + span]) / 2)
      );
    }
    errors.sort((a, b) => a - b);
    if (errors.length) {
      coherentP95Codes = Math.max(
        coherentP95Codes,
        errors[Math.floor((errors.length - 1) * 0.95)]
      );
      coherentMaxCodes = Math.max(coherentMaxCodes, errors[errors.length - 1]);
    }
  }
  const a10 = crossing(actual, 0.1),
    a90 = crossing(actual, 0.9);
  const e10 = crossing(expected, 0.1),
    e90 = crossing(expected, 0.9);
  const widthErrorPercent =
    a10 === null || a90 === null || e10 === null || e90 === null
      ? null
      : 100 * ((a10 - a90) / (e10 - e90) - 1);
  return {
    coherentP95Codes,
    coherentMaxCodes,
    profileRmsCodes: 255 * Math.sqrt(squared / count),
    centerOffsetPixels,
    widthErrorPercent,
    profilePixels: count,
    // Explicit engineering acceptance target, not an established human threshold.
    passes:
      coherentP95Codes <= 0.5 &&
      coherentMaxCodes <= 1 &&
      widthErrorPercent !== null &&
      Math.abs(widthErrorPercent) <= 5,
  };
};

/** Read nine parallel receiver profiles, away from plate corners. Float image
 * uses bottom-left WebGL origin; bilinear readback is measurement only and
 * never filters the rendered output. Each profile step spans one display pixel.
 */
export const measurePlateShadowBanding = (
  pixels: Float32Array,
  camera: Camera,
  width: number,
  height: number,
  options: Readonly<{ distanceMeters: number; elevationDegrees: number }>
): SunShadowBanding => {
  if (pixels.length !== width * height * 4)
    throw new Error("Image dimensions differ");
  const elevation = degToRadNumeric(options.elevationDegrees);
  const casterHeight = options.distanceMeters + 0.25;
  const edge = -2 - casterHeight / Math.tan(elevation);
  const project = (x: number, z: number) => {
    const point = new Vector3(x, 0, z).project(camera);
    return [
      ((point.x + 1) * width) / 2 - 0.5,
      ((point.y + 1) * height) / 2 - 0.5,
    ];
  };
  const origin = project(edge, 0),
    unit = project(edge + 1, 0);
  const pixelsPerMeter = Math.hypot(unit[0] - origin[0], unit[1] - origin[1]);
  const radius =
    (casterHeight * SUN_ANGULAR_RADIUS_RAD) / Math.sin(elevation) ** 2;
  const steps = Math.ceil(radius * 2.4 * pixelsPerMeter);
  const profiles: number[][] = Array.from({ length: 9 }, () => []);
  const expected: number[] = [];
  const read = (point: number[]) => {
    const [x, y] = point,
      ix = Math.floor(x),
      iy = Math.floor(y);
    const tx = x - ix,
      ty = y - iy;
    const value = (dx: number, dy: number) =>
      pixels[((iy + dy) * width + ix + dx) * 4];
    return (
      (1 - ty) * ((1 - tx) * value(0, 0) + tx * value(1, 0)) +
      ty * ((1 - tx) * value(0, 1) + tx * value(1, 1))
    );
  };
  for (let i = 0; i <= steps; i += 1) {
    const x = edge + (i - steps / 2) / pixelsPerMeter;
    const points = profiles.map((_, j) => project(x, (j - 4) * 0.1));
    if (
      points.some(
        ([px, py]) => px < 0 || py < 0 || px >= width - 1 || py >= height - 1
      )
    )
      continue;
    const cutoff = Math.atan2(casterHeight, -2 - x);
    expected.push(
      sunDiscEdgeVisibility((cutoff - elevation) / SUN_ANGULAR_RADIUS_RAD)
    );
    points.forEach((point, j) => profiles[j].push(read(point)));
  }
  return measureSunShadowBanding(profiles, expected);
};
