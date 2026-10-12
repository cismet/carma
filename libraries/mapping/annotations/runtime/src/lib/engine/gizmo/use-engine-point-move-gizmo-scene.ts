import { useEffect } from "react";
import type { Vector3 } from "three";

import { computeCircleSegments } from "@carma-commons/math";
import { safeCall, safeDestroy } from "@carma-mapping/gizmo/core";
import {
  createOrientedDiscMatrix,
  type AnnotationEngine,
  type AnnotationGizmoAxisCandidate,
} from "@carma-mapping/annotations/core";

import {
  AXIS_LINE_COLOR,
  DISC_FILL_COLOR,
  DISC_FILL_OPACITY,
} from "./engine-point-move-gizmo-constants";
import type { PointMoveGizmoState } from "./engine-point-move-gizmo-state";
import { createEngineRotationAxisVisualizer } from "./engine-rotation-axis-visualizer";

/** Removes the frame listener, the axis line and the disc of the gizmo. */
export const releaseGizmoScenePrimitives = (gizmo: PointMoveGizmoState) => {
  safeCall(gizmo.removeDiscFrameListener);
  gizmo.removeDiscFrameListener = null;
  safeDestroy(gizmo.axisVisualizer);
  gizmo.axisVisualizer = null;
  safeDestroy(gizmo.discVisualizer);
  gizmo.discVisualizer = null;
};

/** The dashed axis line and the filled disc in the scene, kept on the live anchor every frame. */
export const usePointMoveGizmoScene = (
  engine: AnnotationEngine | null,
  gizmo: PointMoveGizmoState,
  {
    movePointKey,
    showAxes,
    showDisc,
    axisWidthPx,
    discOutlineScreenPixelRadius,
    getActiveAxisAtPosition,
    getDiscPlaneNormalAtPosition,
    computeDiscWorldRadius,
    resolveDiscWorldRadiusForFrame,
  }: {
    movePointKey: string | null;
    showAxes: boolean;
    showDisc: boolean;
    axisWidthPx: number;
    discOutlineScreenPixelRadius: number;
    getActiveAxisAtPosition: (origin: Vector3) => AnnotationGizmoAxisCandidate;
    getDiscPlaneNormalAtPosition: (origin: Vector3) => Vector3;
    computeDiscWorldRadius: (origin: Vector3, planeNormal: Vector3) => number;
    resolveDiscWorldRadiusForFrame: (
      origin: Vector3,
      planeNormal: Vector3
    ) => number;
  }
) => {
  useEffect(() => {
    // Synced to this render's point by the earlier movePoint effect.
    const movePoint = gizmo.movePoint;
    // At most one axis/disc pair: release before (re)attaching.
    releaseGizmoScenePrimitives(gizmo);
    if (!engine || engine.isDestroyed() || !movePoint) return;

    const initialAxisDirection = getActiveAxisAtPosition(
      movePoint.geometryECEF
    ).direction;
    const initialDiscPlaneNormal = getDiscPlaneNormalAtPosition(
      movePoint.geometryECEF
    );
    if (showAxes) {
      const visualizer = createEngineRotationAxisVisualizer(
        `point-move-axis-${movePoint.id}`,
        {
          origin: movePoint.geometryECEF,
          upVector: initialAxisDirection,
          lengthMultiplier: 2,
          dashPixelLength: 5,
          gapPixelLength: 3,
          color: AXIS_LINE_COLOR,
          width: axisWidthPx,
        }
      );
      visualizer.attach(engine, () => engine.requestRender());
      gizmo.axisVisualizer = visualizer;
    }

    if (showDisc) {
      // A fresh selection captures its stepped size anew.
      gizmo.discSteppedScaler.reset();
      // Tessellated from the apparent screen size so the ring reads round.
      gizmo.discVisualizer = engine.createRing({
        id: `point-move-disc-${movePoint.id}`,
        radius: 1,
        innerRadius: 0.5,
        color: DISC_FILL_COLOR,
        opacity: DISC_FILL_OPACITY,
        segments: computeCircleSegments(discOutlineScreenPixelRadius),
        modelMatrix: createOrientedDiscMatrix(
          movePoint.geometryECEF,
          initialDiscPlaneNormal,
          computeDiscWorldRadius(
            movePoint.geometryECEF,
            initialDiscPlaneNormal
          ),
          gizmo.discModelMatrix
        ),
      });
    }

    // Before the engine builds the frame, so the primitives match the DOM
    // overlay; the adapter keeps them out of surface picks by itself.
    gizmo.removeDiscFrameListener = engine.subscribePreRender(() => {
      try {
        const currentPoint = gizmo.movePoint;
        if (!currentPoint || engine.isDestroyed()) return;

        const livePosition =
          gizmo.livePointPositions.get(currentPoint.id) ??
          currentPoint.geometryECEF;
        const axisDirection = getActiveAxisAtPosition(livePosition).direction;
        const discPlaneNormal = getDiscPlaneNormalAtPosition(livePosition);
        gizmo.axisVisualizer?.update(livePosition, axisDirection);

        gizmo.discVisualizer?.setModelMatrix(
          createOrientedDiscMatrix(
            livePosition,
            discPlaneNormal,
            resolveDiscWorldRadiusForFrame(livePosition, discPlaneNormal),
            gizmo.discModelMatrix
          )
        );
      } catch {
        // Frame races during teardown.
      }
    });

    engine.requestRender();

    return () => {
      releaseGizmoScenePrimitives(gizmo);
      if (!engine.isDestroyed()) engine.requestRender();
    };
  }, [
    axisWidthPx,
    computeDiscWorldRadius,
    discOutlineScreenPixelRadius,
    engine,
    getActiveAxisAtPosition,
    getDiscPlaneNormalAtPosition,
    gizmo,
    movePointKey,
    resolveDiscWorldRadiusForFrame,
    showAxes,
    showDisc,
  ]);
};
