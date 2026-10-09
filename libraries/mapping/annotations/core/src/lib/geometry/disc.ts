import { Matrix4, Vector3 } from "three";
import { createPlaneBasisFromNormal } from "@carma-commons/math";

import { getLocalUpDirectionAtAnchor } from "./ecef";

/**
 * Tangent-disc helpers ported from the Cesium `GuidePrimitives` helpers:
 * the disc normal policy, the oriented unit-disc matrix and the world radius
 * that keeps a disc at a constant screen size. Projection comes in as a
 * callback so the maths stays engine-neutral.
 */

/** Cesium's `GUIDE_NORMAL_EPSILON_SQUARED`. */
export const GUIDE_NORMAL_EPSILON_SQUARED = 1e-8;
/** Cesium's `DISC_MIN_WORLD_RADIUS`. */
export const DISC_MIN_WORLD_RADIUS = 1e-3;
const DISC_MIN_PROJECTED_PIXEL_PER_WORLD = 1e-6;
const DISC_PROJECTION_SCALE_SAMPLE_COUNT = 16;

export type ScreenPointProjector = (
  positionECEF: Vector3
) => { x: number; y: number } | null;

/** Port of `createPlaneBasis`; the shared implementation lives in commons/math. */
export const createPlaneBasis = (
  normal: Vector3
): { xAxis: Vector3; yAxis: Vector3 } => createPlaneBasisFromNormal(normal);

const resolveHealthyDiscNormalCandidate = (
  normal: Vector3 | null | undefined
): Vector3 | null =>
  !normal || normal.lengthSq() <= GUIDE_NORMAL_EPSILON_SQUARED
    ? null
    : normal.clone().normalize();

/** Port of `resolveDiscNormal`. */
export const resolveDiscNormal = (
  origin: Vector3,
  preferredNormal: Vector3 | null | undefined
): Vector3 =>
  resolveHealthyDiscNormalCandidate(preferredNormal) ??
  getLocalUpDirectionAtAnchor(origin);

/**
 * Port of `resolveStableDiscNormal`: the preferred normal, flipped toward the
 * fallback normal or, without one, toward the local up.
 */
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

/**
 * Port of `createOrientedDiscModelMatrix`: unit disc in the XY plane with +Z
 * normal, scaled by the radius and placed at the origin.
 */
export const createOrientedDiscMatrix = (
  origin: Vector3,
  planeNormal: Vector3,
  radius: number,
  out: Matrix4 = new Matrix4()
): Matrix4 => {
  const safeRadius = Math.max(radius, DISC_MIN_WORLD_RADIUS);
  const normal = planeNormal.clone().normalize();
  const { xAxis, yAxis } = createPlaneBasis(normal);
  return out
    .makeBasis(xAxis, yAxis, normal)
    .scale(new Vector3(safeRadius, safeRadius, 1))
    .setPosition(origin);
};

/**
 * Port of `getDiscWorldRadius`: without a screen target the configured world
 * radius, otherwise the world radius whose largest projected extent equals
 * the target screen radius.
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
  const { xAxis, yAxis } = createPlaneBasis(planeNormal);
  const sample = new Vector3();
  let pixelPerWorldMax = 0;
  for (let index = 0; index < DISC_PROJECTION_SCALE_SAMPLE_COUNT; index += 1) {
    const t = (index / DISC_PROJECTION_SCALE_SAMPLE_COUNT) * Math.PI * 2;
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
  return Math.max(fixedScreenRadiusPx / pixelPerWorldMax, DISC_MIN_WORLD_RADIUS);
};
