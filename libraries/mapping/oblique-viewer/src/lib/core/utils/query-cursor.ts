import { Matrix4, Vector3, Vector4 } from "three";
import {
  createPlaneBasisFromNormal,
  resolveWorldSizeForScreenTarget,
} from "@carma-commons/math";
import {
  TWO_PI,
  type CssPixels,
  type Milliseconds,
  type Ratio,
} from "@carma-units";

/**
 * Three.js port of the Cesium point-query cursor
 * (`createPointQueryIndicatorController` in `@carma-mapping/annotations/runtime`):
 * a ring of constant screen size lying tangent to the surface under the
 * pointer, with a short line along the surface normal. The values mirror
 * `pointPreviewRingVisualDefaults` and `ANNOTATIONS_HOST_DEFAULTS.pointQuery`.
 */
export const QUERY_CURSOR_DEFAULTS = Object.freeze({
  targetScreenRadius: 32 as CssPixels,
  innerHoleRadiusRatio: 0.33 as Ratio,
  opacity: 0.6 as Ratio,
  color: "#ffffff",
  ringSegments: 32,
  showNormalLine: true,
  normalLineWidth: 1.5 as CssPixels,
  /** Pointer offset of the four neighbour picks that span the tangent plane. */
  normalSampleOffset: 2 as CssPixels,
  /** Cesium's `trueNormalRefreshIntervalMs`: neighbour picks run less often. */
  normalRefreshInterval: 96 as Milliseconds,
  smoothing: Object.freeze({
    sampleCount: 120,
    trailWindow: 500 as Milliseconds,
    weightDecayGamma: 3,
  }),
});

/** Cesium's `GUIDE_NORMAL_EPSILON_SQUARED`. */
const NORMAL_EPSILON_SQUARED = 1e-8;
/** Cesium's `DISC_PROJECTION_SCALE_SAMPLE_COUNT`. */
const RADIUS_SAMPLE_COUNT = 16;
const MIN_PIXELS_PER_UNIT = 1e-6;

export type QueryCursorNeighbours = Readonly<{
  right: Vector3 | null;
  left: Vector3 | null;
  up: Vector3 | null;
  down: Vector3 | null;
}>;

const screenSpaceTangent = (
  center: Vector3,
  positive: Vector3 | null,
  negative: Vector3 | null
): Vector3 | null => {
  if (positive && negative) return positive.clone().sub(negative);
  if (positive) return positive.clone().sub(center);
  if (negative) return center.clone().sub(negative);
  return null;
};

/**
 * Port of `sampleSurfacePickNormalAtScreenPosition`: central differences of
 * the surface picks one offset right/left/up/down of the pointer, oriented to
 * the local up direction. Null when the picks do not span a plane.
 */
export const surfaceNormalFromNeighbours = (
  center: Vector3,
  { right, left, up, down }: QueryCursorNeighbours,
  localUp: Vector3
): Vector3 | null => {
  const tangentX = screenSpaceTangent(center, right, left);
  const tangentY = screenSpaceTangent(center, down, up);
  if (
    !tangentX ||
    !tangentY ||
    tangentX.lengthSq() <= NORMAL_EPSILON_SQUARED ||
    tangentY.lengthSq() <= NORMAL_EPSILON_SQUARED
  )
    return null;
  const normal = tangentX.cross(tangentY);
  if (!(normal.lengthSq() > NORMAL_EPSILON_SQUARED)) return null;
  normal.normalize();
  return normal.dot(localUp) < 0 ? normal.negate() : normal;
};

/**
 * Turns the normal toward the viewer. Clip `w` grows with view depth, so a
 * normal whose step increases `w` points away from the camera.
 */
export const orientNormalTowardViewer = (
  normal: Vector3,
  sceneToClip: Matrix4
): Vector3 => {
  const e = sceneToClip.elements;
  const depthStep = e[3] * normal.x + e[7] * normal.y + e[11] * normal.z;
  return depthStep > 0 ? normal.clone().negate() : normal.clone();
};

export type CssViewport = Readonly<{ width: number; height: number }>;

