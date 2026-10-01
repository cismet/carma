import { Box3, Frustum, Matrix4, Plane, Vector3 } from "three";

import {
  clipConvexPolygonByPlanes3d,
  getPolygonArea2d,
  type Point2,
} from "@carma-commons/math";

const BOX_FACES = [
  [
    [0, 1, 3, 2],
    [4, 6, 7, 5],
  ],
  [
    [0, 4, 5, 1],
    [2, 3, 7, 6],
  ],
  [
    [0, 2, 6, 4],
    [1, 5, 7, 3],
  ],
] as const;
const VIEWPORT_PLANES = [
  new Plane(new Vector3(1, 0, 0), 1),
  new Plane(new Vector3(-1, 0, 0), 1),
  new Plane(new Vector3(0, 1, 0), 1),
  new Plane(new Vector3(0, -1, 0), 1),
];

/** Depth-plane cuts can add visible caps; recover their complete footprint
 * from the clipped volume when the camera-facing box faces alone are insufficient.
 */
export const projectedIntersectionArea = (
  vertices: readonly Vector3[],
  clipFromWorld: Matrix4
): number => {
  const points: Point2[] = [];
  const e = clipFromWorld.elements;
  for (const point of vertices) {
    const w = e[3] * point.x + e[7] * point.y + e[11] * point.z + e[15];
    if (!(w > 0)) continue;
    const x = Math.max(
      -1,
      Math.min(
        1,
        (e[0] * point.x + e[4] * point.y + e[8] * point.z + e[12]) / w
      )
    );
    const y = Math.max(
      -1,
      Math.min(
        1,
        (e[1] * point.x + e[5] * point.y + e[9] * point.z + e[13]) / w
      )
    );
    if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
  }
  points.sort((a, b) => a.x - b.x || a.y - b.y);
  if (points.length < 3) return 0;
  const cross = (a: Point2, b: Point2, c: Point2) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const chain = (ordered: readonly Point2[]): Point2[] => {
    const hull: Point2[] = [];
    for (const point of ordered) {
      while (
        hull.length >= 2 &&
        cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0
      )
        hull.pop();
      hull.push(point);
    }
    return hull.slice(0, -1);
  };
  return getPolygonArea2d([...chain(points), ...chain([...points].reverse())]);
};

export const projectedFacingBoxFaces = (
  bounds: Box3,
  worldBounds: Box3,
  view: Readonly<{
    standardProjection: boolean;
    orthographic: boolean;
    frustum: Frustum;
    position: Vector3;
    backward: Vector3;
    clipFromWorld: Matrix4;
    viewFromClip: Matrix4;
  }>,
  boundsToWorld?: Matrix4,
  worldToBounds?: Matrix4
): { area: number; depth: number } | undefined => {
  if (
    !view.standardProjection ||
    bounds.min.x === bounds.max.x ||
    bounds.min.y === bounds.max.y ||
    bounds.min.z === bounds.max.z ||
    !view.frustum.planes
      .slice(4)
      .every(
        ({ normal, constant }) =>
          normal.x * (normal.x < 0 ? worldBounds.max.x : worldBounds.min.x) +
            normal.y * (normal.y < 0 ? worldBounds.max.y : worldBounds.min.y) +
            normal.z * (normal.z < 0 ? worldBounds.max.z : worldBounds.min.z) +
            constant >
          0
      )
  )
    return undefined;
  const eye = (view.orthographic ? view.backward : view.position).clone();
  if (worldToBounds) {
    if (view.orthographic) eye.transformDirection(worldToBounds);
    else eye.applyMatrix4(worldToBounds);
  }
  if (!view.orthographic && bounds.containsPoint(eye)) return undefined;
  const clipFromBounds = boundsToWorld
    ? view.clipFromWorld.clone().multiply(boundsToWorld)
    : view.clipFromWorld;
  const corners: Vector3[] = [];
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z])
        corners.push(new Vector3(x, y, z).applyMatrix4(clipFromBounds));
  const clipPlanes = VIEWPORT_PLANES.filter((plane) =>
    corners.some((corner) => plane.distanceToPoint(corner) < 0)
  );
  const inverse = view.viewFromClip.elements;
  let area = 0;
  let depth = Number.POSITIVE_INFINITY;
  // A convex box has at most three camera-facing faces. Their projected
  // interiors are disjoint, even after viewport clipping, so areas add exactly.
  // Keep NDC z while clipping: inverse projection gives exact visible depth.
  for (let axis = 0; axis < 3; axis++) {
    const direction = eye.getComponent(axis);
    const side = view.orthographic
      ? direction < 0
        ? 0
        : direction > 0
        ? 1
        : -1
      : direction < bounds.min.getComponent(axis)
      ? 0
      : direction > bounds.max.getComponent(axis)
      ? 1
      : -1;
    if (side === -1) continue;
    const quad = BOX_FACES[axis][side].map((index) => corners[index]);
    const face = clipPlanes.length
      ? clipConvexPolygonByPlanes3d(quad, clipPlanes, { epsilon: 0 })
      : quad;
    area += getPolygonArea2d(face);
    for (const point of face) {
      const viewZ =
        (inverse[2] * point.x +
          inverse[6] * point.y +
          inverse[10] * point.z +
          inverse[14]) /
        (inverse[3] * point.x +
          inverse[7] * point.y +
          inverse[11] * point.z +
          inverse[15]);
      depth = Math.min(depth, -viewZ);
    }
  }
  return { area, depth };
};
