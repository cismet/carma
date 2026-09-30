import { OrthographicCamera, Vector3 } from "three";
import { getSignedPolygonArea2d } from "@carma-commons/math";
import { assertFiniteVector } from "./camera-rig-contract";

// Decision MULTICAM-STRESS (engine README): offset supporting lines,
// not a radial scale about the centroid, which cannot guarantee edge clearance.
export const offsetConvexFootprint = (
  points: readonly Vector3[],
  clearance: number
) => {
  points.forEach((point) => assertFiniteVector(point, "Footprint point"));
  const samePosition = (a: Vector3, b: Vector3) =>
    Math.hypot(a.x - b.x, a.z - b.z) < 1e-8;
  const ring = points.filter(
    (point, index) => !index || !samePosition(point, points[index - 1])
  );
  if (ring.length > 1 && samePosition(ring[0], ring[ring.length - 1]))
    ring.pop();
  if (ring.length < 3) throw new Error("Closed footprint needs three vertices");
  let area = getSignedPolygonArea2d(ring.map(({ x, z }) => ({ x, y: z })));
  if (Math.abs(area) < 1e-8) throw new Error("Footprint has zero area");
  // Clockwise XZ traversal makes each inward image's right edge meet the next
  // image's left edge. Opposite source winding must not reverse strip order.
  if (area > 0) {
    ring.reverse();
    area = -area;
  }
  const winding = Math.sign(area);
  const normals = ring.map((point, index) => {
    const next = ring[(index + 1) % ring.length];
    const length = Math.hypot(next.x - point.x, next.z - point.z);
    if (length < 1e-8) throw new Error("Footprint has a repeated vertex");
    return new Vector3(
      (winding * (next.z - point.z)) / length,
      0,
      (-winding * (next.x - point.x)) / length
    );
  });
  // This option deliberately accepts convex envelopes only, not an arbitrary
  // concave polygon whose outward mitres could self-intersect.
  ring.forEach((point, index) => {
    if (
      ring.some(
        (candidate) => normals[index].dot(candidate.clone().sub(point)) > 1e-4
      )
    )
      throw new Error("Closed footprint must be convex");
  });
  return {
    original: ring,
    outwardSide: -winding,
    points: ring.map((point, index) => {
      const previous = normals[(index + ring.length - 1) % ring.length];
      const current = normals[index];
      const denominator = 1 + previous.dot(current);
      if (denominator < 1e-8) throw new Error("Footprint corner is degenerate");
      return point
        .clone()
        .addScaledVector(
          previous.clone().add(current),
          clearance / denominator
        );
    }),
  };
};

export const fitFootprintFar = (
  camera: OrthographicCamera,
  footprint: readonly Vector3[],
  padding: number,
  emptyStripDepth: number
) => {
  // Clip in camera-space X to this strip; a remote corner outside the strip
  // must not push its far plane through the next block of buildings.
  let polygon = footprint.map((point) =>
    point.clone().applyMatrix4(camera.matrixWorldInverse)
  );
  for (const [boundary, sign] of [
    [camera.left, 1],
    [camera.right, -1],
  ]) {
    const clipped: Vector3[] = [];
    for (let index = 0; index < polygon.length; index++) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      const a = sign * (start.x - boundary),
        b = sign * (end.x - boundary);
      if (a >= 0) clipped.push(start);
      if (a >= 0 !== b >= 0) clipped.push(start.clone().lerp(end, a / (a - b)));
    }
    polygon = clipped;
  }
  // Offset mitres can create narrow fringe strips outside the original hull.
  // Keep those bounded at the front margin instead of loading the next block.
  const far =
    (polygon.length
      ? Math.max(...polygon.map((point) => -point.z))
      : emptyStripDepth) + padding;
  if (!Number.isFinite(far) || far <= camera.near)
    throw new Error("Footprint is behind its camera");
  camera.far = far;
  camera.updateProjectionMatrix();
};
