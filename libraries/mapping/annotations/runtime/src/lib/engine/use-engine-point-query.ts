import { useEffect, useRef } from "react";
import type { Vector3 } from "three";

import { isValidAnnotationEngine } from "./annotation-engine.helpers";
import {
  ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS,
  ANNOTATION_POINT_QUERY_CLICK_STRATEGY,
  type AnnotationEngine,
  type AnnotationEnginePointQueryInputModifier,
  type AnnotationPointQueryCreatePayload,
  type AnnotationPointQueryOptions,
  type AnnotationScreenPosition,
} from "./annotation-engine.types";
import {
  getScreenPositionDistance,
  isScreenPositionWithinDistance,
  resolvePointQueryConfig,
} from "./point-query-helpers";

const CLEARED_POINTER_POSITION: AnnotationScreenPosition = {
  x: Number.NaN,
  y: Number.NaN,
};
const EMPTY_INPUT_MODIFIERS: readonly AnnotationEnginePointQueryInputModifier[] =
  [];
/**
 * Port of the Cesium `ScreenSpaceEventHandler` click tolerance: a left
 * pointer release counts as a click while it stays closer than this to its
 * press position (camera drags never create points).
 */
const CLICK_PIXEL_TOLERANCE = 5;
const LEFT_POINTER_BUTTON = 0;
/** A held modifier the hook registers no input action for (ctrl, alt). */
const UNSUPPORTED_INPUT_MODIFIER = "unsupported";

type PointerEventInputModifier =
  | AnnotationEnginePointQueryInputModifier
  | typeof UNSUPPORTED_INPUT_MODIFIER
  | undefined;

type AnnotationPointQueryCallbacks = Pick<
  AnnotationPointQueryOptions,
  | "onBeforePointCreate"
  | "onPointCreate"
  | "onLineFinish"
  | "onPointerMove"
  | "onScreenPositionChange"
>;

/** Port of the Cesium `ScreenSpaceEventHandler` `getModifier`. */
const getPointerEventInputModifier = (
  event: MouseEvent
): PointerEventInputModifier => {
  if (event.shiftKey) {
    return ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS.SHIFT;
  }

  if (event.ctrlKey || event.altKey) {
    return UNSUPPORTED_INPUT_MODIFIER;
  }

  return undefined;
};

/** Port of the Cesium `ScreenSpaceEventHandler` `getPosition`. */
const getCanvasScreenPosition = (
  canvas: HTMLCanvasElement,
  event: MouseEvent
): AnnotationScreenPosition => {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
};

const areScreenPositionsEqual = (
  left: AnnotationScreenPosition,
  right: AnnotationScreenPosition
) => left === right || (left.x === right.x && left.y === right.y);

const copyScreenPosition = (
  source: AnnotationScreenPosition,
  target: AnnotationScreenPosition | null
): AnnotationScreenPosition => {
  if (!target) {
    return { x: source.x, y: source.y };
  }

  target.x = source.x;
  target.y = source.y;
  return target;
};

