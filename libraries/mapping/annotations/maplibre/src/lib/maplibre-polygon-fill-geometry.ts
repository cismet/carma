import {
  createPlaneBasisFromNormal,
  getNormalizedTriangleNormal,
  projectVector3OntoPlane,
  removeVector3ComponentAlongAxis,
} from "@carma-commons/math";
import {
  BufferGeometry,
  Float32BufferAttribute,
  ShapeUtils,
  Vector2,
  Vector3,
} from "three";
import {
  geographicCoordinateFromEcef,
  getFromWGS84ToUTM32,
  getLocalUpDirectionAtAnchor,
} from "@carma-geo/proj";

import { MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS } from "./maplibre-scene-primitive-defaults";

/** Newell's method: the polygon normal without picking three vertices. */
const resolvePolygonNormal = (
  positions: readonly Vector3[]
): Vector3 | null => {
  const normal = new Vector3();
  for (let index = 0; index < positions.length; index += 1) {
    const current = positions[index]!;
    const next = positions[(index + 1) % positions.length]!;
    normal.x += (current.y - next.y) * (current.z + next.z);
    normal.y += (current.z - next.z) * (current.x + next.x);
    normal.z += (current.x - next.x) * (current.y + next.y);
  }
  if (normal.lengthSq() > 0) return normal.normalize();
  return positions.length >= 3
    ? getNormalizedTriangleNormal(positions[0]!, positions[1]!, positions[2]!)
    : null;
};

/**
 * A ground area lies in the local tangent plane through its lowest corner:
 * the fill is flat on the courtyard even where a corner caught a kerb or a
 * roof edge, as the ground measurement itself is a planar figure.
 */
export const projectOntoGroundPlane = (
  positionsECEF: readonly Vector3[]
): Vector3[] => {
  if (positionsECEF.length === 0) return [];
  const anchor = positionsECEF.reduce((lowest, position) =>
    position.lengthSq() < lowest.lengthSq() ? position : lowest
  );
  const up = getLocalUpDirectionAtAnchor(anchor);
  return positionsECEF.map((position) =>
    projectVector3OntoPlane(position, anchor, up)
  );
};

/** An edge counts as level while its rise stays within this share of its length, or 0.3 m. */
const LEVEL_EDGE_MAX_RISE_RATIO = 0.1;
const LEVEL_EDGE_MAX_RISE_METERS = 0.3;

/**
 * The grid of a roof or wall starts at its lowest level edge: the eaves of
 * a roof, the base of a wall. The x axis runs along that edge from its
 * first corner, the y axis lies in the plane and points upward where the
 * plane has an upward direction.
 */
const resolveLowestEdgeFrame = (
  local: readonly Vector3[],
  normal: Vector3,
  anchorECEF: Vector3
): { xAxis: Vector3; yAxis: Vector3; origin: Vector3 } => {
  const up = getLocalUpDirectionAtAnchor(anchorECEF);
  const heights = local.map((position) => position.dot(up));
  let best: { index: number; mean: number; level: boolean } | null = null;
  for (let index = 0; index < local.length; index += 1) {
    const next = (index + 1) % local.length;
    const length = local[index]!.distanceTo(local[next]!);
    if (!(length > 0)) continue;
    const rise = Math.abs(heights[next]! - heights[index]!);
    const level =
      rise <=
      Math.max(LEVEL_EDGE_MAX_RISE_METERS, length * LEVEL_EDGE_MAX_RISE_RATIO);
    const mean = (heights[index]! + heights[next]!) / 2;
    if (
      !best ||
      (level && !best.level) ||
      (level === best.level && mean < best.mean)
    ) {
      best = { index, mean, level };
    }
  }
  const index = best?.index ?? 0;
  const next = (index + 1) % local.length;
  const xAxis = removeVector3ComponentAlongAxis(
    new Vector3().subVectors(local[next]!, local[index]!),
    normal
  );
  if (!(xAxis.lengthSq() > 0)) {
    const basis = createPlaneBasisFromNormal(normal);
    return {
      xAxis: basis.xAxis,
      yAxis: basis.yAxis,
      origin: local[index]!.clone(),
    };
  }
  xAxis.normalize();
  const yAxis = new Vector3().crossVectors(normal, xAxis).normalize();
  if (yAxis.dot(up) < -1e-3) {
    xAxis.negate();
    yAxis.negate();
    return { xAxis, yAxis, origin: local[next]!.clone() };
  }
  return { xAxis, yAxis, origin: local[index]!.clone() };
};

/**
 * Texture coordinates of a ground area in UTM zone 32 metres, so its grid
 * lines fall on the UTM grid, relative to the kilometre corner below the
 * anchor to keep the float32 attribute exact.
 */
const resolveGroundUv = (
  positionsECEF: readonly Vector3[],
  anchorECEF: Vector3
): Vector2[] => {
  const toUtm = (position: Vector3) => {
    const geographic = geographicCoordinateFromEcef(position);
    const [easting, northing] = getFromWGS84ToUTM32([
      geographic.longitude,
      geographic.latitude,
    ] as Parameters<typeof getFromWGS84ToUTM32>[0]);
    return new Vector2(easting, northing);
  };
  const anchor = toUtm(anchorECEF);
  const kilometre = new Vector2(
    Math.floor(anchor.x / 1000) * 1000,
    Math.floor(anchor.y / 1000) * 1000
  );
  return positionsECEF.map((position) => toUtm(position).sub(kilometre));
};

/**
 * The triangulated polygon relative to its anchor, with grid metres as
 * texture coordinates: the pattern sits on the surface and foreshortens with
 * it. Roofs and walls count from their lowest level edge, ground areas from
 * the UTM grid. Null for a degenerate polygon.
 */
export const buildPolygonGeometry = (
  positionsECEF: readonly Vector3[],
  anchorECEF: Vector3,
  ground: boolean
): BufferGeometry | null => {
  const local = positionsECEF.map((position) =>
    position.clone().sub(anchorECEF)
  );
  const normal = resolvePolygonNormal(local);
  if (!normal) return null;
  const frame = resolveLowestEdgeFrame(local, normal, anchorECEF);
  const points2d = local.map((position) => {
    const offset = position.clone().sub(frame.origin);
    return new Vector2(offset.dot(frame.xAxis), offset.dot(frame.yAxis));
  });
  const triangles = ShapeUtils.triangulateShape(points2d, []);
  if (triangles.length === 0) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      local.flatMap((position) => [position.x, position.y, position.z]),
      3
    )
  );
  const unit = MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.fillGridUvUnitMeters;
  const gridPoints = ground
    ? resolveGroundUv(positionsECEF, anchorECEF)
    : points2d;
  geometry.setAttribute(
    "uv",
    new Float32BufferAttribute(
      gridPoints.flatMap((point) => [point.x / unit, point.y / unit]),
      2
    )
  );
  geometry.setIndex(triangles.flat());
  return geometry;
};
