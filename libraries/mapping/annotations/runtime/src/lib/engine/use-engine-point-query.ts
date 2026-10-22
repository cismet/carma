import { useEffect, useRef, useState } from "react";
import {
  isValidAnnotationEngine,
  ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS,
  ANNOTATION_POINT_QUERY_CLICK_STRATEGY,
  type AnnotationEngine,
  type AnnotationPointQueryOptions,
} from "@carma-mapping/annotations/core";

import { resolvePointQueryConfig } from "./point-query-helpers";
import { createPointQueryClickHandlers } from "./point-query-clicks";
import { createPointQueryHoverTracker } from "./point-query-hover";
import {
  CLEARED_POINTER_POSITION,
  EMPTY_INPUT_MODIFIERS,
  type AnnotationPointQueryCallbacks,
} from "./point-query-input";
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
  const [surfaceMissing, setSurfaceMissing] = useState(false);
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

    engine.canvas.style.cursor = !enabled
      ? ""
      : surfaceMissing
      ? "not-allowed"
      : hideCursorWhileEnabled
      ? "none"
      : "";
    return () => {
      if (!engine.isDestroyed()) {
        engine.canvas.style.cursor = "";
      }
    };
  }, [engine, enabled, hideCursorWhileEnabled, surfaceMissing]);

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
    const shouldTrackShiftInputModifier = inputModifiers.includes(
      ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS.SHIFT
    );
    const hover = createPointQueryHoverTracker(
      engine,
      callbacksRef,
      resolvedConfig,
      setSurfaceMissing
    );
    const removePreRenderListener = engine.subscribePreRender(
      hover.flushPointerMove
    );
    const removeCameraMoveListeners = engine.subscribeCameraMove({
      onMoveStart: hover.handleCameraMoveStart,
      onMoveEnd: hover.handleCameraMoveEnd,
    });
    const unsubscribeClientPosition = engine.pointer.subscribeClientPosition(
      hover.requestPointerRender
    );
    const clicks = createPointQueryClickHandlers(
      engine,
      callbacksRef,
      hover,
      resolvedConfig,
      clickStrategy,
      shouldTrackShiftInputModifier
    );
    canvas.addEventListener("pointerdown", clicks.handleCanvasPointerDown);
    // The release may land outside the canvas (Cesium captures the pointer
    // for that); a capturing window listener sees it regardless.
    window.addEventListener("pointerup", clicks.handleWindowPointerUp, {
      capture: true,
    });
    window.addEventListener("pointercancel", clicks.handleWindowPointerCancel, {
      capture: true,
    });
    canvas.addEventListener("dblclick", clicks.handleCanvasDoubleClick);
    if (shouldTrackShiftInputModifier) {
      window.addEventListener("keydown", hover.handleModifierKeyDown);
      window.addEventListener("keyup", hover.handleModifierKeyUp);
      window.addEventListener("blur", hover.handleWindowBlur);
    }

    return () => {
      clicks.clearClickTimeout();
      clicks.clearLineFinishClickIgnore();
      hover.clearRetainedHoverSurface();
      setSurfaceMissing(false);
      unsubscribeClientPosition();
      removeCameraMoveListeners();
      removePreRenderListener();
      releasePointerTracker();
      if (shouldTrackShiftInputModifier) {
        window.removeEventListener("keydown", hover.handleModifierKeyDown);
        window.removeEventListener("keyup", hover.handleModifierKeyUp);
        window.removeEventListener("blur", hover.handleWindowBlur);
      }
      canvas.removeEventListener("pointerdown", clicks.handleCanvasPointerDown);
      window.removeEventListener("pointerup", clicks.handleWindowPointerUp, {
        capture: true,
      });
      window.removeEventListener(
        "pointercancel",
        clicks.handleWindowPointerCancel,
        {
          capture: true,
        }
      );
      canvas.removeEventListener("dblclick", clicks.handleCanvasDoubleClick);
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
