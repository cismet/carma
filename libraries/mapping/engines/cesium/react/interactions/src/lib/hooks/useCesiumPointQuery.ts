import { useEffect, useRef } from "react";

import {
  Cartesian2,
  Cartesian3,
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
const CLEARED_POINTER_POSITION = new Cartesian2(Number.NaN, Number.NaN);

export const CESIUM_POINT_QUERY_CLICK_STRATEGY = {
  IMMEDIATE: "immediate",
  DELAYED_LINE_FINISH: "delayed-line-finish",
} as const;

export type CesiumPointQueryClickStrategy =
  (typeof CESIUM_POINT_QUERY_CLICK_STRATEGY)[keyof typeof CESIUM_POINT_QUERY_CLICK_STRATEGY];

type RetainedHoverSample = {
  positionECEF: Cartesian3;
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
    let lastProcessedPointerPosition: Cartesian2 | null = null;
    let retainedHoverSample: RetainedHoverSample | null = null;
    let forceHoverRefresh = false;

    const requestForcedHoverRefresh = () => {
      if (!scene || scene.isDestroyed()) {
        return;
      }

      forceHoverRefresh = true;
      pointerRenderQueued = true;
      scene.requestRender();
    };

    const flushPointerMove = () => {
      if (!scene || scene.isDestroyed()) {
        lastProcessedPointerPosition = null;
        retainedHoverSample = null;
        pointerRenderQueued = false;
        forceHoverRefresh = false;
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
        callbacksRef.current.onScreenPositionChange?.(null);
        callbacksRef.current.onPointerMove?.(
          null,
          CLEARED_POINTER_POSITION,
          null
        );
        return;
      }

      if (
        !forceHoverRefresh &&
        isSameScreenPosition(
          lastProcessedPointerPosition,
          currentPointerPosition
        )
      ) {
        return;
      }

      forceHoverRefresh = false;

      lastProcessedPointerPosition = Cartesian2.clone(
        currentPointerPosition,
        lastProcessedPointerPosition ?? new Cartesian2()
      );
      callbacksRef.current.onScreenPositionChange?.(currentPointerPosition);

      const resolvedPick = resolvePreferredSurfacePick(
        scene,
        currentPointerPosition
      );
      const authoritativePickedPositionECEF = resolvedPick.surfacePositionECEF;
      // Hover previews still need a usable position when the dedicated
      // point-query tileset misses, but we only trust tileset hits for
      // surface normals that drive tangent-plane visuals.
      const hoverPositionECEF =
        authoritativePickedPositionECEF ?? resolvedPick.globePositionECEF;

      if (hoverPositionECEF) {
        const sampledSurfaceNormal = authoritativePickedPositionECEF
          ? sampleSurfacePickNormalAtScreenPosition(
              scene,
              currentPointerPosition,
              authoritativePickedPositionECEF
            )
          : null;
        const resolvedSurfaceNormal =
          sampledSurfaceNormal ??
          retainedHoverSample?.surfaceNormalECEF ??
          null;
        retainedHoverSample = {
          positionECEF: Cartesian3.clone(hoverPositionECEF, new Cartesian3()),
          surfaceNormalECEF: resolvedSurfaceNormal
            ? Cartesian3.clone(resolvedSurfaceNormal, new Cartesian3())
            : null,
          missedFrameCount: 0,
        };
        callbacksRef.current.onPointerMove?.(
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
          missedFrameCount: retainedHoverSample.missedFrameCount + 1,
        };
        callbacksRef.current.onPointerMove?.(
          retainedHoverSample.positionECEF,
          currentPointerPosition,
          retainedHoverSample.surfaceNormalECEF
        );
        return;
      }

      retainedHoverSample = null;
      callbacksRef.current.onPointerMove?.(null, currentPointerPosition, null);
    };

    const removePreRenderListener =
      scene.preRender.addEventListener(flushPointerMove);
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

    const createPointAt = (screenPosition: Cartesian2) => {
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
      });

      requestForcedHoverRefresh();
    };

    handler.setInputAction((event: { position: Cartesian2 }) => {
      if (!useDelayedLineFinishClicks) {
        createPointAt(event.position);
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
        createPointAt(event.position);
        clickTimeoutId = undefined;
      }, pointClickDelayMs);
    }, ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((event: { position: Cartesian2 }) => {
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
      requestForcedHoverRefresh();
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    return () => {
      if (clickTimeoutId !== undefined) {
        window.clearTimeout(clickTimeoutId);
        clickTimeoutId = undefined;
      }
      retainedHoverSample = null;
      unsubscribeClientPosition();
      removePreRenderListener?.();
      unregisterScenePointerTracker();
      handler.destroy();
    };
  }, [scene, enabled, clickStrategy, pointClickDelayMs]);
};

export default useCesiumPointQuery;
