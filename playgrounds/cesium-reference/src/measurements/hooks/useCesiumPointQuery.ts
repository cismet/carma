import { Dispatch, SetStateAction, useEffect, useRef } from "react";
import type { Cartesian3, Viewer } from "cesium";
import {
  Cartesian2,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
} from "cesium";
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
import { toGeographicDegrees } from "../utils/geo";

export const useCesiumPointQuery = (
  viewer: Viewer | null,
  enabled: boolean = true,
  setCollection: Dispatch<SetStateAction<MeasurementCollection>>,
  temporaryMode: boolean = true,
  radius: number = 10
) => {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const prevTemporaryModeRef = useRef(temporaryMode);

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
    if (!viewer || viewer.isDestroyed() || !enabled) {
      // Clean up if disabled
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      return;
    }

    console.debug("[SceneClick] Enabling terrain click handler");
    // Create click handler
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;

    handler.setInputAction((event: { position: Cartesian2 }) => {
      // Try to pick terrain/mesh position
      const pickedPosition = viewer.scene.pickPosition(event.position);

      if (!pickedPosition) {
        console.debug("[SceneClick] No position picked");
        return;
      }

      const geometryWGS84 = toGeographicDegrees(
        pickedPosition,
        viewer.scene.globe.ellipsoid
      );
      const { height } = geometryWGS84;

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
          name: `Messpunkt ${insertionIndex + 1}`,
          geometryECEF: pickedPosition,
          geometryWGS84,
          timestamp: new Date().getTime(),
        };
      };

      updateCollection(setCollection, measurementConstructor, temporaryMode);

      console.debug(
        `[SceneClick] Created terrain point at elevation: ${height.toFixed(3)}m`
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
  }, [viewer, enabled, radius, temporaryMode, setCollection]);

  return {};
};

export default useCesiumPointQuery;