const projectToCss = (
  point: Vector3,
  sceneToClip: Matrix4,
  viewport: CssViewport
): { x: number; y: number } | null => {
  const clip = new Vector4(point.x, point.y, point.z, 1).applyMatrix4(
    sceneToClip
  );
  if (!(clip.w > 0)) return null;
  const x = ((clip.x / clip.w + 1) / 2) * viewport.width;
  const y = ((1 - clip.y / clip.w) / 2) * viewport.height;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

/**
 * Port of `getDiscWorldRadius`: the scene-unit radius whose largest projected
 * extent around the ring equals the target screen radius. Null when the
 * centre lies behind the camera or the projection degenerates.
 */
export const screenConstantRingRadius = ({
  center,
  normal,
  sceneToClip,
  viewport,
  targetScreenRadius = QUERY_CURSOR_DEFAULTS.targetScreenRadius,
}: {
  center: Vector3;
  normal: Vector3;
  sceneToClip: Matrix4;
  viewport: CssViewport;
  targetScreenRadius?: CssPixels;
}): number | null => {
  const anchor = projectToCss(center, sceneToClip, viewport);
  if (!anchor) return null;
  const { xAxis, yAxis } = createPlaneBasisFromNormal(normal);
  const sample = new Vector3();
  let pixelsPerUnit = 0;
  for (let index = 0; index < RADIUS_SAMPLE_COUNT; index++) {
    const angle = (index / RADIUS_SAMPLE_COUNT) * TWO_PI;
    sample
      .copy(center)
      .addScaledVector(xAxis, Math.cos(angle))
      .addScaledVector(yAxis, Math.sin(angle));
    const projected = projectToCss(sample, sceneToClip, viewport);
    if (!projected) continue;
    const distance = Math.hypot(projected.x - anchor.x, projected.y - anchor.y);
    if (Number.isFinite(distance) && distance > pixelsPerUnit)
      pixelsPerUnit = distance;
  }
  if (pixelsPerUnit <= MIN_PIXELS_PER_UNIT) return null;
  return resolveWorldSizeForScreenTarget({
    targetScreenPx: targetScreenRadius,
    pixelPerWorld: pixelsPerUnit,
    quantize: false,
  });
};

/**
 * Port of `createOrientedDiscModelMatrix`: unit ring (XY plane, +Z normal) to
 * scene, as a right-handed rotation so the ring keeps its front face.
 */
export const queryCursorRingMatrix = (
  center: Vector3,
  normal: Vector3,
  radius: number
): Matrix4 => {
  const zAxis = normal.clone().normalize();
  const { xAxis, yAxis } = createPlaneBasisFromNormal(zAxis);
  // createPlaneBasisFromNormal yields x × y = -normal; swap for a rotation.
  return new Matrix4()
    .makeBasis(yAxis, xAxis, zAxis)
    .scale(new Vector3(radius, radius, radius))
    .setPosition(center);
};

type NormalSample = { normal: Vector3; time: number };

/**
 * Port of `pushCandidateRingSample` / `getAveragedCandidateRingNormal`: a
 * time-decayed average over the recent normal trail. The newest sample always
 * stays, older samples age out after the window.
 */
export const createQueryCursorNormalSmoother = ({
  sampleCount = QUERY_CURSOR_DEFAULTS.smoothing.sampleCount,
  trailWindow = QUERY_CURSOR_DEFAULTS.smoothing.trailWindow,
  weightDecayGamma = QUERY_CURSOR_DEFAULTS.smoothing.weightDecayGamma,
}: {
  sampleCount?: number;
  trailWindow?: Milliseconds;
  weightDecayGamma?: number;
} = {}) => {
  const samples: NormalSample[] = [];
  const prune = (time: number) => {
    while (samples.length > 1 && samples[0]!.time < time - trailWindow)
      samples.shift();
  };
  return {
    push: (normal: Vector3, time: number) => {
      const incoming = normal.clone();
      const latest = samples[samples.length - 1];
      if (latest && incoming.dot(latest.normal) < 0) incoming.negate();
      samples.push({ normal: incoming, time });
      if (samples.length > sampleCount)
        samples.splice(0, samples.length - sampleCount);
    },
    latest: (): Vector3 | null =>
      samples[samples.length - 1]?.normal.clone() ?? null,
    average: (fallback: Vector3, time: number): Vector3 => {
      prune(time);
      if (!samples.length) return fallback.clone();
      const latest = samples[samples.length - 1]!;
      const gamma = Math.max(weightDecayGamma, 0.01);
      const sum = new Vector3();
      const oriented = new Vector3();
      let totalWeight = 0;
      for (const sample of samples) {
        oriented.copy(sample.normal);
        if (oriented.dot(fallback) < 0) oriented.negate();
        const age = Math.max(0, time - sample.time);
        const weight =
          sample === latest
            ? 1
            : trailWindow > 0
            ? Math.pow(Math.max(0, 1 - age / trailWindow), gamma)
            : 1;
        if (weight <= 0) continue;
        sum.addScaledVector(oriented, weight);
        totalWeight += weight;
      }
      if (totalWeight <= 0) return fallback.clone();
      sum.divideScalar(totalWeight);
      return sum.lengthSq() <= NORMAL_EPSILON_SQUARED
        ? fallback.clone()
        : sum.normalize();
    },
    /** True once only the newest sample is left, i.e. no smoothing frames are due. */
    isSettled: (time: number) => {
      prune(time);
      return samples.length <= 1;
    },
    reset: () => {
      samples.length = 0;
    },
  };
};

export type QueryCursorNormalSmoother = ReturnType<
  typeof createQueryCursorNormalSmoother
>;
