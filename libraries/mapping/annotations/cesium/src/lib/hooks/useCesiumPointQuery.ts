import { useEffect, useRef } from "react";

import {
  Cartesian2,
  Cartesian3,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Scene,
} from "@carma/cesium";
import {
  POINTER_NORMAL_EPSILON_SQUARED,
  getLocalUpDirectionECEF,
} from "./utils/pointSurfaceMath";

const POINT_CLICK_DELAY_MS = 220;
const POINTER_NORMAL_SAMPLE_OFFSET_PX = 2;
const CLEARED_POINTER_POSITION = new Cartesian2(Number.NaN, Number.NaN);

const pickPositionWithMeasurementFillBypass = (
  scene: Scene,
  screenPosition: Cartesian2
): Cartesian3 | null => scene.pickPosition(screenPosition) ?? null;

const pickGlobePosition = (
  scene: Scene,
  screenPosition: Cartesian2
): Cartesian3 | null => {
  const pickRay = scene.camera.getPickRay(screenPosition);
  if (!pickRay) return null;
  return scene.globe.pick(pickRay, scene) ?? null;
};

const estimateSurfaceNormalAtPointer = (
  scene: Scene,
  screenPosition: Cartesian2,
  centerPosition: Cartesian3
): Cartesian3 => {
  const rightPosition = pickPositionWithMeasurementFillBypass(
    scene,
    new Cartesian2(
      screenPosition.x + POINTER_NORMAL_SAMPLE_OFFSET_PX,
      screenPosition.y
    )
  );
  const leftPosition = pickPositionWithMeasurementFillBypass(
    scene,
    new Cartesian2(
      screenPosition.x - POINTER_NORMAL_SAMPLE_OFFSET_PX,
      screenPosition.y
    )
  );
  const upPosition = pickPositionWithMeasurementFillBypass(
    scene,
    new Cartesian2(
      screenPosition.x,
      screenPosition.y - POINTER_NORMAL_SAMPLE_OFFSET_PX
    )
  );
  const downPosition = pickPositionWithMeasurementFillBypass(
    scene,
    new Cartesian2(
      screenPosition.x,
      screenPosition.y + POINTER_NORMAL_SAMPLE_OFFSET_PX
    )
  );

  if (!rightPosition || !leftPosition || !upPosition || !downPosition) {
    return getLocalUpDirectionECEF(centerPosition);
  }

  const tangentX = Cartesian3.subtract(
    rightPosition,
    leftPosition,
    new Cartesian3()
  );
  const tangentY = Cartesian3.subtract(
    downPosition,
    upPosition,
    new Cartesian3()
  );
  if (
    Cartesian3.magnitudeSquared(tangentX) <= POINTER_NORMAL_EPSILON_SQUARED ||
    Cartesian3.magnitudeSquared(tangentY) <= POINTER_NORMAL_EPSILON_SQUARED
  ) {
    return getLocalUpDirectionECEF(centerPosition);
  }

  const sampledNormal = Cartesian3.cross(tangentX, tangentY, new Cartesian3());
  if (
    Cartesian3.magnitudeSquared(sampledNormal) <= POINTER_NORMAL_EPSILON_SQUARED
  ) {
    return getLocalUpDirectionECEF(centerPosition);
  }

  const normalizedNormal = Cartesian3.normalize(
    sampledNormal,
    new Cartesian3()
  );
  const localUp = getLocalUpDirectionECEF(centerPosition);
  if (Cartesian3.dot(normalizedNormal, localUp) < 0) {
    return Cartesian3.negate(normalizedNormal, new Cartesian3());
  }

  return normalizedNormal;
};

export type CesiumPointQueryCreatePayload = {
  screenPosition: Cartesian2;
  pickedPositionECEF: Cartesian3;
  anchorPositionECEF: Cartesian3;
  geometryPositionECEF: Cartesian3;
  localUpDirectionECEF: Cartesian3;
  verticalOffsetMeters: number;
  hasVerticalOffsetStem: boolean;
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
  verticalOffsetMeters?: number;
  preferGlobeAnchorForVerticalOffset?: boolean;
  onBeforePointCreate?: (
    positionECEF: Cartesian3 | null,
    screenPosition: Cartesian2
  ) => boolean;
  onPointCreate?: (payload: CesiumPointQueryCreatePayload) => void;
  onLineFinish?: () => void;
  onPointerMove?: CesiumPointQueryPointerMoveHandler;
};

