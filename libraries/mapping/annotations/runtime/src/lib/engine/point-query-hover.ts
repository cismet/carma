import type { Vector3 } from "three";

import {
  ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS,
  type AnnotationEngine,
  type AnnotationEnginePointQueryInputModifier,
  type AnnotationScreenPosition,
} from "@carma-mapping/annotations/core";
import {
  getScreenPositionDistance,
  type resolvePointQueryConfig,
} from "./point-query-helpers";
import {
  CLEARED_POINTER_POSITION,
  areScreenPositionsEqual,
  copyScreenPosition,
  type AnnotationPointQueryCallbacks,
} from "./point-query-input";

/** Hover state and frame sampling, scoped to one point-query effect. */
export const createPointQueryHoverTracker = (
  engine: AnnotationEngine,
  callbacksRef: { current: AnnotationPointQueryCallbacks },
  {
    cameraMovePickIntervalMs,
    surfaceMissLimit,
    normalSampleIntervalMs,
    normalSampleDistancePx,
    debugLog,
  }: ReturnType<typeof resolvePointQueryConfig>,
  /** Told when the pointer leaves or regains a surface that can be measured on. */
  onSurfaceMissChange: (missing: boolean) => void = () => {}
) => {
  let pointerRenderQueued = false;
  let lastProcessedPointerPosition: AnnotationScreenPosition | null = null;
  let retainedHoverSurfacePositionECEF: Vector3 | null = null;
  let retainedHoverSurfaceNormalECEF: Vector3 | null = null;
  let retainedHoverSurfaceMissCount = 0;
  let freshHoverPickRequested = false;
  let isCameraMoving = false;
  let lastHoverPickTimeMs = Number.NEGATIVE_INFINITY;
  let lastHoverNormalSampleTimeMs = Number.NEGATIVE_INFINITY;
  let lastHoverNormalSampleScreenPosition: AnnotationScreenPosition | null =
    null;
  let activeInputModifier: AnnotationEnginePointQueryInputModifier | undefined;
  let surfaceMissing = false;
  const setSurfaceMissing = (missing: boolean) => {
    if (surfaceMissing === missing) return;
    surfaceMissing = missing;
    onSurfaceMissChange(missing);
  };
  const clearRetainedHoverSurface = () => {
    retainedHoverSurfacePositionECEF = null;
    retainedHoverSurfaceNormalECEF = null;
    retainedHoverSurfaceMissCount = 0;
    lastHoverNormalSampleTimeMs = Number.NEGATIVE_INFINITY;
    lastHoverNormalSampleScreenPosition = null;
  };

  const logHoverSurfaceMiss = (
    event: "retain" | "clear",
    missCount: number,
    screenPosition: AnnotationScreenPosition
  ) => {
    if (!debugLog) {
      return;
    }

    console.debug("[ANNOTATION_ENGINE|POINT_QUERY|HOVER_SURFACE_MISS]", {
      event,
      missCount,
      missLimit: surfaceMissLimit,
      screenPosition: {
        x: screenPosition.x,
        y: screenPosition.y,
      },
    });
  };

  const requestFreshHoverPick = () => {
    if (engine.isDestroyed()) {
      return;
    }

    clearRetainedHoverSurface();
    freshHoverPickRequested = true;
    pointerRenderQueued = true;
    engine.requestRender();
  };

  const notifyPointerMove = (
    positionECEF: Vector3 | null,
    screenPosition: AnnotationScreenPosition,
    surfaceNormalECEF: Vector3 | null,
    options: { inputModifier?: AnnotationEnginePointQueryInputModifier } = {}
  ) => {
    if (options.inputModifier) {
      callbacksRef.current.onPointerMove?.(
        positionECEF,
        screenPosition,
        surfaceNormalECEF,
        { inputModifier: options.inputModifier }
      );
      return;
    }

    callbacksRef.current.onPointerMove?.(
      positionECEF,
      screenPosition,
      surfaceNormalECEF
    );
  };

  const setActiveInputModifier = (
    inputModifier: AnnotationEnginePointQueryInputModifier | undefined
  ) => {
    if (activeInputModifier === inputModifier) {
      return;
    }

    activeInputModifier = inputModifier;
    requestFreshHoverPick();
  };

  const handleModifierKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Shift") {
      return;
    }

    setActiveInputModifier(ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS.SHIFT);
  };

  const handleModifierKeyUp = (event: KeyboardEvent) => {
    if (event.key !== "Shift") {
      return;
    }

    setActiveInputModifier(undefined);
  };

  const handleWindowBlur = () => {
    setActiveInputModifier(undefined);
  };

  const handleCameraMoveStart = () => {
    isCameraMoving = true;
    lastHoverPickTimeMs = Number.NEGATIVE_INFINITY;
  };

  const handleCameraMoveEnd = () => {
    if (!isCameraMoving) {
      return;
    }

    isCameraMoving = false;
    requestFreshHoverPick();
  };

  const flushPointerMove = () => {
    if (engine.isDestroyed()) {
      lastProcessedPointerPosition = null;
      clearRetainedHoverSurface();
      pointerRenderQueued = false;
      freshHoverPickRequested = false;
      isCameraMoving = false;
      lastHoverPickTimeMs = Number.NEGATIVE_INFINITY;
      return;
    }
    pointerRenderQueued = false;

    const currentPointerPosition = engine.pointer.getScreenPosition();
    if (!currentPointerPosition) {
      if (!lastProcessedPointerPosition) {
        clearRetainedHoverSurface();
        freshHoverPickRequested = false;
        return;
      }

      lastProcessedPointerPosition = null;
      clearRetainedHoverSurface();
      freshHoverPickRequested = false;
      callbacksRef.current.onScreenPositionChange?.(null);
      notifyPointerMove(null, CLEARED_POINTER_POSITION, null);
      return;
    }

    const pointerPositionChanged =
      !lastProcessedPointerPosition ||
      !areScreenPositionsEqual(
        lastProcessedPointerPosition,
        currentPointerPosition
      );
    const nowMs = performance.now();
    const shouldRepickDuringCameraMove =
      isCameraMoving && nowMs - lastHoverPickTimeMs >= cameraMovePickIntervalMs;

    if (!pointerPositionChanged) {
      if (!freshHoverPickRequested && !shouldRepickDuringCameraMove) {
        return;
      }
    } else {
      lastProcessedPointerPosition = copyScreenPosition(
        currentPointerPosition,
        lastProcessedPointerPosition
      );
      callbacksRef.current.onScreenPositionChange?.(currentPointerPosition);
    }

    if (
      !freshHoverPickRequested &&
      isCameraMoving &&
      nowMs - lastHoverPickTimeMs < cameraMovePickIntervalMs
    ) {
      return;
    }

    const isFreshHoverPickRequested = freshHoverPickRequested;
    freshHoverPickRequested = false;

    const resolvedPick = engine.resolveSurfacePick(currentPointerPosition);
    lastHoverPickTimeMs = nowMs;
    const authoritativePickedPositionECEF = resolvedPick.surfacePositionECEF;
    // Hover previews still need a usable position when the dedicated
    // point-query surface misses, but we only trust surface hits for
    // surface normals that drive tangent-plane visuals.
    const hoverPositionECEF =
      authoritativePickedPositionECEF ?? resolvedPick.globePositionECEF;

    if (hoverPositionECEF) {
      const shouldSampleSurfaceNormal =
        Boolean(authoritativePickedPositionECEF) &&
        !isCameraMoving &&
        (isFreshHoverPickRequested ||
          !retainedHoverSurfaceNormalECEF ||
          !lastHoverNormalSampleScreenPosition ||
          nowMs - lastHoverNormalSampleTimeMs >= normalSampleIntervalMs ||
          getScreenPositionDistance(
            currentPointerPosition,
            lastHoverNormalSampleScreenPosition
          ) >= normalSampleDistancePx);
      const sampledSurfaceNormal = authoritativePickedPositionECEF
        ? shouldSampleSurfaceNormal
          ? engine.sampleSurfaceNormalAt(
              currentPointerPosition,
              authoritativePickedPositionECEF
            )
          : null
        : null;
      if (shouldSampleSurfaceNormal) {
        lastHoverNormalSampleTimeMs = nowMs;
        lastHoverNormalSampleScreenPosition = copyScreenPosition(
          currentPointerPosition,
          lastHoverNormalSampleScreenPosition
        );
      }
      const resolvedSurfaceNormal =
        sampledSurfaceNormal ?? retainedHoverSurfaceNormalECEF ?? null;
      retainedHoverSurfacePositionECEF = hoverPositionECEF.clone();
      retainedHoverSurfaceNormalECEF = resolvedSurfaceNormal
        ? resolvedSurfaceNormal.clone()
        : null;
      retainedHoverSurfaceMissCount = 0;
      setSurfaceMissing(false);
      notifyPointerMove(
        hoverPositionECEF,
        currentPointerPosition,
        resolvedSurfaceNormal,
        activeInputModifier ? { inputModifier: activeInputModifier } : undefined
      );
      return;
    }

    if (
      !isFreshHoverPickRequested &&
      retainedHoverSurfacePositionECEF &&
      retainedHoverSurfaceMissCount < surfaceMissLimit
    ) {
      const nextMissCount = retainedHoverSurfaceMissCount + 1;
      retainedHoverSurfaceMissCount = nextMissCount;
      logHoverSurfaceMiss("retain", nextMissCount, currentPointerPosition);
      notifyPointerMove(
        retainedHoverSurfacePositionECEF,
        currentPointerPosition,
        retainedHoverSurfaceNormalECEF,
        activeInputModifier ? { inputModifier: activeInputModifier } : undefined
      );
      return;
    }

    if (!isFreshHoverPickRequested && retainedHoverSurfacePositionECEF) {
      logHoverSurfaceMiss(
        "clear",
        retainedHoverSurfaceMissCount + 1,
        currentPointerPosition
      );
    }
    clearRetainedHoverSurface();
    setSurfaceMissing(true);
    notifyPointerMove(null, currentPointerPosition, null);
  };

  const requestPointerRender = () => {
    if (pointerRenderQueued || engine.isDestroyed()) return;
    pointerRenderQueued = true;
    engine.requestRender();
  };
  return {
    clearRetainedHoverSurface,
    requestFreshHoverPick,
    flushPointerMove,
    requestPointerRender,
    handleCameraMoveStart,
    handleCameraMoveEnd,
    handleModifierKeyDown,
    handleModifierKeyUp,
    handleWindowBlur,
    getActiveInputModifier: () => activeInputModifier,
  };
};
