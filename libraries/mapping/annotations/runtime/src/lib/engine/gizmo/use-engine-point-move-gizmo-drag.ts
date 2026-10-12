import { useCallback } from "react";
import { Vector3 } from "three";

import {
  createPlaneBasisFromNormal,
  negativePiToPi,
} from "@carma-commons/math";
import {
  AXIS_NUMERIC_EPSILON,
  beginPointerDragSession,
  POINTER_DRAG_SESSION_END_REASONS,
} from "@carma-mapping/gizmo/core";

import type {
  AnnotationEngine,
  AnnotationGizmoAxisCandidate,
} from "../annotation-engine.types";
import {
  restoreGlobalDragCursor,
  setGlobalDragCursor,
} from "./engine-point-move-gizmo-dom";
import {
  getAxisParamFromClientPosition,
  getCanvasPositionFromClientPosition,
  getGroundPointFromClientPosition,
  getPlaneAngleFromClientPosition,
  getPlanePointFromClientPosition,
} from "./engine-point-move-gizmo-math";
import type {
  AxisDragState,
  PointMoveGizmoState,
} from "./engine-point-move-gizmo-state";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** Window listeners, drag state, grabbing cursor and the drag-state callback. */
const activateDrag = (
  engine: AnnotationEngine,
  gizmo: PointMoveGizmoState,
  dragState: DistributiveOmit<AxisDragState, "cleanupWindowListeners">,
  onMove: (event: MouseEvent) => void,
  stopDragging: (exitMoveMode: boolean) => void
) => {
  const dragSession = beginPointerDragSession({
    onMove,
    onEnd: ({ reason }) => {
      if (reason === POINTER_DRAG_SESSION_END_REASONS.RELEASE) {
        gizmo.suppressNextSceneClick = true;
      }
      stopDragging(false);
    },
  });
  gizmo.dragState = {
    ...dragState,
    cleanupWindowListeners: dragSession.cleanup,
  } as AxisDragState;
  gizmo.isDragging = true;
  setGlobalDragCursor(gizmo, "grabbing");
  gizmo.onDragStateChange?.(true);
  engine.requestRender();
};

/** Publishes synchronously so the disc and overlays repaint the requested frame ahead of the React commit. */
const publishLivePosition = (
  engine: AnnotationEngine,
  gizmo: PointMoveGizmoState,
  pointId: string,
  position: Vector3,
  event: MouseEvent
) => {
  gizmo.livePointPositions.set(pointId, position);
  gizmo.onPointPositionChange?.(
    pointId,
    position,
    engine.isDestroyed()
      ? undefined
      : getCanvasPositionFromClientPosition(
          engine,
          event.clientX,
          event.clientY
        )
  );
  engine.requestRender();
};

