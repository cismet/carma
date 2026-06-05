import { useEffect, useRef } from "react";

import {
  Cartesian2,
  Cartesian3,
  KeyboardEventModifier,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Scene,
} from "@carma-cesium";
import {
  resolvePreferredSurfacePick,
  sampleSurfacePickNormalAtScreenPosition,
} from "@carma-mapping/engines/cesium/core";
import {
  getCesiumScenePointerScreenPosition,
  registerCesiumScenePointerTracker,
  subscribeCesiumScenePointerClientPosition,
} from "./scenePointerTracker";

const POINT_CLICK_DELAY_MS = 220;
const DOUBLE_CLICK_POSITION_THRESHOLD_PX = 12;
const HOVER_PICK_CONTINUITY_FRAME_COUNT = 2;
const CAMERA_MOVING_HOVER_PICK_INTERVAL_MS = 75;
const STATIC_HOVER_NORMAL_SAMPLE_INTERVAL_MS = 48;
const STATIC_HOVER_NORMAL_SAMPLE_DISTANCE_THRESHOLD_PX = 6;
const CLEARED_POINTER_POSITION = new Cartesian2(Number.NaN, Number.NaN);
const EMPTY_INPUT_MODIFIERS: readonly CesiumPointQueryInputModifier[] = [];

export const CESIUM_POINT_QUERY_CLICK_STRATEGY = {
  IMMEDIATE: "immediate",
  DELAYED_LINE_FINISH: "delayed-line-finish",
} as const;

export type CesiumPointQueryClickStrategy =
  (typeof CESIUM_POINT_QUERY_CLICK_STRATEGY)[keyof typeof CESIUM_POINT_QUERY_CLICK_STRATEGY];

export const CESIUM_POINT_QUERY_INPUT_MODIFIERS = {
  SHIFT: "shift",
} as const;

export type CesiumPointQueryInputModifier =
  (typeof CESIUM_POINT_QUERY_INPUT_MODIFIERS)[keyof typeof CESIUM_POINT_QUERY_INPUT_MODIFIERS];

type RetainedHoverSample = {
  positionECEF: Cartesian3;
  screenPosition: Cartesian2;
  surfaceNormalECEF: Cartesian3 | null;
  missedFrameCount: number;
};

const isSameDoubleClickArea = (
  previousPosition: Cartesian2 | null,
  nextPosition: Cartesian2
) => {
  if (!previousPosition) {
    return false;
  }

  return (
    Cartesian2.distance(previousPosition, nextPosition) <=
    DOUBLE_CLICK_POSITION_THRESHOLD_PX
  );
};

const isSameScreenPosition = (
  left: Cartesian2 | null,
  right: Cartesian2 | null
) =>
  left === right ||
  (!!left && !!right && left.x === right.x && left.y === right.y);

export type CesiumPointQueryCreatePayload = {
  screenPosition: Cartesian2;
  pickedPositionECEF: Cartesian3;
  globePositionECEF: Cartesian3 | null;
  inputModifier?: CesiumPointQueryInputModifier;
};

export type CesiumPointQueryPointerMoveHandler = (
  positionECEF: Cartesian3 | null,
  screenPosition: Cartesian2,
  surfaceNormalECEF?: Cartesian3 | null
) => void;

export type CesiumPointQueryScreenPositionHandler = (
  screenPosition: Cartesian2 | null
) => void;

export type CesiumPointQueryOptions = {
  enabled?: boolean;
  hideCursorWhileEnabled?: boolean;
  clickStrategy?: CesiumPointQueryClickStrategy;
  pointClickDelayMs?: number;
  inputModifiers?: readonly CesiumPointQueryInputModifier[];
  onBeforePointCreate?: (
    positionECEF: Cartesian3 | null,
    screenPosition: Cartesian2
  ) => boolean;
  onPointCreate?: (payload: CesiumPointQueryCreatePayload) => void;
  onLineFinish?: () => void;
  onPointerMove?: CesiumPointQueryPointerMoveHandler;
  onScreenPositionChange?: CesiumPointQueryScreenPositionHandler;
};

type CesiumPointQueryCallbacks = Pick<
  CesiumPointQueryOptions,
  | "onBeforePointCreate"
  | "onPointCreate"
  | "onLineFinish"
  | "onPointerMove"
  | "onScreenPositionChange"
>;

