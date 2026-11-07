import { useCallback, useEffect, useMemo } from "react";
import type { Vector3 } from "three";

import {
  createPlaneBasisFromNormal,
  resolveWorldSizeForScreenTarget,
} from "@carma-commons/math";
import {
  AXIS_NUMERIC_EPSILON,
  DISC_PROJECTION_SCALE_SAMPLE_COUNT,
} from "@carma-mapping/gizmo/core";

import {
  ANNOTATION_GIZMO_DISC_SCALING_MODES,
  type AnnotationEngine,
  type AnnotationDiscSizingOptions,
  type AnnotationGizmoDiscScalingMode,
} from "@carma-mapping/annotations/core";
import { canDrawPointMoveGizmoInScene } from "./engine-point-move-gizmo-scene-models";
import { getPlanePixelsPerWorldMax } from "./engine-point-move-gizmo-math";
import { createSceneDiscSizing } from "../../interaction/scene-disc-sizing";
import type { PointMoveGizmoState } from "./engine-point-move-gizmo-state";

/** World radius of the disc for the scaling mode, frozen while a drag asks for it. */
export const usePointMoveGizmoDiscRadius = (
  engine: AnnotationEngine | null,
  gizmo: PointMoveGizmoState,
  {
    discScalingMode,
    discOutlineScreenPixelRadius,
    discResizeWorldRadiusToScreenTarget,
    discQuantizeWorldRadius,
    discSizing,
  }: {
    discScalingMode: AnnotationGizmoDiscScalingMode;
    discOutlineScreenPixelRadius: number;
    discResizeWorldRadiusToScreenTarget: boolean;
    discQuantizeWorldRadius: boolean;
    discSizing?: Partial<AnnotationDiscSizingOptions>;
  }
) => {
  const sceneSizing = useMemo(
    () =>
      engine && discSizing && canDrawPointMoveGizmoInScene(engine)
        ? createSceneDiscSizing(
            engine,
            discSizing,
            Math.max(gizmo.radius, AXIS_NUMERIC_EPSILON)
          )
        : null,
    [engine, discSizing, gizmo]
  );
  useEffect(() => {
    if (!sceneSizing) return;
    sceneSizing.start(() => {
      if (gizmo.movePoint) engine?.requestRender();
    });
    return () => sceneSizing.destroy();
  }, [engine, gizmo, sceneSizing]);
  const resolveScreenFixedDiscWorldRadius = useCallback(
    (
      origin: Vector3,
      planeNormal: Vector3,
      configuredWorldRadius: number
    ): number => {
      const baseRadius = Math.max(configuredWorldRadius, AXIS_NUMERIC_EPSILON);
      if (!engine || engine.isDestroyed()) return baseRadius;

      const anchorCanvasPosition = engine.worldToScreen(origin);
      if (!anchorCanvasPosition) return baseRadius;

      const pixelPerWorldMax = getPlanePixelsPerWorldMax(
        engine,
        origin,
        createPlaneBasisFromNormal(planeNormal),
        anchorCanvasPosition,
        DISC_PROJECTION_SCALE_SAMPLE_COUNT
      );
      if (pixelPerWorldMax <= AXIS_NUMERIC_EPSILON) return baseRadius;

      const worldRadius = resolveWorldSizeForScreenTarget({
        targetScreenPx: discOutlineScreenPixelRadius,
        pixelPerWorld: pixelPerWorldMax,
        quantize: false,
      });
      return Math.max(worldRadius, AXIS_NUMERIC_EPSILON);
    },
    [discOutlineScreenPixelRadius, engine]
  );

  const resolveSteppedDiscWorldRadius = useCallback(
    (origin: Vector3): number => {
      const fallback = Math.max(gizmo.radius, AXIS_NUMERIC_EPSILON);
      if (!engine || engine.isDestroyed()) return fallback;

      return gizmo.discSteppedScaler.resolve({
        currentScale: engine.getScreenPixelsPerMeterAt(origin),
        targetScreenPx: discOutlineScreenPixelRadius,
        fallback,
        stepFactor: gizmo.stepFactor,
        quantize: discQuantizeWorldRadius,
        minWorldSize: AXIS_NUMERIC_EPSILON,
      });
    },
    [discOutlineScreenPixelRadius, discQuantizeWorldRadius, engine, gizmo]
  );

  const computeDiscWorldRadius = useCallback(
    (origin: Vector3, planeNormal: Vector3): number => {
      if (sceneSizing) return sceneSizing.resolve(origin);
      if (discScalingMode === ANNOTATION_GIZMO_DISC_SCALING_MODES.WORLD) {
        return discResizeWorldRadiusToScreenTarget
          ? resolveSteppedDiscWorldRadius(origin)
          : Math.max(gizmo.radius, AXIS_NUMERIC_EPSILON);
      }
      return resolveScreenFixedDiscWorldRadius(
        origin,
        planeNormal,
        gizmo.radius
      );
    },
    [
      discScalingMode,
      sceneSizing,
      discResizeWorldRadiusToScreenTarget,
      gizmo,
      resolveScreenFixedDiscWorldRadius,
      resolveSteppedDiscWorldRadius,
    ]
  );

  const resolveDiscWorldRadiusForFrame = useCallback(
    (origin: Vector3, planeNormal: Vector3): number => {
      if (!gizmo.freezeDiscScaleDuringDrag || !gizmo.isDragging) {
        return computeDiscWorldRadius(origin, planeNormal);
      }
      gizmo.frozenDragDiscRadius ??= computeDiscWorldRadius(
        origin,
        planeNormal
      );
      return gizmo.frozenDragDiscRadius;
    },
    [computeDiscWorldRadius, gizmo]
  );

  return { computeDiscWorldRadius, resolveDiscWorldRadiusForFrame };
};