/** Axis translation, plane translation and rotation drags of the gizmo. */
export const usePointMoveGizmoDrag = (
  engine: AnnotationEngine | null,
  gizmo: PointMoveGizmoState,
  {
    excludeRegisteredDragSampleOccluders,
    getAxisCandidatesAtPosition,
    getActiveAxisAtPosition,
    getDiscPlaneNormalAtPosition,
  }: {
    excludeRegisteredDragSampleOccluders: boolean;
    getAxisCandidatesAtPosition: (
      origin: Vector3
    ) => AnnotationGizmoAxisCandidate[];
    getActiveAxisAtPosition: (origin: Vector3) => AnnotationGizmoAxisCandidate;
    getDiscPlaneNormalAtPosition: (origin: Vector3) => Vector3;
  }
) => {
  const stopDragging = useCallback(
    (exitMoveMode: boolean) => {
      const dragMode = gizmo.dragState?.mode ?? null;
      if (gizmo.dragState) {
        gizmo.dragState.cleanupWindowListeners();
        gizmo.dragState = null;
      }
      if (dragMode === "rotate") gizmo.axisAnchorDistance = {};
      restoreGlobalDragCursor(gizmo);
      // The next drag captures (and may re-step) its own frozen radius.
      gizmo.frozenDragDiscRadius = null;
      if (gizmo.isDragging) {
        gizmo.isDragging = false;
        gizmo.onDragStateChange?.(false);
      }
      if (exitMoveMode) gizmo.onExit?.();
    },
    [gizmo]
  );

  const startDragging = useCallback(
    (
      clientX: number,
      clientY: number,
      axisCandidateOverride?: AnnotationGizmoAxisCandidate
    ) => {
      if (
        !engine ||
        engine.isDestroyed() ||
        !gizmo.movePoint ||
        !gizmo.onPointPositionChange
      ) {
        return;
      }
      // Recover from stale drag state, e.g. a mouseup lost outside the window.
      if (gizmo.dragState || gizmo.isDragging) stopDragging(false);

      const activePoint = gizmo.movePoint;
      const axisOrigin = activePoint.geometryECEF.clone();
      const activeAxisCandidate = axisCandidateOverride
        ? getAxisCandidatesAtPosition(axisOrigin).find(
            (candidate) => candidate.id === axisCandidateOverride.id
          ) ?? axisCandidateOverride
        : getActiveAxisAtPosition(axisOrigin);
      const axisDirection = activeAxisCandidate.direction.clone();
      gizmo.activeAxisId = activeAxisCandidate.id;
      if (gizmo.axisVisualizer && !engine.isDestroyed()) {
        gizmo.axisVisualizer.update(axisOrigin, axisDirection);
      }
      gizmo.onAxisDirectionChange?.(axisDirection, activeAxisCandidate.title);
      const startAxisParam = getAxisParamFromClientPosition(
        engine,
        clientX,
        clientY,
        axisOrigin,
        axisDirection
      );
      if (startAxisParam === null) return;

      const onMove = (event: MouseEvent) => {
        const dragState = gizmo.dragState;
        if (dragState?.mode !== "translate" || !gizmo.movePoint) return;
        const axisParam = getAxisParamFromClientPosition(
          engine,
          event.clientX,
          event.clientY,
          dragState.axisOrigin,
          dragState.axisDirection
        );
        if (axisParam === null) return;
        const nextPosition = dragState.axisOrigin
          .clone()
          .addScaledVector(
            dragState.axisDirection,
            axisParam - dragState.startAxisParam
          );
        publishLivePosition(
          engine,
          gizmo,
          dragState.pointId,
          nextPosition,
          event
        );
      };

      activateDrag(
        engine,
        gizmo,
        {
          mode: "translate",
          pointId: activePoint.id,
          axisOrigin,
          axisDirection,
          startAxisParam,
        },
        onMove,
        stopDragging
      );
    },
    [
      engine,
      getActiveAxisAtPosition,
      getAxisCandidatesAtPosition,
      gizmo,
      stopDragging,
    ]
  );

  const startRotating = useCallback(
    (clientX: number, clientY: number) => {
      if (!engine || engine.isDestroyed() || !gizmo.movePoint) return;
      if (gizmo.dragState || gizmo.isDragging) stopDragging(false);

      gizmo.axisAnchorDistance = {};

      const activePoint = gizmo.movePoint;
      const axisOrigin = activePoint.geometryECEF.clone();
      const activeAxisCandidate = getActiveAxisAtPosition(axisOrigin);
      const rotationNormal = activeAxisCandidate.direction.clone();
      gizmo.activeAxisId = activeAxisCandidate.id;

      const baseDirections: Record<string, Vector3> = {};
      getAxisCandidatesAtPosition(axisOrigin).forEach((candidate) => {
        baseDirections[candidate.id] = candidate.direction.clone().normalize();
      });
      gizmo.rotationFrame = {
        pointId: activePoint.id,
        activeAxisId: activeAxisCandidate.id,
        normal: rotationNormal.clone().normalize(),
        baseDirections,
      };

      const planeBasis = createPlaneBasisFromNormal(rotationNormal);
      const startPlaneAngleRad = getPlaneAngleFromClientPosition(
        engine,
        clientX,
        clientY,
        axisOrigin,
        rotationNormal,
        planeBasis.xAxis,
        planeBasis.yAxis
      );
      if (startPlaneAngleRad === null) return;

      const currentRotationState = gizmo.rotationState;
      const baseRotationAngleRad =
        currentRotationState?.pointId === activePoint.id
          ? currentRotationState.angleRad
          : 0;

      const onMove = (event: MouseEvent) => {
        const dragState = gizmo.dragState;
        if (dragState?.mode !== "rotate") return;
        const nextPlaneAngleRad = getPlaneAngleFromClientPosition(
          engine,
          event.clientX,
          event.clientY,
          dragState.axisOrigin,
          dragState.rotationNormal,
          dragState.planeBasisX,
          dragState.planeBasisY
        );
        if (nextPlaneAngleRad === null) return;

        const incrementalDelta = negativePiToPi(
          nextPlaneAngleRad - dragState.lastPlaneAngleRad
        );
        dragState.lastPlaneAngleRad = nextPlaneAngleRad;
        // Keep the rotation direction independent of the camera side.
        dragState.accumulatedDeltaRad -= incrementalDelta;
        gizmo.rotationState = {
          pointId: dragState.pointId,
          normal: dragState.rotationNormal.clone(),
          angleRad:
            dragState.baseRotationAngleRad + dragState.accumulatedDeltaRad,
        };
        gizmo.onRotationDelta?.({
          pointId: dragState.pointId,
          axisOrigin: dragState.axisOrigin.clone(),
          rotationNormal: dragState.rotationNormal.clone(),
          deltaAngleRad: -incrementalDelta,
          accumulatedAngleRad: dragState.accumulatedDeltaRad,
        });
        engine.requestRender();
      };

      activateDrag(
        engine,
        gizmo,
        {
          mode: "rotate",
          pointId: activePoint.id,
          axisOrigin,
          rotationNormal,
          planeBasisX: planeBasis.xAxis,
          planeBasisY: planeBasis.yAxis,
          lastPlaneAngleRad: startPlaneAngleRad,
          accumulatedDeltaRad: 0,
          baseRotationAngleRad,
        },
        onMove,
        stopDragging
      );
    },
    [
      engine,
      getActiveAxisAtPosition,
      getAxisCandidatesAtPosition,
      gizmo,
      stopDragging,
    ]
  );

  const startPlaneDragging = useCallback(
    (
      clientX: number,
      clientY: number,
      options?: { snapToGround?: boolean }
    ) => {
      if (
        !engine ||
        engine.isDestroyed() ||
        !gizmo.movePoint ||
        !gizmo.onPointPositionChange
      ) {
        return;
      }
      if (gizmo.dragState || gizmo.isDragging) stopDragging(false);

      const activePoint = gizmo.movePoint;
      const shouldSnapToGround = options?.snapToGround === true;
      const sampleGround = (x: number, y: number) =>
        getGroundPointFromClientPosition(engine, x, y, {
          includeDragSampleExclusions: excludeRegisteredDragSampleOccluders,
        });
      const planeOrigin = activePoint.geometryECEF.clone();
      const planeNormal = getDiscPlaneNormalAtPosition(planeOrigin);
      const configuredDiscPlaneNormal = gizmo.discPlaneNormal;

      // A configured disc plane spans its own basis; otherwise the two
      // inactive axes span the plane when they are not parallel.
      let planeBasis = createPlaneBasisFromNormal(planeNormal);
      if (
        !(
          configuredDiscPlaneNormal &&
          configuredDiscPlaneNormal.lengthSq() > AXIS_NUMERIC_EPSILON
        )
      ) {
        const activeAxisId = getActiveAxisAtPosition(planeOrigin).id;
        const [firstAxis, secondAxis] = getAxisCandidatesAtPosition(planeOrigin)
          .filter((candidate) => candidate.id !== activeAxisId)
          .map((candidate) => candidate.direction.clone().normalize());
        if (
          firstAxis &&
          secondAxis &&
          new Vector3().crossVectors(firstAxis, secondAxis).lengthSq() >
            AXIS_NUMERIC_EPSILON
        ) {
          planeBasis = { xAxis: firstAxis, yAxis: secondAxis };
        }
      }

      const startPlanePoint =
        (shouldSnapToGround ? sampleGround(clientX, clientY) : null) ??
        getPlanePointFromClientPosition(
          engine,
          clientX,
          clientY,
          planeOrigin,
          planeNormal
        ) ??
        (shouldSnapToGround ? planeOrigin.clone() : null);
      if (!startPlanePoint) return;

      const onMove = (event: MouseEvent) => {
        const dragState = gizmo.dragState;
        if (dragState?.mode !== "plane-translate") return;

        if (shouldSnapToGround) {
          const nextGroundPoint = sampleGround(event.clientX, event.clientY);
          if (nextGroundPoint) {
            publishLivePosition(
              engine,
              gizmo,
              dragState.pointId,
              nextGroundPoint,
              event
            );
            return;
          }
        }

        const nextPlanePoint = getPlanePointFromClientPosition(
          engine,
          event.clientX,
          event.clientY,
          dragState.planeOrigin,
          dragState.planeNormal
        );
        if (!nextPlanePoint) return;

        const delta = new Vector3().subVectors(
          nextPlanePoint,
          dragState.startPlanePoint
        );
        const nextPosition = dragState.planeOrigin
          .clone()
          .addScaledVector(
            dragState.planeBasisX,
            delta.dot(dragState.planeBasisX)
          )
          .addScaledVector(
            dragState.planeBasisY,
            delta.dot(dragState.planeBasisY)
          );
        publishLivePosition(
          engine,
          gizmo,
          dragState.pointId,
          nextPosition,
          event
        );
      };

      activateDrag(
        engine,
        gizmo,
        {
          mode: "plane-translate",
          pointId: activePoint.id,
          planeOrigin,
          planeNormal,
          planeBasisX: planeBasis.xAxis,
          planeBasisY: planeBasis.yAxis,
          startPlanePoint,
        },
        onMove,
        stopDragging
      );
    },
    [
      engine,
      excludeRegisteredDragSampleOccluders,
      getActiveAxisAtPosition,
      getAxisCandidatesAtPosition,
      getDiscPlaneNormalAtPosition,
      gizmo,
      stopDragging,
    ]
  );

  return { stopDragging, startDragging, startRotating, startPlaneDragging };
};
