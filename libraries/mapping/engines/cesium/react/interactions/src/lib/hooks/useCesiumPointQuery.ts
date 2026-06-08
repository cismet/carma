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
import {
  isScreenPositionWithinDistance,
  resolvePointQueryConfig,
  type CesiumPointQueryConfig,
} from "./point-query-helpers";

const CLEARED_POINTER_POSITION = new Cartesian2(Number.NaN, Number.NaN);
const EMPTY_INPUT_MODIFIERS: readonly CesiumPointQueryInputModifier[] = [];

export type { CesiumPointQueryConfig } from "./point-query-helpers";

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

export type CesiumPointQueryCreatePayload = {
  screenPosition: Cartesian2;
  pickedPositionECEF: Cartesian3;
  globePositionECEF: Cartesian3 | null;
  inputModifier?: CesiumPointQueryInputModifier;
};

export type CesiumPointQueryPointerMoveHandler = (
  positionECEF: Cartesian3 | null,
  screenPosition: Cartesian2,
  surfaceNormalECEF?: Cartesian3 | null,
  options?: { inputModifier?: CesiumPointQueryInputModifier }
) => void;

export type CesiumPointQueryScreenPositionHandler = (
  screenPosition: Cartesian2 | null
) => void;

export type CesiumPointQueryOptions = {
  enabled?: boolean;
  hideCursorWhileEnabled?: boolean;
  clickStrategy?: CesiumPointQueryClickStrategy;
  config?: CesiumPointQueryConfig;
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
    config,
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
    let retainedHoverSurfacePositionECEF: Cartesian3 | null = null;
    let retainedHoverSurfaceNormalECEF: Cartesian3 | null = null;
    let retainedHoverSurfaceMissCount = 0;
    let freshHoverPickRequested = false;
    let isCameraMoving = false;
    let lastHoverPickTimeMs = Number.NEGATIVE_INFINITY;
    let lastHoverNormalSampleTimeMs = Number.NEGATIVE_INFINITY;
    let lastHoverNormalSampleScreenPosition: Cartesian2 | null = null;
    let activeInputModifier: CesiumPointQueryInputModifier | undefined;
    const shouldTrackShiftInputModifier = inputModifiers.includes(
      CESIUM_POINT_QUERY_INPUT_MODIFIERS.SHIFT
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
      screenPosition: Cartesian2
    ) => {
      if (!debugLog) {
        return;
      }

      console.debug("[CESIUM|POINT_QUERY|HOVER_SURFACE_MISS]", {
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
      if (!scene || scene.isDestroyed()) {
        return;
      }

      clearRetainedHoverSurface();
      freshHoverPickRequested = true;
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
      surfaceNormalECEF: Cartesian3 | null,
      options: { inputModifier?: CesiumPointQueryInputModifier } = {}
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
      inputModifier: CesiumPointQueryInputModifier | undefined
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

      setActiveInputModifier(CESIUM_POINT_QUERY_INPUT_MODIFIERS.SHIFT);
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
      if (!scene || scene.isDestroyed()) {
        lastProcessedPointerPosition = null;
        clearRetainedHoverSurface();
        pointerRenderQueued = false;
        freshHoverPickRequested = false;
        isCameraMoving = false;
        lastHoverPickTimeMs = Number.NEGATIVE_INFINITY;
        return;
      }
      pointerRenderQueued = false;

      const currentPointerPosition = getCesiumScenePointerScreenPosition(scene);
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
        !Cartesian2.equals(
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
        lastProcessedPointerPosition = Cartesian2.clone(
          currentPointerPosition,
          lastProcessedPointerPosition ?? new Cartesian2()
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
          (isFreshHoverPickRequested ||
            !retainedHoverSurfaceNormalECEF ||
            !lastHoverNormalSampleScreenPosition ||
            nowMs - lastHoverNormalSampleTimeMs >= normalSampleIntervalMs ||
            Cartesian2.distance(
              currentPointerPosition,
              lastHoverNormalSampleScreenPosition
            ) >= normalSampleDistancePx);
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
          sampledSurfaceNormal ?? retainedHoverSurfaceNormalECEF ?? null;
        retainedHoverSurfacePositionECEF = Cartesian3.clone(
          hoverPositionECEF,
          new Cartesian3()
        );
        retainedHoverSurfaceNormalECEF = resolvedSurfaceNormal
          ? Cartesian3.clone(resolvedSurfaceNormal, new Cartesian3())
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
        requestFreshHoverPick();
        return;
      }

      if (!pickedPosition) {
        requestFreshHoverPick();
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

      requestFreshHoverPick();
    };

    const handleLeftClick = (
      event: { position: Cartesian2 },
      inputModifier?: CesiumPointQueryInputModifier
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
        ? Cartesian2.clone(latestClickPosition, new Cartesian2())
        : null;
      latestClickPosition = Cartesian2.clone(event.position, new Cartesian2());
      if (clickTimeoutId !== undefined) {
        window.clearTimeout(clickTimeoutId);
      }
      clickTimeoutId = window.setTimeout(() => {
        createPointAt(event.position, { inputModifier: resolvedInputModifier });
        clickTimeoutId = undefined;
      }, clickDelayMs);
    };

    const handleLeftDoubleClick = (event: { position: Cartesian2 }) => {
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
      ignoreNextLineFinishClickPosition = Cartesian2.clone(
        event.position,
        new Cartesian2()
      );
      ignoreNextLineFinishClickTimeoutId = window.setTimeout(() => {
        clearLineFinishClickIgnore();
      }, clickDelayMs);
      requestFreshHoverPick();
    };

    handler.setInputAction(
      (event: { position: Cartesian2 }) => handleLeftClick(event),
      ScreenSpaceEventType.LEFT_CLICK
    );

    handler.setInputAction(
      handleLeftDoubleClick,
      ScreenSpaceEventType.LEFT_DOUBLE_CLICK
    );
    if (shouldTrackShiftInputModifier) {
      window.addEventListener("keydown", handleModifierKeyDown);
      window.addEventListener("keyup", handleModifierKeyUp);
      window.addEventListener("blur", handleWindowBlur);

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
      clearRetainedHoverSurface();
      unsubscribeClientPosition();
      removeCameraMoveStartListener?.();
      removeCameraMoveEndListener?.();
      removePreRenderListener?.();
      unregisterScenePointerTracker();
      if (shouldTrackShiftInputModifier) {
        window.removeEventListener("keydown", handleModifierKeyDown);
        window.removeEventListener("keyup", handleModifierKeyUp);
        window.removeEventListener("blur", handleWindowBlur);
      }
      handler.destroy();
    };
  }, [
    scene,
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

export default useCesiumPointQuery;
