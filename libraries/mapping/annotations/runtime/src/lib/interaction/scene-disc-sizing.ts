import type { Vector3 } from "three";
import type {
  AnnotationDiscSizingOptions,
  AnnotationEngine,
} from "@carma-mapping/annotations/core";
import { ANNOTATION_DISC_REFERENCE_DEFAULTS } from "../config/annotation-reference-object-sizing";
import {
  createSteppedDiscRadius,
  DISC_RADIUS_RESIZE_TRIGGERS,
} from "./stepped-disc-radius";

/** One held-world sizing policy for every Three query/edit guide disc. */
export const createSceneDiscSizing = (
  engine: AnnotationEngine,
  sizing: Partial<AnnotationDiscSizingOptions>,
  fallbackRadiusMeters: number
) => {
  let moving = false;
  let viewRevision = 0;
  let unsubscribe: (() => void) | null = null;
  const resolve = createSteppedDiscRadius({
    engine,
    discSizing: sizing,
    radiusSteps: true,
    stepFactor: ANNOTATION_DISC_REFERENCE_DEFAULTS.sceneResizeFactor,
    targetScreenRadiusCssPx:
      ANNOTATION_DISC_REFERENCE_DEFAULTS.targetScreenRadiusCssPx,
    quantize: true,
    fallbackRadiusMeters,
    trigger: DISC_RADIUS_RESIZE_TRIGGERS.VIEW_CHANGE,
  });
  return {
    resolve: (center: Vector3) =>
      engine.isDestroyed()
        ? fallbackRadiusMeters
        : resolve(center, { cameraMoving: moving, viewRevision }),
    // Registration is explicit so React can allocate this object without
    // creating subscriptions during render or leaking StrictMode probes.
    start: (onViewChange: () => void) => {
      if (unsubscribe) return;
      unsubscribe = engine.subscribeCameraMove({
        onMoveStart: () => {
          moving = true;
        },
        onMoveEnd: () => {
          moving = false;
          viewRevision += 1;
          onViewChange();
        },
      });
    },
    destroy: () => {
      unsubscribe?.();
      unsubscribe = null;
    },
  };
};
