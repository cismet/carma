import { Matrix4, Vector3 } from "three";
import { createPlaneBasisFromNormal } from "@carma-commons/math";
import {
  getLocalUpDirectionAtAnchor,
  readEnuAxesAtEcef,
} from "@carma-geo/proj";
import { TWO_PI } from "@carma-units";

export const GUIDE_NORMAL_EPSILON_SQUARED = 1e-8;
const DISC_MIN_WORLD_RADIUS = 1e-3;
const DISC_MIN_PROJECTED_PIXEL_PER_WORLD = 1e-6;
const DISC_PROJECTION_SCALE_SAMPLE_COUNT = 16;

/** Projects an ECEF position to screen pixels; keeps the disc maths engine-neutral. */
type ScreenPointProjector = (
  positionECEF: Vector3
) => { x: number; y: number } | null;

const resolveHealthyDiscNormalCandidate = (
  normal: Vector3 | null | undefined
): Vector3 | null =>
  !normal || normal.lengthSq() <= GUIDE_NORMAL_EPSILON_SQUARED
    ? null
    : normal.clone().normalize();

/** The preferred normal, flipped toward the fallback normal or, without one, toward the local up. */
export const resolveStableDiscNormal = (
  origin: Vector3,
  preferredNormal: Vector3 | null | undefined,
  fallbackNormal?: Vector3 | null
): Vector3 => {
  const preferredCandidate = resolveHealthyDiscNormalCandidate(preferredNormal);
  const fallbackCandidate = resolveHealthyDiscNormalCandidate(fallbackNormal);
  if (preferredCandidate) {
    if (fallbackCandidate && preferredCandidate.dot(fallbackCandidate) < 0) {
      return preferredCandidate.negate();
    }
    if (preferredCandidate.dot(getLocalUpDirectionAtAnchor(origin)) < 0) {
      return preferredCandidate.negate();
    }
    return preferredCandidate;
  }
  if (fallbackCandidate) {
    return fallbackCandidate;
  }
  return getLocalUpDirectionAtAnchor(origin);
};

/** Unit disc in the XY plane with +Z normal, scaled by the radius and placed at the origin. */
export const createOrientedDiscMatrix = (
  origin: Vector3,
  planeNormal: Vector3,
  radius: number,
  out: Matrix4 = new Matrix4()
): Matrix4 => {
  const safeRadius = Math.max(radius, DISC_MIN_WORLD_RADIUS);
  const normal = planeNormal.clone().normalize();
  const { xAxis, yAxis } = createPlaneBasisFromNormal(normal);
  return out
    .makeBasis(xAxis, yAxis, normal)
    .scale(new Vector3(safeRadius, safeRadius, 1))
    .setPosition(origin);
};

/**
 * Fixes the disc's free rotation around its surface normal so one tangent
 * axis lies in the local horizontal plane. On level ground, where this
 * intersection has no preferred direction, X is east and Y is north.
 */
export const createEnuOrientedDiscMatrix = (
  origin: Vector3,
  planeNormal: Vector3,
  radius: number,
  out: Matrix4 = new Matrix4()
): Matrix4 => {
  const { east, up } = readEnuAxesAtEcef(origin);
  const normal = resolveHealthyDiscNormalCandidate(planeNormal) ?? up.clone();
  const horizontal = up.clone().cross(normal);
  if (horizontal.lengthSq() <= Number.EPSILON * Number.EPSILON) {
    horizontal.copy(east).addScaledVector(normal, -east.dot(normal));
  }
  horizontal.normalize();
  const tangent = normal.clone().cross(horizontal).normalize();
  const safeRadius = Math.max(radius, DISC_MIN_WORLD_RADIUS);
  return out
    .makeBasis(horizontal, tangent, normal)
    .scale(new Vector3(safeRadius, safeRadius, 1))
    .setPosition(origin);
};

/**
 * The configured world radius, or with a screen target the world radius whose
 * largest projected extent equals that screen radius.
 */
export const getDiscWorldRadius = (
  projectToScreen: ScreenPointProjector,
  origin: Vector3,
  planeNormal: Vector3,
  configuredWorldRadius: number,
  fixedScreenRadiusPx?: number
): number => {
  const baseRadius = Math.max(configuredWorldRadius, DISC_MIN_WORLD_RADIUS);
  if (fixedScreenRadiusPx === undefined) {
    return baseRadius;
  }
  const anchorScreen = projectToScreen(origin);
  if (!anchorScreen) {
    return baseRadius;
  }
  const { xAxis, yAxis } = createPlaneBasisFromNormal(planeNormal);
  const sample = new Vector3();
  let pixelPerWorldMax = 0;
  for (let index = 0; index < DISC_PROJECTION_SCALE_SAMPLE_COUNT; index += 1) {
    const t = (index / DISC_PROJECTION_SCALE_SAMPLE_COUNT) * TWO_PI;
    sample
      .copy(origin)
      .addScaledVector(xAxis, Math.cos(t))
      .addScaledVector(yAxis, Math.sin(t));
    const sampleScreen = projectToScreen(sample);
    if (!sampleScreen) continue;
    const distance = Math.hypot(
      sampleScreen.x - anchorScreen.x,
      sampleScreen.y - anchorScreen.y
    );
    if (Number.isFinite(distance) && distance > pixelPerWorldMax) {
      pixelPerWorldMax = distance;
    }
  }
  if (pixelPerWorldMax <= DISC_MIN_PROJECTED_PIXEL_PER_WORLD) {
    return baseRadius;
  }
  return Math.max(
    fixedScreenRadiusPx / pixelPerWorldMax,
    DISC_MIN_WORLD_RADIUS
  );
};