export const useCesiumPointQuery = (
  scene: Scene | null,
  {
    enabled = true,
    hideCursorWhileEnabled = true,
    clickStrategy = CESIUM_POINT_QUERY_CLICK_STRATEGY.IMMEDIATE,
    pointClickDelayMs = POINT_CLICK_DELAY_MS,
    inputModifiers = EMPTY_INPUT_MODIFIERS,
    onBeforePointCreate,
    onPointCreate,
    onLineFinish,
    onPointerMove,
    onScreenPositionChange,
  }: CesiumPointQueryOptions = {}
) => {
  const callbacksRef = useRef<CesiumPointQueryCallbacks>({});
  callbacksRef.current = {
    onBeforePointCreate,
    onPointCreate,
    onLineFinish,
    onPointerMove,
    onScreenPositionChange,
  };

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    scene.canvas.style.cursor = enabled && hideCursorWhileEnabled ? "none" : "";
    return () => {
      if (!scene.isDestroyed()) {
        scene.canvas.style.cursor = "";
      }
    };
  }, [scene, enabled, hideCursorWhileEnabled]);

  useEffect(() => {
    if (!scene || scene.isDestroyed() || !enabled) {
      callbacksRef.current.onScreenPositionChange?.(null);
      callbacksRef.current.onPointerMove?.(
        null,
        CLEARED_POINTER_POSITION,
        null
      );
      return;
    }

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    const unregisterScenePointerTracker =
      registerCesiumScenePointerTracker(scene);
    let pointerRenderQueued = false;
    let clickTimeoutId: number | undefined;
    let previousClickPosition: Cartesian2 | null = null;
    let latestClickPosition: Cartesian2 | null = null;
    let ignoreNextLineFinishClickPosition: Cartesian2 | null = null;
    let ignoreNextLineFinishClickTimeoutId: number | undefined;
    let lastProcessedPointerPosition: Cartesian2 | null = null;
    let retainedHoverSample: RetainedHoverSample | null = null;
    let forceHoverRefresh = false;
    let isCameraMoving = false;
    let lastHoverPickTimeMs = Number.NEGATIVE_INFINITY;
    let lastHoverNormalSampleTimeMs = Number.NEGATIVE_INFINITY;
    let lastHoverNormalSampleScreenPosition: Cartesian2 | null = null;

    const requestForcedHoverRefresh = () => {
      if (!scene || scene.isDestroyed()) {
        return;
      }

      forceHoverRefresh = true;
      pointerRenderQueued = true;
      scene.requestRender();
    };

    const clearLineFinishClickIgnore = () => {
      ignoreNextLineFinishClickPosition = null;
      if (ignoreNextLineFinishClickTimeoutId !== undefined) {
        window.clearTimeout(ignoreNextLineFinishClickTimeoutId);
        ignoreNextLineFinishClickTimeoutId = undefined;
      }
    };

    const notifyPointerMove = (
      positionECEF: Cartesian3 | null,
      screenPosition: Cartesian2,
      surfaceNormalECEF: Cartesian3 | null
    ) => {
      callbacksRef.current.onPointerMove?.(
        positionECEF,
        screenPosition,
        surfaceNormalECEF
      );
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
      requestForcedHoverRefresh();
    };

    const flushPointerMove = () => {
      if (!scene || scene.isDestroyed()) {
        lastProcessedPointerPosition = null;
        retainedHoverSample = null;
        pointerRenderQueued = false;
        forceHoverRefresh = false;
        isCameraMoving = false;
        lastHoverPickTimeMs = Number.NEGATIVE_INFINITY;
        lastHoverNormalSampleTimeMs = Number.NEGATIVE_INFINITY;
        lastHoverNormalSampleScreenPosition = null;
        return;
      }
      pointerRenderQueued = false;

      const currentPointerPosition = getCesiumScenePointerScreenPosition(scene);
      if (!currentPointerPosition) {
        if (!lastProcessedPointerPosition) {
          return;
        }

        lastProcessedPointerPosition = null;
        retainedHoverSample = null;
        forceHoverRefresh = false;
        lastHoverNormalSampleTimeMs = Number.NEGATIVE_INFINITY;
        lastHoverNormalSampleScreenPosition = null;
        callbacksRef.current.onScreenPositionChange?.(null);
        notifyPointerMove(null, CLEARED_POINTER_POSITION, null);
        return;
      }

      const pointerPositionChanged = !isSameScreenPosition(
        lastProcessedPointerPosition,
        currentPointerPosition
      );
      const nowMs = performance.now();
      const shouldRepickDuringCameraMove =
        isCameraMoving &&
        nowMs - lastHoverPickTimeMs >= CAMERA_MOVING_HOVER_PICK_INTERVAL_MS;

      if (!pointerPositionChanged) {
        if (!forceHoverRefresh && !shouldRepickDuringCameraMove) {
          return;
        }
      } else {
        lastProcessedPointerPosition = Cartesian2.clone(
          currentPointerPosition,
          lastProcessedPointerPosition ?? new Cartesian2()
        );
        callbacksRef.current.onScreenPositionChange?.(currentPointerPosition);
      }

      if (
        !forceHoverRefresh &&
        isCameraMoving &&
        nowMs - lastHoverPickTimeMs < CAMERA_MOVING_HOVER_PICK_INTERVAL_MS
      ) {
        return;
      }

      const shouldForceHoverRefresh = forceHoverRefresh;
      forceHoverRefresh = false;

      const resolvedPick = resolvePreferredSurfacePick(
        scene,
        currentPointerPosition
      );
      lastHoverPickTimeMs = nowMs;
      const authoritativePickedPositionECEF = resolvedPick.surfacePositionECEF;
      // Hover previews still need a usable position when the dedicated
      // point-query tileset misses, but we only trust tileset hits for
      // surface normals that drive tangent-plane visuals.
      const hoverPositionECEF =
        authoritativePickedPositionECEF ?? resolvedPick.globePositionECEF;

      if (hoverPositionECEF) {
        const shouldSampleSurfaceNormal =
          Boolean(authoritativePickedPositionECEF) &&
          !isCameraMoving &&
          (shouldForceHoverRefresh ||
            !retainedHoverSample?.surfaceNormalECEF ||
            !lastHoverNormalSampleScreenPosition ||
            nowMs - lastHoverNormalSampleTimeMs >=
              STATIC_HOVER_NORMAL_SAMPLE_INTERVAL_MS ||
            Cartesian2.distance(
              currentPointerPosition,
              lastHoverNormalSampleScreenPosition
            ) >= STATIC_HOVER_NORMAL_SAMPLE_DISTANCE_THRESHOLD_PX);
        const sampledSurfaceNormal = authoritativePickedPositionECEF
          ? shouldSampleSurfaceNormal
            ? sampleSurfacePickNormalAtScreenPosition(
                scene,
                currentPointerPosition,
                authoritativePickedPositionECEF
              )
            : null
          : null;
        if (shouldSampleSurfaceNormal) {
          lastHoverNormalSampleTimeMs = nowMs;
          lastHoverNormalSampleScreenPosition = Cartesian2.clone(
            currentPointerPosition,
            lastHoverNormalSampleScreenPosition ?? new Cartesian2()
          );
        }
        const resolvedSurfaceNormal =
          sampledSurfaceNormal ??
          retainedHoverSample?.surfaceNormalECEF ??
          null;
        retainedHoverSample = {
          positionECEF: Cartesian3.clone(hoverPositionECEF, new Cartesian3()),
          screenPosition: Cartesian2.clone(
            currentPointerPosition,
            new Cartesian2()
          ),
          surfaceNormalECEF: resolvedSurfaceNormal
            ? Cartesian3.clone(resolvedSurfaceNormal, new Cartesian3())
            : null,
          missedFrameCount: 0,
        };
        notifyPointerMove(
          hoverPositionECEF,
          currentPointerPosition,
          resolvedSurfaceNormal
        );
        return;
      }

      if (
        retainedHoverSample &&
        retainedHoverSample.missedFrameCount < HOVER_PICK_CONTINUITY_FRAME_COUNT
      ) {
        retainedHoverSample = {
          ...retainedHoverSample,
          screenPosition: Cartesian2.clone(
            currentPointerPosition,
            retainedHoverSample.screenPosition
          ),
          missedFrameCount: retainedHoverSample.missedFrameCount + 1,
        };
        notifyPointerMove(
          retainedHoverSample.positionECEF,
          currentPointerPosition,
          retainedHoverSample.surfaceNormalECEF
        );
        return;
      }

      retainedHoverSample = null;
      notifyPointerMove(null, currentPointerPosition, null);
    };

    const removePreRenderListener =
      scene.preRender.addEventListener(flushPointerMove);
    const removeCameraMoveStartListener =
      scene.camera.moveStart.addEventListener(handleCameraMoveStart);
    const removeCameraMoveEndListener =
      scene.camera.moveEnd.addEventListener(handleCameraMoveEnd);
    const unsubscribeClientPosition = subscribeCesiumScenePointerClientPosition(
      scene,
      () => {
        if (pointerRenderQueued || scene.isDestroyed()) {
          return;
        }

        pointerRenderQueued = true;
        scene.requestRender();
      }
    );
    const useDelayedLineFinishClicks =
      clickStrategy === CESIUM_POINT_QUERY_CLICK_STRATEGY.DELAYED_LINE_FINISH &&
      Boolean(callbacksRef.current.onLineFinish);

    const createPointAt = (
      screenPosition: Cartesian2,
      options: { inputModifier?: CesiumPointQueryInputModifier } = {}
    ) => {
      const resolvedPick = resolvePreferredSurfacePick(scene, screenPosition);
      const pickedPosition = resolvedPick.surfacePositionECEF;

      if (
        callbacksRef.current.onBeforePointCreate &&
        !callbacksRef.current.onBeforePointCreate(
          pickedPosition ?? null,
          screenPosition
        )
      ) {
        requestForcedHoverRefresh();
        return;
      }

      if (!pickedPosition) {
        requestForcedHoverRefresh();
        return;
      }

      callbacksRef.current.onPointCreate?.({
        screenPosition,
        pickedPositionECEF: pickedPosition,
        globePositionECEF: resolvedPick.globePositionECEF,
        ...(options.inputModifier
          ? { inputModifier: options.inputModifier }
          : {}),
      });

      requestForcedHoverRefresh();
    };

    const handleLeftClick = (
      event: { position: Cartesian2 },
      inputModifier?: CesiumPointQueryInputModifier
    ) => {
      if (
        ignoreNextLineFinishClickPosition &&
        isSameDoubleClickArea(ignoreNextLineFinishClickPosition, event.position)
      ) {
        clearLineFinishClickIgnore();
        return;
      }
      clearLineFinishClickIgnore();

      if (!useDelayedLineFinishClicks) {
        createPointAt(event.position, { inputModifier });
        return;
      }

      previousClickPosition = latestClickPosition
        ? Cartesian2.clone(latestClickPosition, new Cartesian2())
        : null;
      latestClickPosition = Cartesian2.clone(event.position, new Cartesian2());
      if (clickTimeoutId !== undefined) {
        window.clearTimeout(clickTimeoutId);
      }
      clickTimeoutId = window.setTimeout(() => {
        createPointAt(event.position, { inputModifier });
        clickTimeoutId = undefined;
      }, pointClickDelayMs);
    };

    const handleLeftDoubleClick = (event: { position: Cartesian2 }) => {
      if (!useDelayedLineFinishClicks) {
        return;
      }

      if (!isSameDoubleClickArea(previousClickPosition, event.position)) {
        return;
      }

      if (clickTimeoutId !== undefined) {
        window.clearTimeout(clickTimeoutId);
        clickTimeoutId = undefined;
      }
      callbacksRef.current.onLineFinish?.();
      ignoreNextLineFinishClickPosition = Cartesian2.clone(
        event.position,
        new Cartesian2()
      );
      ignoreNextLineFinishClickTimeoutId = window.setTimeout(() => {
        clearLineFinishClickIgnore();
      }, pointClickDelayMs);
      requestForcedHoverRefresh();
    };

    handler.setInputAction(
      (event: { position: Cartesian2 }) => handleLeftClick(event),
      ScreenSpaceEventType.LEFT_CLICK
    );

    handler.setInputAction(
      handleLeftDoubleClick,
      ScreenSpaceEventType.LEFT_DOUBLE_CLICK
    );
    if (inputModifiers.includes(CESIUM_POINT_QUERY_INPUT_MODIFIERS.SHIFT)) {
      handler.setInputAction(
        (event: { position: Cartesian2 }) =>
          handleLeftClick(event, CESIUM_POINT_QUERY_INPUT_MODIFIERS.SHIFT),
        ScreenSpaceEventType.LEFT_CLICK,
        KeyboardEventModifier.SHIFT
      );
      handler.setInputAction(
        handleLeftDoubleClick,
        ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
        KeyboardEventModifier.SHIFT
      );
    }

    return () => {
      if (clickTimeoutId !== undefined) {
        window.clearTimeout(clickTimeoutId);
        clickTimeoutId = undefined;
      }
      clearLineFinishClickIgnore();
      retainedHoverSample = null;
      unsubscribeClientPosition();
      removeCameraMoveStartListener?.();
      removeCameraMoveEndListener?.();
      removePreRenderListener?.();
      unregisterScenePointerTracker();
      handler.destroy();
    };
  }, [scene, enabled, clickStrategy, pointClickDelayMs, inputModifiers]);
};

export default useCesiumPointQuery;
