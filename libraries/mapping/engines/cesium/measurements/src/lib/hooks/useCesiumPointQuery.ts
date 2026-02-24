import { Dispatch, SetStateAction, useEffect, useRef } from "react";

import {
  Cartesian2,
  Cartesian3,
  Cartesian4,
  Matrix4,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Transforms,
  getDegreesFromCartesian,
  type Scene,
} from "@carma/cesium";

import {
  isPointMeasurementEntry,
  MeasurementCollection,
  MeasurementEntry,
  MeasurementMode,
  type PointLabelMetricMode,
} from "../types/MeasurementTypes";
import {
  updateCollection,
  makeTemporaryMeasurementsPermanent,
} from "../utils/measurementCollection";

const POINT_CLICK_DELAY_MS = 220;
const POINTER_NORMAL_SAMPLE_OFFSET_PX = 2;
const POINTER_NORMAL_EPSILON_SQUARED = 1e-8;
const CLEARED_POINTER_POSITION = new Cartesian2(Number.NaN, Number.NaN);

const pickPositionWithMeasurementFillBypass = (
  scene: Scene,
  screenPosition: Cartesian2
): Cartesian3 | null => scene.pickPosition(screenPosition) ?? null;

const getLocalUpVector = (positionECEF: Cartesian3): Cartesian3 => {
  const localEnuFrame = Transforms.eastNorthUpToFixedFrame(positionECEF);
  const upDirectionColumn = Matrix4.getColumn(
    localEnuFrame,
    2,
    new Cartesian4()
  );
  const upDirection = new Cartesian3(
    upDirectionColumn.x,
    upDirectionColumn.y,
    upDirectionColumn.z
  );

  if (
    Cartesian3.magnitudeSquared(upDirection) <= POINTER_NORMAL_EPSILON_SQUARED
  ) {
    return Cartesian3.normalize(positionECEF, new Cartesian3());
  }

  return Cartesian3.normalize(upDirection, new Cartesian3());
};

const estimateSurfaceNormalAtPointer = (
  scene: Scene,
  screenPosition: Cartesian2,
  centerPosition: Cartesian3
): Cartesian3 | null => {
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
    return getLocalUpVector(centerPosition);
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
    return getLocalUpVector(centerPosition);
  }

  const sampledNormal = Cartesian3.cross(tangentX, tangentY, new Cartesian3());
  if (
    Cartesian3.magnitudeSquared(sampledNormal) <= POINTER_NORMAL_EPSILON_SQUARED
  ) {
    return getLocalUpVector(centerPosition);
  }

  const normalizedNormal = Cartesian3.normalize(
    sampledNormal,
    new Cartesian3()
  );
  const localUp = getLocalUpVector(centerPosition);
  if (Cartesian3.dot(normalizedNormal, localUp) < 0) {
    return Cartesian3.negate(normalizedNormal, new Cartesian3());
  }

  return normalizedNormal;
};