export const useCesiumPointQuery = (
  scene: Scene | null,
  {
    enabled = true,
    hideCursorWhileEnabled = true,
    pointClickDelayMs = POINT_CLICK_DELAY_MS,
    verticalOffsetMeters = 0,
    preferGlobeAnchorForVerticalOffset = false,
    onBeforePointCreate,
    onPointCreate,
    onLineFinish,
    onPointerMove,
  }: CesiumPointQueryOptions = {}
) => {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const pendingPointerMovePositionRef = useRef<Cartesian2 | null>(null);
  const pointerMoveFrameRef = useRef<number | null>(null);
  const onBeforePointCreateRef = useRef(onBeforePointCreate);
  const onPointCreateRef = useRef(onPointCreate);
  const onLineFinishRef = useRef(onLineFinish);
  const onPointerMoveRef = useRef(onPointerMove);

  useEffect(() => {
    onBeforePointCreateRef.current = onBeforePointCreate;
  }, [onBeforePointCreate]);

  useEffect(() => {
    onPointCreateRef.current = onPointCreate;
  }, [onPointCreate]);

  useEffect(() => {
    onLineFinishRef.current = onLineFinish;
  }, [onLineFinish]);

  useEffect(() => {
    onPointerMoveRef.current = onPointerMove;
  }, [onPointerMove]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    scene.canvas.style.cursor =
      enabled && hideCursorWhileEnabled ? "none" : "";
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
      onPointerMoveRef.current?.(null, CLEARED_POINTER_POSITION, null);
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      return;
    }

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handlerRef.current = handler;
    let clickTimeoutId: number | undefined;

    const clearLivePreview = () => {
      pendingPointerMovePositionRef.current = null;
      if (pointerMoveFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerMoveFrameRef.current);
        pointerMoveFrameRef.current = null;
      }
      onPointerMoveRef.current?.(null, CLEARED_POINTER_POSITION, null);
      scene.requestRender();
    };

    const handleCanvasPointerLeave = () => {
      clearLivePreview();
    };

    const handleCanvasBlur = () => {
      clearLivePreview();
    };

    const handleWindowBlur = () => {
      clearLivePreview();
    };

    const handleDocumentVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        clearLivePreview();
      }
    };

    scene.canvas.addEventListener("mouseleave", handleCanvasPointerLeave);
    scene.canvas.addEventListener("blur", handleCanvasBlur);
    window.addEventListener("blur", handleWindowBlur);
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

      const pickedPosition = pickPositionWithMeasurementFillBypass(
        scene,
        pendingPosition
      );
      const safeVerticalOffsetMeters = Number.isFinite(verticalOffsetMeters)
        ? verticalOffsetMeters
        : 0;
      const hasVerticalOffsetStem = Math.abs(safeVerticalOffsetMeters) > 1e-9;
      const previewAnchorPosition = pickedPosition;
      const sampledSurfaceNormal = previewAnchorPosition
        ? hasVerticalOffsetStem
          ? getLocalUpDirectionECEF(previewAnchorPosition)
          : estimateSurfaceNormalAtPointer(
              scene,
              pendingPosition,
              previewAnchorPosition
            )
        : null;
      onPointerMoveRef.current?.(
        previewAnchorPosition ?? null,
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
      const pickedPosition = pickPositionWithMeasurementFillBypass(
        scene,
        screenPosition
      );

      if (
        onBeforePointCreateRef.current &&
        !onBeforePointCreateRef.current(pickedPosition ?? null, screenPosition)
      ) {
        scene.requestRender();
        return;
      }

      if (!pickedPosition) {
        return;
      }

      const safeVerticalOffsetMeters = Number.isFinite(verticalOffsetMeters)
        ? verticalOffsetMeters
        : 0;
      const hasVerticalOffsetStem = Math.abs(safeVerticalOffsetMeters) > 1e-9;
      const anchorPosition =
        hasVerticalOffsetStem && preferGlobeAnchorForVerticalOffset
          ? pickGlobePosition(scene, screenPosition)
          : pickedPosition;
      if (!anchorPosition) {
        scene.requestRender();
        return;
      }

      const localUpDirectionECEF = getLocalUpDirectionECEF(anchorPosition);
      const offsetVectorECEF = Cartesian3.multiplyByScalar(
        localUpDirectionECEF,
        safeVerticalOffsetMeters,
        new Cartesian3()
      );
      const geometryPositionECEF = Cartesian3.add(
        anchorPosition,
        offsetVectorECEF,
        new Cartesian3()
      );

      onPointCreateRef.current?.({
        screenPosition,
        pickedPositionECEF: pickedPosition,
        anchorPositionECEF: anchorPosition,
        geometryPositionECEF,
        localUpDirectionECEF,
        verticalOffsetMeters: safeVerticalOffsetMeters,
        hasVerticalOffsetStem,
      });

      scene.requestRender();
    };

    handler.setInputAction((event: { position: Cartesian2 }) => {
      if (clickTimeoutId !== undefined) {
        window.clearTimeout(clickTimeoutId);
      }
      clickTimeoutId = window.setTimeout(() => {
        createPointAt(event.position);
        clickTimeoutId = undefined;
      }, pointClickDelayMs);
    }, ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction(() => {
      if (clickTimeoutId !== undefined) {
        window.clearTimeout(clickTimeoutId);
        clickTimeoutId = undefined;
      }
      onLineFinishRef.current?.();
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    handler.setInputAction((event: { endPosition: Cartesian2 }) => {
      pendingPointerMovePositionRef.current = Cartesian2.clone(
        event.endPosition,
        new Cartesian2()
      );

      if (pointerMoveFrameRef.current === null) {
        pointerMoveFrameRef.current =
          window.requestAnimationFrame(flushPointerMove);
      }
    }, ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      if (clickTimeoutId !== undefined) {
        window.clearTimeout(clickTimeoutId);
        clickTimeoutId = undefined;
      }
      scene.canvas.removeEventListener("mouseleave", handleCanvasPointerLeave);
      scene.canvas.removeEventListener("blur", handleCanvasBlur);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener(
        "visibilitychange",
        handleDocumentVisibilityChange
      );
      if (pointerMoveFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerMoveFrameRef.current);
        pointerMoveFrameRef.current = null;
      }
      pendingPointerMovePositionRef.current = null;
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
    };
  }, [
    scene,
    enabled,
    pointClickDelayMs,
    verticalOffsetMeters,
    preferGlobeAnchorForVerticalOffset,
  ]);
};

export default useCesiumPointQuery;
