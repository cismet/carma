import { Box3, Camera, Frustum, Matrix4, Plane, Vector3 } from "three";

export const TILE_MAIN_OBSERVER_ID = "mesh-main-observer";

export const TILE_CAMERA_ROLE = {
  RECEIVER: "receiver",
  GEOMETRY: "geometry",
} as const;

/** Decision: TILE-CAMERA-PRIORITY-20260914 in engines/maplibre/TILES_COVERAGE.md.
 * One payload keeps the maximum demand rank; roles and coverage stay a union.
 */
export const TILE_CAMERA_PRIORITY = {
  PREFETCH: -1,
  SECONDARY: 0,
  PRIMARY: 1,
  FOCUS: 2,
  COVERAGE_REPAIR: 3,
  VIEWPORT_FILL: 4,
} as const;

/** A demand source in the shared scene's world coordinates, not a new scene. */
export type TileCameraView = Readonly<{
  id: string;
  camera: Camera;
  viewport: readonly [width: number, height: number];
  errorTargetPixels: number;
  /** Higher demand starts first; omitted views retain primary priority. */
  priority?: number;
  /** Geometry-only views serve ray tests/casters without color preparation. */
  role: (typeof TILE_CAMERA_ROLE)[keyof typeof TILE_CAMERA_ROLE];
}>;

/** Structured-cloneable selection input, shared by mesh and raster adapters. */
export type TileCameraSnapshot = Readonly<{
  id: string;
  projectionMatrix: readonly number[];
  matrixWorld: readonly number[];
  coordinateSystem: Camera["coordinateSystem"];
  reversedDepth: boolean;
  viewport: readonly [number, number];
  errorTargetPixels: number;
  priority?: number;
  role: TileCameraView["role"];
}>;

export const snapshotTileCameraViews = (
  views: readonly TileCameraView[]
): readonly TileCameraSnapshot[] => {
  const ids = new Set<string>();
  return views.map(
    ({
      id,
      camera,
      viewport,
      errorTargetPixels,
      role,
      priority = TILE_CAMERA_PRIORITY.PRIMARY,
    }) => {
      if (ids.has(id)) throw new Error(`Duplicate tile camera: ${id}`);
      ids.add(id);
      camera.updateWorldMatrix(true, false);
      if (
        !id ||
        !Number.isFinite(priority) ||
        (role !== TILE_CAMERA_ROLE.RECEIVER &&
          role !== TILE_CAMERA_ROLE.GEOMETRY) ||
        ![...viewport, errorTargetPixels].every(
          (value) => Number.isFinite(value) && value > 0
        ) ||
        !camera.matrixWorld.elements.every(Number.isFinite) ||
        !camera.projectionMatrix.elements.every(Number.isFinite) ||
        camera.matrixWorld.determinant() === 0 ||
        camera.projectionMatrix.determinant() === 0
      )
        throw new Error(`Invalid tile camera: ${id}`);
      return {
        id,
        projectionMatrix: camera.projectionMatrix.toArray(),
        matrixWorld: camera.matrixWorld.toArray(),
        coordinateSystem: camera.coordinateSystem,
        reversedDepth: camera.reversedDepth,
        viewport: [...viewport],
        errorTargetPixels,
        priority,
        role,
      };
    }
  );
};

export const tileCameraViewsSignature = (
  views: readonly TileCameraSnapshot[]
): string =>
  JSON.stringify([...views].sort((a, b) => a.id.localeCompare(b.id)));

/** Compile once per camera change, never once per tile. No renderer/GPU ownership.
 * Decision: one demand union preserves source/payload identity across views;
 * see SHARED-TILE-CAMERA-DEMAND-20260913 in engines/maplibre/README.md.
 */
