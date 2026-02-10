import { Dispatch, SetStateAction, useEffect, useRef } from "react";

import {
  Cartesian2,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  getDegreesFromCartesian,
  type Scene,
} from "@carma/cesium";

import {
  isPointMeasurementEntry,
  MeasurementCollection,
  MeasurementEntry,
  MeasurementMode,
} from "../types/MeasurementTypes";
import {
  updateCollection,
  makeTemporaryMeasurementsPermanent,
} from "../utils/measurementCollection";
import { useCesiumMousePosition } from "./useCesiumMousePosition";

export const useCesiumPointQuery = (
  scene: Scene | null,
  enabled: boolean = true,
  setCollection: Dispatch<SetStateAction<MeasurementCollection>>,
  temporaryMode: boolean = true,
  radius: number = 10
) => {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const prevTemporaryModeRef = useRef(temporaryMode);

  // Use mouse position hook to track cursor and show crosshair
  const mousePosition = useCesiumMousePosition(scene, enabled);

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

    handler.setInputAction((event: { position: Cartesian2 }) => {
      // Try to pick terrain/mesh position
      const pickedPosition = scene.pickPosition(event.position);

      if (!pickedPosition) {
        console.debug("[SceneClick] No position picked");
        return;
      }

      const geometryWGS84 = getDegreesFromCartesian(pickedPosition);
      const height = geometryWGS84.altitude;

      const measurementId = `point-${Date.now()}`;

      const measurementConstructor = (
        prev?: MeasurementCollection
      ): MeasurementEntry => {
        const insertionIndex = temporaryMode
          ? 0
          : prev?.filter(isPointMeasurementEntry).length || 0;
        return {
          type: MeasurementMode.PointQuery,
          id: measurementId,
          index: insertionIndex,
          geometryECEF: pickedPosition,
          geometryWGS84: {
            longitude: geometryWGS84.longitude,
            latitude: geometryWGS84.latitude,
            height: geometryWGS84.altitude ?? 0,
          },
          timestamp: new Date().getTime(),
        };
      };

      updateCollection(setCollection, measurementConstructor, temporaryMode);

      scene.requestRender();
      console.log(
        `[Measurement] Created terrain point at elevation: ${(
          height ?? 0
        ).toFixed(3)}m`
      );
    }, ScreenSpaceEventType.LEFT_CLICK);

    console.debug("[SceneClick] Terrain click handler enabled");

    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      console.debug("[SceneClick] Terrain click handler cleaned up");
    };
  }, [scene, enabled, radius, temporaryMode, setCollection]);

  return {
    mousePosition, // Current mouse position in 3D space
  };
};

export default useCesiumPointQuery;