export const useEnginePointQuery = (
  engine: AnnotationEngine | null,
  {
    enabled = true,
    hideCursorWhileEnabled = true,
    clickStrategy = ANNOTATION_POINT_QUERY_CLICK_STRATEGY.IMMEDIATE,
    config,
    inputModifiers = EMPTY_INPUT_MODIFIERS,
    onBeforePointCreate,
    onPointCreate,
    onLineFinish,
    onPointerMove,
    onScreenPositionChange,
  }: AnnotationPointQueryOptions = {}
) => {
  const callbacksRef = useRef<AnnotationPointQueryCallbacks>({});
  callbacksRef.current = {
    onBeforePointCreate,
    onPointCreate,
    onLineFinish,
    onPointerMove,
    onScreenPositionChange,
  };
  const resolvedConfig = resolvePointQueryConfig(config);
  const {
    clickDelayMs,
    doubleClickDistancePx,
    cameraMovePickIntervalMs,
    surfaceMissLimit,
    normalSampleIntervalMs,
    normalSampleDistancePx,
    debugLog,
  } = resolvedConfig;

  useEffect(() => {
    if (!isValidAnnotationEngine(engine)) return;

    engine.canvas.style.cursor =
      enabled && hideCursorWhileEnabled ? "none" : "";
    return () => {
      if (!engine.isDestroyed()) {
        engine.canvas.style.cursor = "";
      }
    };
  }, [engine, enabled, hideCursorWhileEnabled]);

  useEffect(() => {
    if (!isValidAnnotationEngine(engine) || !enabled) {
      callbacksRef.current.onScreenPositionChange?.(null);
      callbacksRef.current.onPointerMove?.(
        null,
        CLEARED_POINTER_POSITION,
        null
      );
      return;
    }

    const canvas = engine.canvas;
    const releasePointerTracker = engine.pointer.register();
    let pointerRenderQueued = false;
    let clickTimeoutId: number | undefined;
    let previousClickPosition: AnnotationScreenPosition | null = null;
    let latestClickPosition: AnnotationScreenPosition | null = null;
    let ignoreNextLineFinishClickPosition: AnnotationScreenPosition | null =
      null;
    let ignoreNextLineFinishClickTimeoutId: number | undefined;
    let leftPointerDownPosition: AnnotationScreenPosition | null = null;
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
    let activeInputModifier:
      | AnnotationEnginePointQueryInputModifier
      | undefined;
    const shouldTrackShiftInputModifier = inputModifiers.includes(
      ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS.SHIFT
    );

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

    const clearLineFinishClickIgnore = () => {
      ignoreNextLineFinishClickPosition = null;
      if (ignoreNextLineFinishClickTimeoutId !== undefined) {
        window.clearTimeout(ignoreNextLineFinishClickTimeoutId);
        ignoreNextLineFinishClickTimeoutId = undefined;
      }
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

      setActiveInputModifier(
        ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS.SHIFT
      );
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
        isCameraMoving &&
        nowMs - lastHoverPickTimeMs >= cameraMovePickIntervalMs;

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
        notifyPointerMove(
          hoverPositionECEF,
          currentPointerPosition,
          resolvedSurfaceNormal,
          activeInputModifier
            ? { inputModifier: activeInputModifier }
            : undefined
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
          activeInputModifier
            ? { inputModifier: activeInputModifier }
            : undefined
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
      notifyPointerMove(null, currentPointerPosition, null);
    };

    const removePreRenderListener = engine.subscribePreRender(flushPointerMove);
    const removeCameraMoveListeners = engine.subscribeCameraMove({
      onMoveStart: handleCameraMoveStart,
      onMoveEnd: handleCameraMoveEnd,
    });
    const unsubscribeClientPosition = engine.pointer.subscribeClientPosition(
      () => {
        if (pointerRenderQueued || engine.isDestroyed()) {
          return;
        }

        pointerRenderQueued = true;
        engine.requestRender();
      }
    );
    const useDelayedLineFinishClicks =
      clickStrategy ===
        ANNOTATION_POINT_QUERY_CLICK_STRATEGY.DELAYED_LINE_FINISH &&
      Boolean(callbacksRef.current.onLineFinish);

    const createPointAt = (
      screenPosition: AnnotationScreenPosition,
      options: { inputModifier?: AnnotationEnginePointQueryInputModifier } = {}
    ) => {
      const resolvedPick = engine.resolveSurfacePick(screenPosition);
      const pickedPosition = resolvedPick.surfacePositionECEF;

      if (!pickedPosition) {
        requestFreshHoverPick();
        return;
      }

      const payload: AnnotationPointQueryCreatePayload = {
        screenPosition,
        pickedPositionECEF: pickedPosition,
        globePositionECEF: resolvedPick.globePositionECEF,
        ...(options.inputModifier
          ? { inputModifier: options.inputModifier }
          : {}),
      };

      if (
        callbacksRef.current.onBeforePointCreate &&
        !callbacksRef.current.onBeforePointCreate(payload)
      ) {
        requestFreshHoverPick();
        return;
      }

      callbacksRef.current.onPointCreate?.(payload);

      requestFreshHoverPick();
    };

    const handleLeftClick = (
      event: { position: AnnotationScreenPosition },
      inputModifier?: AnnotationEnginePointQueryInputModifier
    ) => {
      const resolvedInputModifier = inputModifier ?? activeInputModifier;
      if (
        ignoreNextLineFinishClickPosition &&
        isScreenPositionWithinDistance(
          ignoreNextLineFinishClickPosition,
          event.position,
          doubleClickDistancePx
        )
      ) {
        clearLineFinishClickIgnore();
        return;
      }
      clearLineFinishClickIgnore();

      if (!useDelayedLineFinishClicks) {
        createPointAt(event.position, { inputModifier: resolvedInputModifier });
        return;
      }

      previousClickPosition = latestClickPosition
        ? copyScreenPosition(latestClickPosition, null)
        : null;
      latestClickPosition = copyScreenPosition(event.position, null);
      if (clickTimeoutId !== undefined) {
        window.clearTimeout(clickTimeoutId);
      }
      clickTimeoutId = window.setTimeout(() => {
        createPointAt(event.position, { inputModifier: resolvedInputModifier });
        clickTimeoutId = undefined;
      }, clickDelayMs);
    };

    const handleLeftDoubleClick = (event: {
      position: AnnotationScreenPosition;
    }) => {
      if (!useDelayedLineFinishClicks) {
        return;
      }

      if (
        !isScreenPositionWithinDistance(
          previousClickPosition,
          event.position,
          doubleClickDistancePx
        )
      ) {
        return;
      }

      if (clickTimeoutId !== undefined) {
        window.clearTimeout(clickTimeoutId);
        clickTimeoutId = undefined;
      }
      callbacksRef.current.onLineFinish?.();
      ignoreNextLineFinishClickPosition = copyScreenPosition(
        event.position,
        null
      );
      ignoreNextLineFinishClickTimeoutId = window.setTimeout(() => {
        clearLineFinishClickIgnore();
      }, clickDelayMs);
      requestFreshHoverPick();
    };

    // Port of the Cesium input-action dispatch: the plain action only fires
    // while no modifier key is held, the shift action only with the opt-in,
    // and ctrl/alt never fire an action.
    const dispatchLeftClick = (
      event: MouseEvent,
      position: AnnotationScreenPosition
    ) => {
      const modifier = getPointerEventInputModifier(event);

      if (modifier === undefined) {
        handleLeftClick({ position });
        return;
      }

      if (
        modifier === ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS.SHIFT &&
        shouldTrackShiftInputModifier
      ) {
        handleLeftClick(
          { position },
          ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS.SHIFT
        );
      }
    };

    const dispatchLeftDoubleClick = (
      event: MouseEvent,
      position: AnnotationScreenPosition
    ) => {
      const modifier = getPointerEventInputModifier(event);

      if (
        modifier === undefined ||
        (modifier === ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS.SHIFT &&
          shouldTrackShiftInputModifier)
      ) {
        handleLeftDoubleClick({ position });
      }
    };

    const handleCanvasPointerDown = (event: PointerEvent) => {
      if (event.isPrimary === false) {
        // A second touch turns the gesture into a pinch; no click follows.
        leftPointerDownPosition = null;
        return;
      }

      if (event.button !== LEFT_POINTER_BUTTON) {
        return;
      }

      leftPointerDownPosition = getCanvasScreenPosition(canvas, event);
    };

    const handleWindowPointerUp = (event: PointerEvent) => {
      if (
        !leftPointerDownPosition ||
        event.isPrimary === false ||
        event.button !== LEFT_POINTER_BUTTON
      ) {
        return;
      }

      const startPosition = leftPointerDownPosition;
      leftPointerDownPosition = null;
      const position = getCanvasScreenPosition(canvas, event);

      if (
        getScreenPositionDistance(startPosition, position) >=
        CLICK_PIXEL_TOLERANCE
      ) {
        return;
      }

      dispatchLeftClick(event, position);
    };

    const handleWindowPointerCancel = () => {
      leftPointerDownPosition = null;
    };

    const handleCanvasDoubleClick = (event: MouseEvent) => {
      if (event.button !== LEFT_POINTER_BUTTON) {
        return;
      }

      dispatchLeftDoubleClick(event, getCanvasScreenPosition(canvas, event));
    };

    canvas.addEventListener("pointerdown", handleCanvasPointerDown);
    // The release may land outside the canvas (Cesium captures the pointer
    // for that); a capturing window listener sees it regardless.
    window.addEventListener("pointerup", handleWindowPointerUp, {
      capture: true,
    });
    window.addEventListener("pointercancel", handleWindowPointerCancel, {
      capture: true,
    });
    canvas.addEventListener("dblclick", handleCanvasDoubleClick);
    if (shouldTrackShiftInputModifier) {
      window.addEventListener("keydown", handleModifierKeyDown);
      window.addEventListener("keyup", handleModifierKeyUp);
      window.addEventListener("blur", handleWindowBlur);
    }

    return () => {
      if (clickTimeoutId !== undefined) {
        window.clearTimeout(clickTimeoutId);
        clickTimeoutId = undefined;
      }
      clearLineFinishClickIgnore();
      clearRetainedHoverSurface();
      unsubscribeClientPosition();
      removeCameraMoveListeners();
      removePreRenderListener();
      releasePointerTracker();
      if (shouldTrackShiftInputModifier) {
        window.removeEventListener("keydown", handleModifierKeyDown);
        window.removeEventListener("keyup", handleModifierKeyUp);
        window.removeEventListener("blur", handleWindowBlur);
      }
      canvas.removeEventListener("pointerdown", handleCanvasPointerDown);
      window.removeEventListener("pointerup", handleWindowPointerUp, {
        capture: true,
      });
      window.removeEventListener("pointercancel", handleWindowPointerCancel, {
        capture: true,
      });
      canvas.removeEventListener("dblclick", handleCanvasDoubleClick);
    };
  }, [
    engine,
    enabled,
    clickStrategy,
    clickDelayMs,
    doubleClickDistancePx,
    cameraMovePickIntervalMs,
    surfaceMissLimit,
    normalSampleIntervalMs,
    normalSampleDistancePx,
    debugLog,
    inputModifiers,
  ]);
};
