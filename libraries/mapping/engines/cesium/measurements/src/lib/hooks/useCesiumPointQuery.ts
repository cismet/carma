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
  markCreatedPointsAsDistanceAdhoc: boolean = false
) => {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const prevTemporaryModeRef = useRef(temporaryMode);
  const onPointCreatedRef = useRef(onPointCreated);
  const onLineFinishRef = useRef(onLineFinish);
  const onBeforePointCreateRef = useRef(onBeforePointCreate);

  useEffect(() => {
    onPointCreatedRef.current = onPointCreated;
  }, [onPointCreated]);

  useEffect(() => {
    onLineFinishRef.current = onLineFinish;
  }, [onLineFinish]);

  useEffect(() => {
    onBeforePointCreateRef.current = onBeforePointCreate;
  }, [onBeforePointCreate]);

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

    scene.canvas.style.cursor = enabled ? "crosshair" : "";
    return () => {
      if (!scene.isDestroyed()) {
        scene.canvas.style.cursor = "";
      }
    };
  }, [scene, enabled]);

  useEffect(() => {
    if (!scene || scene.isDestroyed() || !enabled) {
      // Clean up if disabled
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

    const createPointAt = (position: Cartesian2) => {
      const pickedPosition = scene.pickPosition(position);

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
      const localEnuFrame = Transforms.eastNorthUpToFixedFrame(pickedPosition);
      const upDirectionColumn = Matrix4.getColumn(
        localEnuFrame,
        2,
        new Cartesian4()
      );
      const upDirectionECEF = Cartesian3.normalize(
        new Cartesian3(
          upDirectionColumn.x,
          upDirectionColumn.y,
          upDirectionColumn.z
        ),
        new Cartesian3()
      );
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

    console.debug("[SceneClick] Terrain click handler enabled");

    return () => {
      if (clickTimeoutId !== undefined) {
        window.clearTimeout(clickTimeoutId);
        clickTimeoutId = undefined;
      }
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
