import type { Vector3 } from "three";

import { getEllipsoidalUpDirectionAtAnchor } from "@carma-geo/proj";
import type { Point2 } from "@carma-commons/math";
import {
  ARROW_PERSPECTIVE_SCALE_MAX,
  ARROW_PERSPECTIVE_SCALE_MIN,
  AXIS_NUMERIC_EPSILON,
  DISC_OUTLINE_COLOR,
} from "@carma-mapping/gizmo/core";

import type {
  AnnotationEngine,
  AnnotationGizmoAxisCandidate,
} from "@carma-mapping/annotations/core";
import {
  computeAxisFrame,
  type PointMoveGizmoAxisFrame,
} from "./engine-point-move-gizmo-axis-layout";
import {
  computeDiscOutlines,
  computeRotationHandle,
  type ProjectedDiscOutline,
  type RotationHandleFrame,
} from "./engine-point-move-gizmo-disc-layout";
import type { PointMoveGizmoState } from "./engine-point-move-gizmo-state";

export type PointMoveGizmoFrameOptions = {
  showDisc: boolean;
  showRotationHandle: boolean;
  discOutlineScreenPixelRadius: number;
  arrowActiveEdgePx: number;
  arrowInactiveEdgePx: number;
  axisArrowOffsetPx: number;
  getAxisCandidatesAtPosition: (
    origin: Vector3
  ) => AnnotationGizmoAxisCandidate[];
  getDiscPlaneNormalAtPosition: (origin: Vector3) => Vector3;
  resolveDiscWorldRadiusForFrame: (origin: Vector3, normal: Vector3) => number;
};

/** Everything the gizmo shows for one frame; the scene models and the overlay read the same layout. */
export type PointMoveGizmoFrame = {
  /** The live anchor: the drag position ahead of the React commit. */
  origin: Vector3;
  anchorCanvasPosition: Point2;
  axisCandidates: AnnotationGizmoAxisCandidate[];
  activeAxis: AnnotationGizmoAxisCandidate | null;
  outlinesByAxisId: Map<string, ProjectedDiscOutline>;
  activeOutline: ProjectedDiscOutline | undefined;
  /** Plane and world radius of the filled scene disc. */
  discPlaneNormal: Vector3;
  discWorldRadius: number;
  axes: PointMoveGizmoAxisFrame[];
  rotationHandle: RotationHandleFrame | null;
  cameraPositionECEF: Vector3 | null;
};

/**
 * Lays the gizmo out at its live anchor for the engine's current view: the
 * disc outlines, the arrow cones at their screen offsets and the rotation
 * handle. Null while the anchor does not project.
 */
export const layoutPointMoveGizmoFrame = (
  engine: AnnotationEngine,
  gizmo: PointMoveGizmoState,
  options: PointMoveGizmoFrameOptions
): PointMoveGizmoFrame | null => {
  const rawPoint = gizmo.movePoint;
  if (!rawPoint || engine.isDestroyed()) return null;
  const origin =
    gizmo.livePointPositions.get(rawPoint.id) ?? rawPoint.geometryECEF;
  const anchorCanvasPosition = engine.worldToScreen(origin);
  if (!anchorCanvasPosition) return null;
  const axisCandidates = options.getAxisCandidatesAtPosition(origin);
  const activeAxis =
    axisCandidates.find((candidate) => candidate.id === gizmo.activeAxisId) ??
    axisCandidates[0] ??
    null;
  const activeAxisId = activeAxis?.id ?? null;
  const configuredPlane = gizmo.discPlaneNormal;
  const discPlaneNormal = options.getDiscPlaneNormalAtPosition(origin);
  const fixedDiscPlaneNormal =
    configuredPlane && configuredPlane.lengthSq() > AXIS_NUMERIC_EPSILON
      ? discPlaneNormal
      : null;

  const outlinesByAxisId = computeDiscOutlines({
    engine,
    origin,
    anchorCanvasPosition,
    axisCandidates,
    fixedDiscPlaneNormal,
    discOutlineScreenPixelRadius: options.discOutlineScreenPixelRadius,
    resolveDiscWorldRadiusForFrame: options.resolveDiscWorldRadiusForFrame,
  });
  const activeOutline = activeAxisId
    ? outlinesByAxisId.get(activeAxisId)
    : undefined;
  const arrowPerspectiveScale =
    activeOutline && options.discOutlineScreenPixelRadius > AXIS_NUMERIC_EPSILON
      ? Math.min(
          ARROW_PERSPECTIVE_SCALE_MAX,
          Math.max(
            ARROW_PERSPECTIVE_SCALE_MIN,
            activeOutline.supportRadius / options.discOutlineScreenPixelRadius
          )
        )
      : 1;
  const rotationHandle =
    options.showRotationHandle && options.showDisc && activeOutline
      ? computeRotationHandle({
          engine,
          origin,
          anchorCanvasPosition,
          axisCandidates,
          activeAxisId,
          activeOutline,
          activeNormal: (
            fixedDiscPlaneNormal ??
            activeAxis?.direction ??
            getEllipsoidalUpDirectionAtAnchor(origin)
          )
            .clone()
            .normalize(),
          activeAxisColor: activeAxis?.color ?? DISC_OUTLINE_COLOR,
        })
      : null;
  const cameraPosition = engine.getCameraPositionECEF();
  const axes = axisCandidates.map((axisCandidate) =>
    computeAxisFrame({
      engine,
      gizmo,
      origin,
      anchorCanvasPosition,
      axisCandidate,
      activeAxisId,
      activeOutline,
      outlinesByAxisId,
      arrowPerspectiveScale,
      arrowActiveEdgePx: options.arrowActiveEdgePx,
      arrowInactiveEdgePx: options.arrowInactiveEdgePx,
      axisArrowOffsetPx: options.axisArrowOffsetPx,
      cameraPosition,
    })
  );

  return {
    origin,
    anchorCanvasPosition,
    axisCandidates,
    activeAxis,
    outlinesByAxisId,
    activeOutline,
    discPlaneNormal,
    discWorldRadius: options.resolveDiscWorldRadiusForFrame(
      origin,
      discPlaneNormal
    ),
    axes,
    rotationHandle,
    cameraPositionECEF: cameraPosition,
  };
};

/**
 * The frame layout once per rendered frame for every scene model that reads
 * it, with the options of the latest render; outside a frame (no key) it is
 * laid out on each call.
 */
export const createPointMoveGizmoFrameReader = (
  engine: AnnotationEngine,
  gizmo: PointMoveGizmoState,
  getOptions: () => PointMoveGizmoFrameOptions
): (() => PointMoveGizmoFrame | null) => {
  let cachedKey: number | null = null;
  let cachedOptions: PointMoveGizmoFrameOptions | null = null;
  let cached: PointMoveGizmoFrame | null = null;
  return () => {
    const frameKey = engine.isDestroyed() ? null : engine.getFrameKey();
    const options = getOptions();
    const point = gizmo.movePoint;
    const origin = point
      ? gizmo.livePointPositions.get(point.id) ?? point.geometryECEF
      : null;
    if (
      frameKey !== null &&
      frameKey === cachedKey &&
      options === cachedOptions &&
      cached !== null &&
      origin !== null &&
      cached.origin.equals(origin)
    ) {
      return cached;
    }
    cached = layoutPointMoveGizmoFrame(engine, gizmo, options);
    cachedKey = frameKey;
    cachedOptions = options;
    return cached;
  };
};
