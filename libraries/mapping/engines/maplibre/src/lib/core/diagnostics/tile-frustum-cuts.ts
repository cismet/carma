import { Box3, Frustum, Line3, Matrix4, Vector3 } from "three";

const BOX_FACES = [
  [0, 2, 6, 4],
  [1, 5, 7, 3],
  [0, 4, 5, 1],
  [2, 3, 7, 6],
  [0, 1, 3, 2],
  [4, 6, 7, 5],
] as const;

/** Tile-surface/frustum-plane cuts in world space, never cap or hull edges. */
export const intersectTileFrustumPlanes = (
  bounds: Box3,
  frustum: Frustum,
  boundsToWorld = new Matrix4()
): Line3[] => {
  if (bounds.isEmpty()) return [];
  const corners = Array.from({ length: 8 }, (_, index) =>
    new Vector3(
      index & 1 ? bounds.max.x : bounds.min.x,
      index & 2 ? bounds.max.y : bounds.min.y,
      index & 4 ? bounds.max.z : bounds.min.z
    ).applyMatrix4(boundsToWorld)
  );
  const extent = new Box3().setFromPoints(corners);
  if (!frustum.intersectsBox(extent)) return [];
  const epsilon = Math.max(1e-7, extent.getSize(new Vector3()).length() * 1e-9);
  const segments: Line3[] = [];
  // Three orders the four side planes before far/near. Depth clips remain
  // constraints, but do not generate diagnostic lines.
  for (const plane of frustum.planes.slice(0, 4)) {
    const distances = corners.map((point) => plane.distanceToPoint(point));
    // Touching a face is not a plane cutting through the tile volume.
    if (Math.min(...distances) >= -epsilon || Math.max(...distances) <= epsilon)
      continue;
    for (const face of BOX_FACES) {
      const hits: Vector3[] = [];
      const add = (point: Vector3) => {
        if (
          !hits.some((hit) => hit.distanceToSquared(point) <= epsilon * epsilon)
        )
          hits.push(point);
      };
      for (let i = 0; i < face.length; i++) {
        const a = face[i],
          b = face[(i + 1) % face.length];
        const da = distances[a],
          db = distances[b];
        if (Math.abs(da) <= epsilon) add(corners[a].clone());
        if (da * db < 0)
          add(corners[a].clone().lerp(corners[b], da / (da - db)));
      }
      if (hits.length !== 2) continue;
      const [start, end] = hits;
      let first = 0,
        last = 1;
      // Clip segments, not polygons: polygon clipping invents closing edges
      // between frustum planes inside the tile. Decision: TILE_DIAGNOSTICS.md
      // #surface-cuts-share-the-loaders-camera-and-bounds.
      for (const clip of frustum.planes) {
        const a = clip.distanceToPoint(start),
          b = clip.distanceToPoint(end);
        if (a < -epsilon && b < -epsilon) {
          last = -1;
          break;
        }
        if (a < -epsilon) first = Math.max(first, a / (a - b));
        if (b < -epsilon) last = Math.min(last, a / (a - b));
      }
      if (last <= first) continue;
      const a = start.clone().lerp(end, first),
        b = start.clone().lerp(end, last);
      if (a.distanceToSquared(b) > epsilon * epsilon)
        segments.push(new Line3(a, b));
    }
  }
  return segments;
};
