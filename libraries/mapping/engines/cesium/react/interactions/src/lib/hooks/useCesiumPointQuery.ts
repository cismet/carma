import { useEffect, useRef } from "react";

import {
  Cartesian2,
  Cartesian3,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Scene,
} from "@carma/cesium";
import {
  pickGlobePositionAtScreenPosition,
  pickScenePositionAtScreenPosition,
  sampleSurfaceNormalAtScreenPosition,
} from "@carma-mapping/engines/cesium/api";

const POINT_CLICK_DELAY_MS = 220;
const DOUBLE_CLICK_POSITION_THRESHOLD_PX = 12;
const CLEARED_POINTER_POSITION = new Cartesian2(Number.NaN, Number.NaN);
const INTERACTIVE_POINT_LABEL_SELECTOR =
  '[data-point-label-interactive="true"]';
const LABEL_OVERLAY_CONTAINER_SELECTOR = "#label-overlay-container";

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

export type CesiumPointQueryOptions = {
  enabled?: boolean;
  hideCursorWhileEnabled?: boolean;
  pointClickDelayMs?: number;
  onBeforePointCreate?: (
    positionECEF: Cartesian3 | null,
    screenPosition: Cartesian2
  ) => boolean;
  onPointCreate?: (payload: CesiumPointQueryCreatePayload) => void;
  onLineFinish?: () => void;
  onPointerMove?: CesiumPointQueryPointerMoveHandler;
};

type CesiumPointQueryCallbacks = Pick<
  CesiumPointQueryOptions,
  "onBeforePointCreate" | "onPointCreate" | "onLineFinish" | "onPointerMove"
>;

