import * as THREE from "three";

export type ShadowReceiverCell = Readonly<{
  /** Stable world identity, independent of the observer camera. */
  id: string;
  bounds: THREE.Box3;
  /** Exact native receiver payload; omit for spatially partitioned rasters. */
  receiverObjectId?: number;
}>;

export type ShadowReceiverPage = ShadowReceiverCell &
  Readonly<{ groundTexelTargetMeters: number; screenBounds: THREE.Vector4 }>;

/** Normalized framebuffer scissor, conservative for the complete height range. */
export const shadowReceiverScreenBounds = (
  bounds: THREE.Box3,
  matrix: THREE.Matrix4
): THREE.Vector4 => {
  const clip = shadowReceiverCorners(bounds).map((p) =>
    new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(matrix)
  );
  if (clip.some((p) => p.w <= 0)) return new THREE.Vector4(0, 0, 1, 1);
  const minX = Math.max(0, (Math.min(...clip.map((p) => p.x / p.w)) + 1) / 2);
  const minY = Math.max(0, (Math.min(...clip.map((p) => p.y / p.w)) + 1) / 2);
  const maxX = Math.min(1, (Math.max(...clip.map((p) => p.x / p.w)) + 1) / 2);
  const maxY = Math.min(1, (Math.max(...clip.map((p) => p.y / p.w)) + 1) / 2);
  return new THREE.Vector4(
    minX,
    minY,
    Math.max(0, maxX - minX),
    Math.max(0, maxY - minY)
  );
};

export const shadowReceiverCorners = (bounds: THREE.Box3): THREE.Vector3[] =>
  [bounds.min.x, bounds.max.x].flatMap((x) =>
    [bounds.min.y, bounds.max.y].flatMap((y) =>
      [bounds.min.z, bounds.max.z].map((z) => new THREE.Vector3(x, y, z))
    )
  );

/** Conservative bound on the projection Jacobian over the complete cell.
 * Unlike centre-distance heuristics, a close corner or elevated roof counts.
 * This bounds screen pixels per world metre; ground-isotropic shadow texels
 * are still only a horizontal-surface reference, not a grazing-slope guarantee.
 */
export const shadowReceiverPixelsPerMeter = (
  bounds: THREE.Box3,
  viewProjection: THREE.Matrix4,
  viewport: THREE.Vector2
): number => {
  const e = viewProjection.elements;
  const corners = shadowReceiverCorners(bounds).map((p) =>
    new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(viewProjection)
  );
  const minW = Math.min(...corners.map((p) => p.w));
  if (minW <= 0) return Infinity;
  // Each derivative numerator is affine in world coordinates. Its absolute
  // maximum is at a box corner. Frobenius norm bounds the largest singular value.
  let squaredNorm = 0;
  for (const [row, pixels] of [
    [0, viewport.x],
    [1, viewport.y],
  ]) {
    for (let axis = 0; axis < 3; axis += 1) {
      const numerator = Math.max(
        ...corners.map((p) =>
          Math.abs(
            e[axis * 4 + row] * p.w - (row === 0 ? p.x : p.y) * e[axis * 4 + 3]
          )
        )
      );
      squaredNorm += ((pixels * 0.5 * numerator) / (minW * minW)) ** 2;
    }
  }
  return Math.sqrt(squaredNorm);
};

export const planShadowReceiverPages = (
  cells: readonly ShadowReceiverCell[],
  camera: THREE.Camera,
  viewport: THREE.Vector2,
  targetPixels: number
): readonly ShadowReceiverPage[] => {
  if (
    !(targetPixels > 0 && Number.isFinite(targetPixels)) ||
    !(viewport.x > 0 && viewport.y > 0)
  ) {
    throw new RangeError(
      "Shadow page projection requires a positive pixel target and viewport"
    );
  }
  const matrix = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  );
  const ids = new Set<string>();
  for (const { id, bounds } of cells) {
    if (
      ids.has(id) ||
      bounds.isEmpty() ||
      ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)
    ) {
      throw new RangeError(
        "Receiver cells require unique IDs and finite, nonempty bounds"
      );
    }
    ids.add(id);
  }
  const frustum = new THREE.Frustum().setFromProjectionMatrix(matrix);
  return cells
    .filter(({ bounds }) => frustum.intersectsBox(bounds))
    .map((cell) => ({
      ...cell,
      screenBounds: shadowReceiverScreenBounds(cell.bounds, matrix),
      // A near-plane crossing requests the finest hardware class, never culls it.
      groundTexelTargetMeters: Math.max(
        1e-9,
        targetPixels /
          shadowReceiverPixelsPerMeter(cell.bounds, matrix, viewport)
      ),
    }));
};

/** Conservative broad phase, including all finite-disc directions. False
 * positives are allowed; geometry outside the centre ray must not be missed.
 * Exact prism/BVH narrowing can reuse this same dependency envelope later.
 */
export const shadowReceiverCorridor = (
  bounds: THREE.Box3,
  directionToSun: THREE.Vector3,
  reachMeters: number,
  angularRadius: number,
  guardMeters: number
): THREE.Box3 =>
  bounds
    .clone()
    .union(
      bounds
        .clone()
        .translate(
          directionToSun.clone().normalize().multiplyScalar(reachMeters)
        )
    )
    .expandByScalar(
      2 * reachMeters * Math.sin(angularRadius / 2) + guardMeters
    );
