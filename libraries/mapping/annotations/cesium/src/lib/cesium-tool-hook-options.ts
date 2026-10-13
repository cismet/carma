/** The engine-neutral point query and point-move gizmo options as the Cesium hooks take them. */

import type { Vector3 } from "three";
import type { Cartesian3 } from "@carma-cesium";
import {
  cartesian3FromVector3,
  cartesian3ToVector3,
} from "@carma-mapping/engines/cesium/core";
import {
  CESIUM_POINT_QUERY_CLICK_STRATEGY,
  type CesiumPointQueryOptions,
} from "@carma-mapping/engines/cesium/react/interactions";
import type {
  CesiumGizmoPoint,
  CesiumMoveGizmoAxisCandidate,
  UseCesiumPointMoveGizmoOptions,
} from "@carma-mapping/gizmo/cesium";
import {
  ANNOTATION_POINT_QUERY_CLICK_STRATEGY,
  type AnnotationGizmoAxisCandidate,
  type AnnotationGizmoPoint,
  type AnnotationPointMoveGizmoOptions,
  type AnnotationPointQueryOptions,
} from "@carma-mapping/annotations/core";

import {
  screenPositionFromCartesian2,
  vector3FromOptionalCartesian3,
} from "./cesium-vector-conversions";

const clickStrategyToCesium = (
  strategy: AnnotationPointQueryOptions["clickStrategy"]
) =>
  strategy === ANNOTATION_POINT_QUERY_CLICK_STRATEGY.DELAYED_LINE_FINISH
    ? CESIUM_POINT_QUERY_CLICK_STRATEGY.DELAYED_LINE_FINISH
    : CESIUM_POINT_QUERY_CLICK_STRATEGY.IMMEDIATE;

export const cesiumPointQueryOptions = (
  options: AnnotationPointQueryOptions
): CesiumPointQueryOptions => ({
  enabled: options.enabled,
  hideCursorWhileEnabled: options.hideCursorWhileEnabled,
  clickStrategy: clickStrategyToCesium(options.clickStrategy),
  config: options.config,
  inputModifiers: options.inputModifiers,
  // The Cesium hook asks before a pick resolved (null on a miss); the engine
  // contract only vetoes resolved picks, so a miss passes through untouched.
  onBeforePointCreate: options.onBeforePointCreate
    ? (positionECEF, screenPosition) =>
        positionECEF
          ? options.onBeforePointCreate!({
              screenPosition: screenPositionFromCartesian2(screenPosition),
              pickedPositionECEF: cartesian3ToVector3(positionECEF),
              globePositionECEF: null,
            })
          : true
    : undefined,
  onPointCreate: options.onPointCreate
    ? (payload) =>
        options.onPointCreate!({
          screenPosition: screenPositionFromCartesian2(payload.screenPosition),
          pickedPositionECEF: cartesian3ToVector3(payload.pickedPositionECEF),
          globePositionECEF: vector3FromOptionalCartesian3(
            payload.globePositionECEF
          ),
          inputModifier: payload.inputModifier,
        })
    : undefined,
  onLineFinish: options.onLineFinish,
  onPointerMove: options.onPointerMove
    ? (positionECEF, screenPosition, surfaceNormalECEF, moveOptions) =>
        options.onPointerMove!(
          vector3FromOptionalCartesian3(positionECEF),
          screenPositionFromCartesian2(screenPosition),
          vector3FromOptionalCartesian3(surfaceNormalECEF),
          moveOptions
        )
    : undefined,
  onScreenPositionChange: options.onScreenPositionChange
    ? (screenPosition) =>
        options.onScreenPositionChange!(
          screenPosition ? screenPositionFromCartesian2(screenPosition) : null
        )
    : undefined,
});

/**
 * A converted gizmo input keeps its identity while its source does: the same
 * points or candidates array, the same vector with unchanged components. The
 * Cesium gizmo effects then do not restart on every render.
 */
