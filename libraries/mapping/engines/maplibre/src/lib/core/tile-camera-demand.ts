import { Box3, Camera, Frustum, Matrix4, Plane, Vector3 } from "three";

import {
  projectedFacingBoxFaces,
  projectedIntersectionArea,
} from "./tile-camera-footprint";

export const TILE_MAIN_OBSERVER_ID = "mesh-main-observer";
export const TILE_SHADOW_CAMERA_ID = "mesh-sun-shadow";

export const TILE_CAMERA_ROLE = {
  RECEIVER: "receiver",
  GEOMETRY: "geometry",
} as const;

/** Decision: TILES_COVERAGE.md#camera-normalized-mesh-refinement.
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

/** Error and projected coverage from one camera, before union aggregation. */
export type TileCameraContribution = Readonly<{
  id: string;
  role: TileCameraView["role"];
  priority: number;
  errorPixels: number;
  errorTargetPixels: number;
  errorRatio: number;
  visibleAreaPixels: number;
  visibleAreaFraction: number;
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
 * see README.md#multi-camera-demand-and-shared-presentation.
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
    const p = projection.elements;
    const orthographic = p[15] !== 0;
    const standardProjection =
      p[3] === 0 &&
      p[7] === 0 &&
      (orthographic
        ? p[11] === 0 && p[15] === 1 && p[8] === 0 && p[9] === 0
        : p[11] === -1 && p[15] === 0 && p[12] === 0 && p[13] === 0);
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
      standardProjection,
      backward: new Vector3().setFromMatrixColumn(world, 2),
      viewFromClip: projection.clone().invert(),
      focal,
      minimumScale,
      worldToView: world.clone().invert(),
      clipToWorld: clipFromWorld.clone().invert(),
      clipFromWorld,
    };
  });
  const intersectionCorner = new Vector3();
  const evaluationWorldBounds = new Box3();
  const evaluationWorldToBounds = new Matrix4();
  const evaluationBoundsToView = new Matrix4();
  const evaluationNearest = new Vector3();
  const contributions: TileCameraContribution[] = [];
  const target: {
    required: boolean;
    receiver: boolean;
    errorRatio: number;
    visibleAreaPixels?: number;
    contributions?: readonly TileCameraContribution[];
    priority: number;
  } = {
    required: false,
    receiver: false,
    errorRatio: 0,
    visibleAreaPixels: 0,
    priority: Number.NEGATIVE_INFINITY,
  };
  return {
    views: compiled,
    /**
     * Unordered world-space vertices of the bounds/frustum intersections.
     * Multiple views return their deduplicated vertex union, not a convex hull.
     * This diagnostic clips the actual 3D volume; it assumes no ground plane.
     * Decision: TILES_COVERAGE.md#coverage-diagnostics.
     */
    intersectionVertices(
      bounds: Box3,
      cameraId?: string,
      boundsToWorld?: Matrix4
    ): Vector3[] {
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
      let boxPlanes: Plane[] | undefined;
      const worldToBounds = boundsToWorld?.clone().invert();
      const vertices: Vector3[] = [];
      const bc = new Vector3();
      const ca = new Vector3();
      const ab = new Vector3();
      const point = new Vector3();
      for (const view of compiled) {
        if (cameraId !== undefined && view.id !== cameraId) continue;
        // A plane strictly containing the tolerance-expanded box cannot
        // contribute a vertex or reject a solution of the box's six planes.
        // Pruning it preserves near/far/touching cuts and avoids solving all
        // 220 plane triples for an ordinary one-side cut (only 35 remain).
        const frustumPlanes: Plane[] = [];
        for (const worldPlane of view.frustum.planes) {
          const plane = worldPlane.clone();
          if (worldToBounds) plane.applyMatrix4(worldToBounds);
          plane.constant += plane.normal.dot(origin);
          const { normal, constant } = plane;
          const clearance =
            constant -
            Math.abs(normal.x) * halfSize.x -
            Math.abs(normal.y) * halfSize.y -
            Math.abs(normal.z) * halfSize.z;
          if (
            !(
              clearance >
              tolerance *
                (Math.abs(normal.x) + Math.abs(normal.y) + Math.abs(normal.z))
            )
          )
            frustumPlanes.push(plane);
        }
        if (frustumPlanes.length === 0) {
          for (const x of [-halfSize.x, halfSize.x])
            for (const y of [-halfSize.y, halfSize.y])
              for (const z of [-halfSize.z, halfSize.z]) {
                point.set(x, y, z);
                if (
                  !vertices.some(
                    (vertex) =>
                      vertex.distanceToSquared(point) <= toleranceSquared
                  )
                )
                  vertices.push(point.clone());
              }
          continue;
        }
        boxPlanes ??= [
          new Plane(new Vector3(1, 0, 0), halfSize.x),
          new Plane(new Vector3(-1, 0, 0), halfSize.x),
          new Plane(new Vector3(0, 1, 0), halfSize.y),
          new Plane(new Vector3(0, -1, 0), halfSize.y),
          new Plane(new Vector3(0, 0, 1), halfSize.z),
          new Plane(new Vector3(0, 0, -1), halfSize.z),
        ];
        const planes = [...boxPlanes, ...frustumPlanes];
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
      return vertices.map((vertex) => {
        vertex.add(origin);
        return boundsToWorld ? vertex.applyMatrix4(boundsToWorld) : vertex;
      });
    },
    /** Result and contributions array are scratch storage, cleared by the next
     * evaluation; copy contributions before retaining them across calls.
     * Requested area is the largest clipped footprint in viewport pixel units.
     * Contributions pair each camera's error with its own footprint and viewport
     * fraction. Set includeContributions for error-only rows without an area
     * projection; their area fields stay zero until includeVisibleArea is true.
     */
    evaluate(
      bounds: Box3,
      geometricError: number,
      excludeCameraId?: string,
      includeVisibleArea = false,
      boundsToWorld?: Matrix4,
      includeContributions = includeVisibleArea
    ) {
      target.required = false;
      target.receiver = false;
      target.errorRatio = 0;
      target.visibleAreaPixels = 0;
      contributions.length = 0;
      target.contributions = includeContributions ? contributions : undefined;
      target.priority = Number.NEGATIVE_INFINITY;
      if (bounds.isEmpty()) return target;
      const worldBounds = boundsToWorld
        ? evaluationWorldBounds.copy(bounds).applyMatrix4(boundsToWorld)
        : bounds;
      const worldToBounds =
        includeVisibleArea && boundsToWorld
          ? evaluationWorldToBounds.copy(boundsToWorld).invert()
          : undefined;
      for (const view of compiled) {
        if (view.id === excludeCameraId) continue;
        if (!view.frustum.intersectsBox(worldBounds)) continue;
        const fullyInside =
          view.orthographic &&
          view.frustum.planes.every(
            ({ normal, constant }) =>
              normal.x *
                (normal.x < 0 ? worldBounds.max.x : worldBounds.min.x) +
                normal.y *
                  (normal.y < 0 ? worldBounds.max.y : worldBounds.min.y) +
                normal.z *
                  (normal.z < 0 ? worldBounds.max.z : worldBounds.min.z) +
                constant >=
              0
          );
        const footprint = includeVisibleArea
          ? projectedFacingBoxFaces(
              bounds,
              worldBounds,
              view,
              boundsToWorld,
              worldToBounds
            )
          : undefined;
        if (footprint && !Number.isFinite(footprint.depth)) continue;
        let intersectionProven = fullyInside;
        // Orthographic SSE is depth-independent. A real box corner inside
        // the frustum proves demand without enumerating intersection vertices.
        // Edge-only intersections and world-AABB false positives still use
        // the exact solver; an enclosing AABB alone is never a proof.
        if (view.orthographic && !includeVisibleArea && !intersectionProven)
          for (let index = 0; index < 8 && !intersectionProven; index++) {
            intersectionCorner.set(
              index & 4 ? bounds.max.x : bounds.min.x,
              index & 2 ? bounds.max.y : bounds.min.y,
              index & 1 ? bounds.max.z : bounds.min.z
            );
            if (boundsToWorld) intersectionCorner.applyMatrix4(boundsToWorld);
            intersectionProven = view.frustum.containsPoint(intersectionCorner);
          }
        const clipped =
          !footprint &&
          (includeVisibleArea || (view.orthographic && !intersectionProven))
            ? this.intersectionVertices(bounds, view.id, boundsToWorld)
            : undefined;
        let visibleAreaPixels = 0;
        let visibleAreaFraction = 0;
        if (clipped?.length === 0) continue;
        if (includeVisibleArea) {
          visibleAreaPixels =
            ((footprint?.area ??
              projectedIntersectionArea(clipped!, view.clipFromWorld)) *
              view.viewport[0] *
              view.viewport[1]) /
            4;
          visibleAreaFraction =
            visibleAreaPixels / (view.viewport[0] * view.viewport[1]);
          target.visibleAreaPixels = Math.max(
            target.visibleAreaPixels,
            visibleAreaPixels
          );
        }
        let distance = view.minimumScale;
        if (!view.orthographic && footprint) {
          distance = Math.max(
            Number.EPSILON,
            footprint.depth * view.minimumScale
          );
        } else if (!view.orthographic) {
          // Linear view depth reaches its box minimum at this corner. Most
          // interior tiles take this allocation-light path; only clipped
          // corners require the existing convex intersection calculation.
          const e = boundsToWorld
            ? evaluationBoundsToView
                .copy(view.worldToView)
                .multiply(boundsToWorld).elements
            : view.worldToView.elements;
          const nearest = evaluationNearest.set(
            e[2] > 0 ? bounds.max.x : bounds.min.x,
            e[6] > 0 ? bounds.max.y : bounds.min.y,
            e[10] > 0 ? bounds.max.z : bounds.min.z
          );
          if (boundsToWorld) nearest.applyMatrix4(boundsToWorld);
          const visible =
            clipped ??
            (view.frustum.containsPoint(nearest)
              ? [nearest]
              : this.intersectionVertices(bounds, view.id, boundsToWorld));
          if (visible.length === 0) continue;
          let depth = Number.POSITIVE_INFINITY;
          for (const point of visible) {
            depth = Math.min(depth, -point.applyMatrix4(view.worldToView).z);
          }
          // Decision: TILES_COVERAGE.md#camera-normalized-mesh-refinement.
          // Never let an invisible, near portion of the world AABB set SSE.
          distance = Math.max(Number.EPSILON, depth * view.minimumScale);
        }
        const errorPixels = (geometricError * view.focal) / distance;
        const errorRatio = errorPixels / view.errorTargetPixels;
        target.required = true;
        target.priority = Math.max(target.priority, view.priority);
        target.receiver ||= view.role === TILE_CAMERA_ROLE.RECEIVER;
        target.errorRatio = Math.max(target.errorRatio, errorRatio);
        if (includeContributions)
          contributions.push({
            id: view.id,
            role: view.role,
            priority: view.priority,
            errorPixels,
            errorTargetPixels: view.errorTargetPixels,
            errorRatio,
            visibleAreaPixels,
            visibleAreaFraction,
          });
      }
      return target;
    },
  };
};
