import {
  ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS,
  ANNOTATION_POINT_QUERY_CLICK_STRATEGY,
  type AnnotationEngine,
  type AnnotationEnginePointQueryInputModifier,
  type AnnotationPointQueryCreatePayload,
  type AnnotationPointQueryOptions,
  type AnnotationScreenPosition,
} from "@carma-mapping/annotations/core";
import {
  getScreenPositionDistance,
  isScreenPositionWithinDistance,
  type resolvePointQueryConfig,
} from "./point-query-helpers";
import type { createPointQueryHoverTracker } from "./point-query-hover";
import {
  CLICK_PIXEL_TOLERANCE,
  LEFT_POINTER_BUTTON,
  copyScreenPosition,
  getCanvasScreenPosition,
  getPointerEventInputModifier,
  type AnnotationPointQueryCallbacks,
} from "./point-query-input";

/** Point creation and delayed line-finish clicks of one point-query effect. */
export const createPointQueryClickHandlers = (
  engine: AnnotationEngine,
  callbacksRef: { current: AnnotationPointQueryCallbacks },
  hover: ReturnType<typeof createPointQueryHoverTracker>,
  {
    clickDelayMs,
    doubleClickDistancePx,
  }: ReturnType<typeof resolvePointQueryConfig>,
  clickStrategy: NonNullable<AnnotationPointQueryOptions["clickStrategy"]>,
  shouldTrackShiftInputModifier: boolean
) => {
  const canvas = engine.canvas;
  let clickTimeoutId: number | undefined;
  let previousClickPosition: AnnotationScreenPosition | null = null;
  let latestClickPosition: AnnotationScreenPosition | null = null;
  let ignoreNextLineFinishClickPosition: AnnotationScreenPosition | null = null;
  let ignoreNextLineFinishClickTimeoutId: number | undefined;
  let leftPointerDownPosition: AnnotationScreenPosition | null = null;
  const clearLineFinishClickIgnore = () => {
    ignoreNextLineFinishClickPosition = null;
    if (ignoreNextLineFinishClickTimeoutId !== undefined) {
      window.clearTimeout(ignoreNextLineFinishClickTimeoutId);
      ignoreNextLineFinishClickTimeoutId = undefined;
    }
  };

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
      hover.requestFreshHoverPick();
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
      hover.requestFreshHoverPick();
      return;
    }

    callbacksRef.current.onPointCreate?.(payload);

    hover.requestFreshHoverPick();
  };

  const handleLeftClick = (
    event: { position: AnnotationScreenPosition },
    inputModifier?: AnnotationEnginePointQueryInputModifier
  ) => {
    const resolvedInputModifier =
      inputModifier ?? hover.getActiveInputModifier();
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
    hover.requestFreshHoverPick();
  };

  // The plain action fires only while no modifier key is held, the shift
  // action only with the opt-in, ctrl/alt never.
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

  return {
    handleCanvasPointerDown,
    handleWindowPointerUp,
    handleWindowPointerCancel,
    handleCanvasDoubleClick,
    clearLineFinishClickIgnore,
    clearClickTimeout: () => {
      if (clickTimeoutId !== undefined) {
        window.clearTimeout(clickTimeoutId);
        clickTimeoutId = undefined;
      }
    },
  };
};