export const createGizmoInputCache = () => {
  const pointsCache = new WeakMap<AnnotationGizmoPoint[], CesiumGizmoPoint[]>();
  const vectorCache = new WeakMap<
    Vector3,
    { key: string; converted: Cartesian3 }
  >();
  const candidatesCache = new WeakMap<
    AnnotationGizmoAxisCandidate[],
    CesiumMoveGizmoAxisCandidate[]
  >();
  const vectorKey = (vector: Vector3) => `${vector.x},${vector.y},${vector.z}`;
  const convertVector = (
    vector: Vector3 | null | undefined
  ): Cartesian3 | null => {
    if (!vector) return null;
    const cached = vectorCache.get(vector);
    const key = vectorKey(vector);
    if (cached && cached.key === key) return cached.converted;
    const converted = cartesian3FromVector3(vector);
    vectorCache.set(vector, { key, converted });
    return converted;
  };
  const convertPoints = (points: AnnotationGizmoPoint[]) => {
    const cached = pointsCache.get(points);
    if (cached) return cached;
    const converted = points.map((point) => ({
      id: point.id,
      geometryECEF: cartesian3FromVector3(point.geometryECEF),
    }));
    pointsCache.set(points, converted);
    return converted;
  };
  const convertCandidates = (
    candidates: AnnotationGizmoAxisCandidate[] | null | undefined
  ): CesiumMoveGizmoAxisCandidate[] | null => {
    if (!candidates) return null;
    const cached = candidatesCache.get(candidates);
    if (cached) return cached;
    const converted = candidates.map((candidate) => ({
      id: candidate.id,
      direction: cartesian3FromVector3(candidate.direction),
      color: candidate.color,
      title: candidate.title,
    }));
    candidatesCache.set(candidates, converted);
    return converted;
  };
  return { convertVector, convertPoints, convertCandidates };
};

export const cesiumGizmoOptions = (
  options: AnnotationPointMoveGizmoOptions,
  cache: ReturnType<typeof createGizmoInputCache>
): UseCesiumPointMoveGizmoOptions => ({
  points: cache.convertPoints(options.points),
  labels: options.labels,
  movePointId: options.movePointId,
  axisDirection: cache.convertVector(options.axisDirection),
  discPlaneNormal: cache.convertVector(options.discPlaneNormal),
  axisTitle: options.axisTitle,
  preferredAxisId: options.preferredAxisId,
  axisCandidates: cache.convertCandidates(options.axisCandidates),
  showRotationHandle: options.showRotationHandle,
  showAxes: options.showAxes,
  showDisc: options.showDisc,
  discScalingMode: options.discScalingMode,
  discOutlineScreenPixelRadius: options.discOutlineScreenPixelRadius,
  discResizeWorldRadiusToScreenTarget:
    options.discResizeWorldRadiusToScreenTarget,
  discQuantizeWorldRadius: options.discQuantizeWorldRadius,
  freezeDiscScaleDuringDrag: options.freezeDiscScaleDuringDrag,
  discResizeStepFactor: options.discResizeStepFactor,
  showDiscRadiusLabel: options.showDiscRadiusLabel,
  axisWidthPx: options.axisWidthPx,
  outlineWidthPx: options.outlineWidthPx,
  arrowActiveEdgePx: options.arrowActiveEdgePx,
  arrowInactiveEdgePx: options.arrowInactiveEdgePx,
  snapPlaneDragToGround: options.snapPlaneDragToGround,
  excludeRegisteredDragSampleOccluders:
    options.excludeRegisteredDragSampleOccluders,
  radius: options.radius,
  onPointPositionChange: options.onPointPositionChange
    ? (pointId, nextPosition, screenPosition) =>
        options.onPointPositionChange!(
          pointId,
          cartesian3ToVector3(nextPosition),
          screenPosition
        )
    : undefined,
  onDragStateChange: options.onDragStateChange,
  onAxisDirectionChange: options.onAxisDirectionChange
    ? (axisDirection, axisTitle) =>
        options.onAxisDirectionChange!(
          cartesian3ToVector3(axisDirection),
          axisTitle
        )
    : undefined,
  onRotationDelta: options.onRotationDelta
    ? (delta) =>
        options.onRotationDelta!({
          pointId: delta.pointId,
          axisOrigin: cartesian3ToVector3(delta.axisOrigin),
          rotationNormal: cartesian3ToVector3(delta.rotationNormal),
          deltaAngleRad: delta.deltaAngleRad,
          accumulatedAngleRad: delta.accumulatedAngleRad,
        })
    : undefined,
  onExit: options.onExit,
});