export const useCesiumPointQuery = (
  scene: Scene | null,
  enabled: boolean = true,
  setCollection: Dispatch<SetStateAction<MeasurementCollection>>,
  temporaryMode: boolean = true,
  onPointCreated?: (pointId: string, positionECEF: Cartesian3) => void,
  onLineFinish?: () => void,
  onBeforePointCreate?: (
    positionECEF: Cartesian3 | null,
    screenPosition: Cartesian2
  ) => boolean,
  verticalOffsetMeters: number = 0,
  nameOnCreate?: string,
  labelOnCreate: PointLabelMetricMode | undefined = undefined,
  hiddenOnCreate: boolean = false,
  auxiliaryOnCreate: boolean = false,
  useTemporaryForCreatedPoints: boolean = true,
  markCreatedPointsAsDistanceAdhoc: boolean = false,
  onPointerMove?: (
    positionECEF: Cartesian3 | null,
    screenPosition: Cartesian2,
    surfaceNormalECEF?: Cartesian3 | null
  ) => void
) => {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const pendingPointerMovePositionRef = useRef<Cartesian2 | null>(null);
  const pointerMoveFrameRef = useRef<number | null>(null);
  const prevTemporaryModeRef = useRef(temporaryMode);
  const onPointCreatedRef = useRef(onPointCreated);
  const onLineFinishRef = useRef(onLineFinish);
  const onBeforePointCreateRef = useRef(onBeforePointCreate);
  const onPointerMoveRef = useRef(onPointerMove);

  useEffect(() => {
    onPointCreatedRef.current = onPointCreated;
  }, [onPointCreated]);

  useEffect(() => {
    onLineFinishRef.current = onLineFinish;
  }, [onLineFinish]);

  useEffect(() => {
    onBeforePointCreateRef.current = onBeforePointCreate;
  }, [onBeforePointCreate]);

  useEffect(() => {
    onPointerMoveRef.current = onPointerMove;
  }, [onPointerMove]);

  // Handle temporary-to-permanent conversion when temporary mode is turned off
  useEffect(() => {
    if (prevTemporaryModeRef.current && !temporaryMode) {
      // Temporary mode was turned off, make all temporary measurements permanent
      makeTemporaryMeasurementsPermanent(setCollection);
      console.debug(
        "[PointQuery] Converted temporary measurements to permanent"
      );
    }
    prevTemporaryModeRef.current = temporaryMode;
  }, [temporaryMode, setCollection]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    scene.canvas.style.cursor = enabled ? "none" : "";
    return () => {
      if (!scene.isDestroyed()) {
        scene.canvas.style.cursor = "";
      }
    };
  }, [scene, enabled]);

  useEffect(() => {
    if (!scene || scene.isDestroyed() || !enabled) {
      // Clean up if disabled
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

    console.debug("[SceneClick] Enabling terrain click handler");
    // Create click handler
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
      const sampledSurfaceNormal = pickedPosition
        ? estimateSurfaceNormalAtPointer(scene, pendingPosition, pickedPosition)
        : null;
      onPointerMoveRef.current?.(
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

    const createPointAt = (position: Cartesian2) => {
      const pickedPosition = pickPositionWithMeasurementFillBypass(
        scene,
        position
      );

      if (
        onBeforePointCreateRef.current &&
        !onBeforePointCreateRef.current(pickedPosition ?? null, position)
      ) {
        scene.requestRender();
        return;
      }

      if (!pickedPosition) {
        console.debug("[SceneClick] No position picked");
        return;
      }

      const pickedPositionWGS84 = getDegreesFromCartesian(pickedPosition);
      const height = pickedPositionWGS84.altitude;
      const offsetMeters = Number.isFinite(verticalOffsetMeters)
        ? verticalOffsetMeters
        : 0;
      const hasVerticalOffsetStem = Math.abs(offsetMeters) > 1e-9;
      const upDirectionECEF = getLocalUpVector(pickedPosition);
      const offsetVectorECEF = Cartesian3.multiplyByScalar(
        upDirectionECEF,
        offsetMeters,
        new Cartesian3()
      );
      const geometryECEF = Cartesian3.add(
        pickedPosition,
        offsetVectorECEF,
        new Cartesian3()
      );
      const geometryWGS84 = getDegreesFromCartesian(geometryECEF);
      const measurementId = `point-${Date.now()}`;

      const measurementConstructor = (
        prev?: MeasurementCollection
      ): MeasurementEntry => {
        const useTemporaryForCreate =
          temporaryMode && useTemporaryForCreatedPoints;
        const insertionIndex = temporaryMode
          ? useTemporaryForCreate
            ? 0
            : prev?.filter(isPointMeasurementEntry).length || 0
          : prev?.filter(isPointMeasurementEntry).length || 0;
        return {
          type: MeasurementMode.PointQuery,
          id: measurementId,
          index: insertionIndex,
          geometryECEF,
          geometryWGS84: {
            longitude: geometryWGS84.longitude,
            latitude: geometryWGS84.latitude,
            height: geometryWGS84.altitude ?? 0,
          },
          timestamp: new Date().getTime(),
          ...(nameOnCreate && nameOnCreate.trim().length > 0
            ? { name: nameOnCreate.trim() }
            : {}),
          ...(hiddenOnCreate ? { hidden: true } : {}),
          ...(auxiliaryOnCreate ? { auxiliaryLabelAnchor: true } : {}),
          ...(markCreatedPointsAsDistanceAdhoc
            ? { distanceAdhocNode: true }
            : {}),
          ...(hasVerticalOffsetStem
            ? {
                verticalOffsetAnchorECEF: {
                  x: pickedPosition.x,
                  y: pickedPosition.y,
                  z: pickedPosition.z,
                },
              }
            : {}),
          ...(labelOnCreate !== undefined
            ? { pointLabelMode: labelOnCreate }
            : {}),
        };
      };

      updateCollection(
        setCollection,
        measurementConstructor,
        temporaryMode && useTemporaryForCreatedPoints
      );
      onPointCreatedRef.current?.(measurementId, geometryECEF);

      scene.requestRender();
      console.log(
        `[Measurement] Created terrain point at elevation: ${(
          height ?? 0
        ).toFixed(3)}m`
      );
    };

    handler.setInputAction((event: { position: Cartesian2 }) => {
      if (clickTimeoutId !== undefined) {
        window.clearTimeout(clickTimeoutId);
      }
      clickTimeoutId = window.setTimeout(() => {
        createPointAt(event.position);
        clickTimeoutId = undefined;
      }, POINT_CLICK_DELAY_MS);
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

    console.debug("[SceneClick] Terrain click handler enabled");

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
      console.debug("[SceneClick] Terrain click handler cleaned up");
    };
  }, [
    scene,
    enabled,
    temporaryMode,
    setCollection,
    verticalOffsetMeters,
    nameOnCreate,
    labelOnCreate,
    hiddenOnCreate,
    auxiliaryOnCreate,
    useTemporaryForCreatedPoints,
    markCreatedPointsAsDistanceAdhoc,
  ]);
};

export default useCesiumPointQuery;
