import { Matrix4, Vector3 } from "three";

import { getConvexHull2d, type Point2 } from "@carma-commons/math";
import { TWO_PI } from "@carma-units";

/** A move arrow as a cone in world space; the scene cone and the overlay hit area share it. */
export type ConeArrowGeometry = {
  baseCenter: Vector3;
  apex: Vector3;
  /** Unit vector from the base centre toward the apex. */
  direction: Vector3;
  /** Unit vectors spanning the base, `side` across the view ray. */
  side: Vector3;
  across: Vector3;
  radius: number;
  height: number;
  /** The camera looks at the base. */
  baseFacesCamera: boolean;
};

export type ConeArrowSilhouette = {
  /** Outline of the cone: hull of the apex and the base rim, relative to the anchor. */
  hull: Point2[];
  /** The base rim while the camera looks at the base side, else null. */
  baseRim: Point2[] | null;
  /** The cone tip, relative to the anchor. */
  apex: Point2;
};

export type ConeArrowLayout = {
  project: (world: Vector3) => Point2 | null;
  origin: Vector3;
  /** Unit vector from the anchor toward the arrow tip. */
  direction: Vector3;
  offsetPx: number;
  edgePx: number;
  heightPx: number;
  anchorCanvasPosition: Point2;
  cameraPosition: Vector3;
};

const CONE_ARROW_MAX_OFFSET_WORLD = 1e5;
const CONE_ARROW_MIN_PIXELS_PER_WORLD = 1e-6;
const DEGENERATE_SIDE_LENGTH_SQ = 1e-12;

/**
 * The world cone of a move arrow: its base sits `offsetPx` from the anchor on
 * screen, radius and height match the flat arrow (edge, height in pixels) at
 * that depth, so it equals the flat arrow across the view and foreshortens as
 * the axis turns toward the camera. Null when a point does not project or the
 * axis runs along the view ray.
 */
export const resolveConeArrowGeometry = ({
  project,
  origin,
  direction,
  offsetPx,
  edgePx,
  heightPx,
  anchorCanvasPosition,
  cameraPosition,
}: ConeArrowLayout): ConeArrowGeometry | null => {
  const sample = new Vector3();
  const screenDistanceTo = (world: Vector3) => {
    const projected = project(world);
    return projected
      ? Math.hypot(
          projected.x - anchorCanvasPosition.x,
          projected.y - anchorCanvasPosition.y
        )
      : null;
  };

  // Where on the axis the base lands offsetPx away on screen: a first guess
  // from a one-metre sample, refined twice for the perspective.
  const unitPixels = screenDistanceTo(
    sample.copy(origin).addScaledVector(direction, 1)
  );
  if (unitPixels === null || unitPixels < CONE_ARROW_MIN_PIXELS_PER_WORLD) {
    return null;
  }
  let baseOffsetWorld = offsetPx / unitPixels;
  for (let i = 0; i < 2; i += 1) {
    const pixels = screenDistanceTo(
      sample.copy(origin).addScaledVector(direction, baseOffsetWorld)
    );
    if (pixels === null || pixels < CONE_ARROW_MIN_PIXELS_PER_WORLD) {
      return null;
    }
    baseOffsetWorld *= offsetPx / pixels;
  }
  if (
    !Number.isFinite(baseOffsetWorld) ||
    baseOffsetWorld > CONE_ARROW_MAX_OFFSET_WORLD
  ) {
    return null;
  }
  const baseCenter = origin.clone().addScaledVector(direction, baseOffsetWorld);
  const baseCenterScreen = project(baseCenter);
  if (!baseCenterScreen) return null;

  // Pixels per world unit across the view at the base, from a short step
  // perpendicular to both the axis and the view ray.
  const viewRay = baseCenter.clone().sub(cameraPosition);
  const side = new Vector3().crossVectors(direction, viewRay);
  if (side.lengthSq() < DEGENERATE_SIDE_LENGTH_SQ) {
    side.set(1, 0, 0).cross(direction);
    if (side.lengthSq() < DEGENERATE_SIDE_LENGTH_SQ) {
      side.set(0, 1, 0).cross(direction);
    }
  }
  side.normalize();
  const sideStep = Math.max(baseOffsetWorld * 0.1, 1e-6);
  const sideScreen = project(
    sample.copy(baseCenter).addScaledVector(side, sideStep)
  );
  if (!sideScreen) return null;
  const sidePixelsPerWorld =
    Math.hypot(
      sideScreen.x - baseCenterScreen.x,
      sideScreen.y - baseCenterScreen.y
    ) / sideStep;
  if (sidePixelsPerWorld < CONE_ARROW_MIN_PIXELS_PER_WORLD) return null;

  const radius = edgePx / 2 / sidePixelsPerWorld;
  const height = heightPx / sidePixelsPerWorld;
  return {
    baseCenter,
    apex: baseCenter.clone().addScaledVector(direction, height),
    direction: direction.clone(),
    side,
    across: new Vector3().crossVectors(direction, side).normalize(),
    radius,
    height,
    baseFacesCamera: viewRay.dot(direction) > 0,
  };
};

/** Screen outline of a world cone relative to the anchor; null when a point does not project. */
export const projectConeArrowGeometry = (
  geometry: ConeArrowGeometry,
  project: (world: Vector3) => Point2 | null,
  anchorCanvasPosition: Point2,
  segments = 24
): ConeArrowSilhouette | null => {
  const toLocal = (world: Vector3): Point2 | null => {
    const projected = project(world);
    if (!projected) return null;
    const x = projected.x - anchorCanvasPosition.x;
    const y = projected.y - anchorCanvasPosition.y;
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  };
  const apex = toLocal(geometry.apex);
  if (!apex) return null;
  const rimPoint = new Vector3();
  const rim: Point2[] = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * TWO_PI;
    const point = toLocal(
      rimPoint
        .copy(geometry.baseCenter)
        .addScaledVector(geometry.side, Math.cos(angle) * geometry.radius)
        .addScaledVector(geometry.across, Math.sin(angle) * geometry.radius)
    );
    if (!point) return null;
    rim.push(point);
  }
  return {
    hull: getConvexHull2d([apex, ...rim]),
    baseRim: geometry.baseFacesCamera ? rim : null,
    apex,
  };
};

/** The flat move arrow drawn as its cone seen in perspective, see `resolveConeArrowGeometry`. */
export const projectConeArrowSilhouette = (
  layout: ConeArrowLayout & { segments?: number }
): ConeArrowSilhouette | null => {
  const geometry = resolveConeArrowGeometry(layout);
  return geometry
    ? projectConeArrowGeometry(
        geometry,
        layout.project,
        layout.anchorCanvasPosition,
        layout.segments
      )
    : null;
};

/** Places the unit cone of `AnnotationSceneConeOptions` on the arrow cone. */
export const createConeArrowMatrix = (
  geometry: ConeArrowGeometry,
  out: Matrix4 = new Matrix4()
): Matrix4 =>
  out
    .makeBasis(
      geometry.side.clone().multiplyScalar(geometry.radius),
      geometry.across.clone().multiplyScalar(geometry.radius),
      geometry.direction.clone().multiplyScalar(geometry.height)
    )
    .setPosition(geometry.baseCenter);
