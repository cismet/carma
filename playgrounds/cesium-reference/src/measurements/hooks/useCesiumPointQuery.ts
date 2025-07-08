import { Dispatch, SetStateAction, useEffect, useRef } from "react";
import type { Viewer } from "cesium";
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
import { updateCollection } from "../utils/measurementCollection";

export const useCesiumPointQuery = (
  viewer: Viewer | null,
  enabled: boolean = true,
  setCollection: Dispatch<SetStateAction<MeasurementCollection>>,
  soloMode: boolean = true,
  radius: number = 10
) => {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);

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

      // Get cartographic coordinates
      const cartographic =
        viewer.scene.globe.ellipsoid.cartesianToCartographic(pickedPosition);
      if (!cartographic) {
        console.debug("[SceneClick] Could not convert to cartographic");
        return;
      }

      // Convert to degrees for display
      const longitude = cartographic.longitude * (180 / Math.PI);
      const latitude = cartographic.latitude * (180 / Math.PI);
      const height = cartographic.height;

      const measurementConstructor = (
        prev?: MeasurementCollection
      ): MeasurementEntry => {
        const insertionIndex =
          prev?.filter(isPointMeasurementEntry).length || 0;
        return {
          type: MeasurementMode.PointQuery,
          id: `point-${Date.now()}`,
          index: insertionIndex,
          name: `Messpunkt ${insertionIndex + 1} (${height.toFixed(1)}m)`,
          geometryECEF: pickedPosition,
          geometryWGS84: {
            longitude,
            latitude,
            height,
          },
          timestamp: new Date().getTime(),
        };
      };

      updateCollection(setCollection, measurementConstructor, soloMode);

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
  }, [viewer, enabled, radius, soloMode, setCollection]);

  return {};
};

export default useCesiumPointQuery;