export const useCesiumPointQuery = (
  scene: Scene | null,
  {
    enabled = true,
    hideCursorWhileEnabled = true,
    pointClickDelayMs = POINT_CLICK_DELAY_MS,
    onBeforePointCreate,
    onPointCreate,
    onLineFinish,
    onPointerMove,
  }: CesiumPointQueryOptions = {}
) => {
  const pendingPointerMovePositionRef = useRef<Cartesian2 | null>(null);
  const pointerMoveFrameRef = useRef<number | null>(null);
  const callbacksRef = useRef<CesiumPointQueryCallbacks>({});
  callbacksRef.current = {
    onBeforePointCreate,
    onPointCreate,
    onLineFinish,
    onPointerMove,
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
      if (pointerMoveFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerMoveFrameRef.current);
        pointerMoveFrameRef.current = null;
      }
      pendingPointerMovePositionRef.current = null;
      callbacksRef.current.onPointerMove?.(
        null,
        CLEARED_POINTER_POSITION,
        null
      );
      return;
    }

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    let clickTimeoutId: number | undefined;
    let previousClickPosition: Cartesian2 | null = null;
    let latestClickPosition: Cartesian2 | null = null;

    const clearCandidatePointerState = () => {
      pendingPointerMovePositionRef.current = null;
      if (pointerMoveFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerMoveFrameRef.current);
        pointerMoveFrameRef.current = null;
      }
      callbacksRef.current.onPointerMove?.(
        null,
        CLEARED_POINTER_POSITION,
        null
      );
      scene.requestRender();
    };

    const queuePointerMove = (screenPosition: Cartesian2) => {
      pendingPointerMovePositionRef.current = Cartesian2.clone(
        screenPosition,
        new Cartesian2()
      );

      if (pointerMoveFrameRef.current === null) {
        pointerMoveFrameRef.current =
          window.requestAnimationFrame(flushPointerMove);
      }
    };

    const handleCanvasPointerLeave = (event: MouseEvent) => {
      const relatedTarget = event.relatedTarget;
      if (
        relatedTarget instanceof Element &&
        (relatedTarget.closest(INTERACTIVE_POINT_LABEL_SELECTOR) ||
          relatedTarget.closest(LABEL_OVERLAY_CONTAINER_SELECTOR))
      ) {
        return;
      }
      clearCandidatePointerState();
    };

    const handleCanvasBlur = () => {
      clearCandidatePointerState();
    };

    const handleWindowBlur = () => {
      clearCandidatePointerState();
    };

    const handleDocumentVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        clearCandidatePointerState();
      }
    };

    const handleWindowPointerMove = (event: PointerEvent) => {
      const canvasRect = scene.canvas.getBoundingClientRect();
      const insideCanvasBounds =
        event.clientX >= canvasRect.left &&
        event.clientX <= canvasRect.right &&
        event.clientY >= canvasRect.top &&
        event.clientY <= canvasRect.bottom;

      if (!insideCanvasBounds) {
        return;
      }

      queuePointerMove(
        new Cartesian2(
          event.clientX - canvasRect.left,
          event.clientY - canvasRect.top
        )
      );
    };

    scene.canvas.addEventListener("mouseleave", handleCanvasPointerLeave);
    scene.canvas.addEventListener("blur", handleCanvasBlur);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("pointermove", handleWindowPointerMove, true);
    document.addEventListener(
      "visibilitychange",
      handleDocumentVisibilityChange
    );

    const flushPointerMove = () => {
      pointerMoveFrameRef.current = null;
      if (!scene || scene.isDestroyed()) {
        pendingPointerMovePositionRef.current = null;
        return;
      }

      const pendingPosition = pendingPointerMovePositionRef.current;
      pendingPointerMovePositionRef.current = null;
      if (!pendingPosition) {
        return;
      }

      const pickedPosition = pickScenePositionAtScreenPosition(
        scene,
        pendingPosition
      );
      const sampledSurfaceNormal = pickedPosition
        ? sampleSurfaceNormalAtScreenPosition(
            scene,
            pendingPosition,
            pickedPosition
          )
        : null;
      callbacksRef.current.onPointerMove?.(
        pickedPosition ?? null,
        pendingPosition,
        sampledSurfaceNormal
      );

      if (
        pendingPointerMovePositionRef.current &&
        pointerMoveFrameRef.current === null
      ) {
        pointerMoveFrameRef.current =
          window.requestAnimationFrame(flushPointerMove);
      }
    };

    const createPointAt = (screenPosition: Cartesian2) => {
      const pickedPosition = pickScenePositionAtScreenPosition(
        scene,
        screenPosition
      );

      if (
        callbacksRef.current.onBeforePointCreate &&
        !callbacksRef.current.onBeforePointCreate(
          pickedPosition ?? null,
          screenPosition
        )
      ) {
        scene.requestRender();
        return;
      }

      if (!pickedPosition) {
        return;
      }

      callbacksRef.current.onPointCreate?.({
        screenPosition,
        pickedPositionECEF: pickedPosition,
        globePositionECEF: pickGlobePositionAtScreenPosition(
          scene,
          screenPosition
        ),
      });

      scene.requestRender();
    };

    handler.setInputAction((event: { position: Cartesian2 }) => {
      if (!callbacksRef.current.onLineFinish) {
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
      if (!callbacksRef.current.onLineFinish) {
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
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    handler.setInputAction((event: { endPosition: Cartesian2 }) => {
      queuePointerMove(event.endPosition);
    }, ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      if (clickTimeoutId !== undefined) {
        window.clearTimeout(clickTimeoutId);
        clickTimeoutId = undefined;
      }
      scene.canvas.removeEventListener("mouseleave", handleCanvasPointerLeave);
      scene.canvas.removeEventListener("blur", handleCanvasBlur);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("pointermove", handleWindowPointerMove, true);
      document.removeEventListener(
        "visibilitychange",
        handleDocumentVisibilityChange
      );
      if (pointerMoveFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerMoveFrameRef.current);
        pointerMoveFrameRef.current = null;
      }
      pendingPointerMovePositionRef.current = null;
      handler.destroy();
    };
  }, [scene, enabled, pointClickDelayMs]);
};

export default useCesiumPointQuery;