export const createTileCameraDemand = (
  views: readonly TileCameraSnapshot[]
) => {
  const compiled = views.map((view) => {
    const world = new Matrix4().fromArray(view.matrixWorld);
    const projection = new Matrix4().fromArray(view.projectionMatrix);
    const clipFromWorld = projection.clone().multiply(world.clone().invert());
    const frustum = new Frustum().setFromProjectionMatrix(
      clipFromWorld,
      view.coordinateSystem,
      view.reversedDepth
    );
    const position = new Vector3().setFromMatrixPosition(world);
    const orthographic = projection.elements[15] !== 0;
    // Both axes matter for portrait/off-axis cameras and non-square buffers.
    const focal =
      Math.max(
        Math.abs(projection.elements[0]) * view.viewport[0],
        Math.abs(projection.elements[5]) * view.viewport[1]
      ) / 2;
    const cameraScale = new Vector3().setFromMatrixScale(world);
    const minimumScale = Math.min(cameraScale.x, cameraScale.y, cameraScale.z);
    return {
      ...view,
      priority: view.priority ?? TILE_CAMERA_PRIORITY.PRIMARY,
      frustum,
      position,
      orthographic,
      focal,
      minimumScale,
      worldToView: world.clone().invert(),
      clipToWorld: clipFromWorld.clone().invert(),
    };
  });
  const target = {
    required: false,
    receiver: false,
    errorRatio: 0,
    priority: Number.NEGATIVE_INFINITY,
  };
  return {
    views: compiled,
    /**
     * Unordered world-space vertices of the bounds/frustum intersections.
     * Multiple views return their deduplicated vertex union, not a convex hull.
     * This diagnostic clips the actual 3D volume; it assumes no ground plane.
     * Decision: TILES_COVERAGE.md, COVERAGE-DIAGNOSTIC-WINDOWS-20260914.
     */
    intersectionVertices(bounds: Box3, cameraId?: string): Vector3[] {
      if (
        bounds.isEmpty() ||
        ![...bounds.min.toArray(), ...bounds.max.toArray()].every(
          Number.isFinite
        )
      )
        return [];

      // Solve near the box centre so ECEF coordinates do not dominate the
      // plane-triple arithmetic. Tolerance covers both extent and world ULPs.
      const origin = bounds.getCenter(new Vector3());
      const halfSize = bounds.getSize(new Vector3()).multiplyScalar(0.5);
      const coordinateScale = Math.max(
        ...bounds.min.toArray().map(Math.abs),
        ...bounds.max.toArray().map(Math.abs)
      );
      const tolerance = Math.max(
        halfSize.length() * 2e-9,
        Math.max(1, coordinateScale) * Number.EPSILON * 64
      );
      const toleranceSquared = tolerance * tolerance;
      const boxPlanes = [
        new Plane(new Vector3(1, 0, 0), halfSize.x),
        new Plane(new Vector3(-1, 0, 0), halfSize.x),
        new Plane(new Vector3(0, 1, 0), halfSize.y),
        new Plane(new Vector3(0, -1, 0), halfSize.y),
        new Plane(new Vector3(0, 0, 1), halfSize.z),
        new Plane(new Vector3(0, 0, -1), halfSize.z),
      ];
      const vertices: Vector3[] = [];
      const bc = new Vector3();
      const ca = new Vector3();
      const ab = new Vector3();
      const point = new Vector3();
      for (const view of compiled) {
        if (cameraId !== undefined && view.id !== cameraId) continue;
        const planes = [
          ...boxPlanes,
          ...view.frustum.planes.map(
            (plane) =>
              new Plane(
                plane.normal.clone(),
                plane.constant + plane.normal.dot(origin)
              )
          ),
        ];
        // Each vertex of a bounded convex intersection lies on >=3 planes.
        for (let i = 0; i < planes.length - 2; i++) {
          const a = planes[i];
          for (let j = i + 1; j < planes.length - 1; j++) {
            const b = planes[j];
            for (let k = j + 1; k < planes.length; k++) {
              const c = planes[k];
              bc.crossVectors(b.normal, c.normal);
              const determinant = a.normal.dot(bc);
              if (Math.abs(determinant) <= 1e-12) continue;
              ca.crossVectors(c.normal, a.normal);
              ab.crossVectors(a.normal, b.normal);
              point
                .copy(bc)
                .multiplyScalar(-a.constant)
                .addScaledVector(ca, -b.constant)
                .addScaledVector(ab, -c.constant)
                .divideScalar(determinant);
              if (
                ![point.x, point.y, point.z].every(Number.isFinite) ||
                planes.some(
                  (plane) => plane.distanceToPoint(point) < -tolerance
                ) ||
                vertices.some(
                  (vertex) =>
                    vertex.distanceToSquared(point) <= toleranceSquared
                )
              )
                continue;
              vertices.push(point.clone());
            }
          }
        }
      }
      return vertices.map((vertex) => vertex.add(origin));
    },
    /** Result is scratch storage; consume before the next evaluation. */
    evaluate(bounds: Box3, geometricError: number, excludeCameraId?: string) {
      target.required = false;
      target.receiver = false;
      target.errorRatio = 0;
      target.priority = Number.NEGATIVE_INFINITY;
      if (bounds.isEmpty()) return target;
      for (const view of compiled) {
        if (view.id === excludeCameraId) continue;
        if (!view.frustum.intersectsBox(bounds)) continue;
        let distance = view.minimumScale;
        if (!view.orthographic) {
          // Linear view depth reaches its box minimum at this corner. Most
          // interior tiles take this allocation-light path; only clipped
          // corners require the existing convex intersection calculation.
          const e = view.worldToView.elements;
          const nearest = new Vector3(
            e[2] > 0 ? bounds.max.x : bounds.min.x,
            e[6] > 0 ? bounds.max.y : bounds.min.y,
            e[10] > 0 ? bounds.max.z : bounds.min.z
          );
          const visible = view.frustum.containsPoint(nearest)
            ? [nearest]
            : this.intersectionVertices(bounds, view.id);
          if (visible.length === 0) continue;
          let depth = Number.POSITIVE_INFINITY;
          for (const point of visible) {
            depth = Math.min(depth, -point.applyMatrix4(view.worldToView).z);
          }
          // Decision: FRUSTUM-REPLACEMENT-20260914 in TILES_COVERAGE.md.
          // Never let an invisible, near portion of the world AABB set SSE.
          distance = Math.max(Number.EPSILON, depth * view.minimumScale);
        }
        target.required = true;
        target.priority = Math.max(target.priority, view.priority);
        target.receiver ||= view.role === TILE_CAMERA_ROLE.RECEIVER;
        target.errorRatio = Math.max(
          target.errorRatio,
          (geometricError * view.focal) / distance / view.errorTargetPixels
        );
      }
      return target;
    },
  };
};
