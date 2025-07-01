import { Dispatch, SetStateAction, useEffect, useRef } from "react";
import type { Viewer } from "cesium";
import {
  Cartesian2,
  Entity,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
} from "cesium";
import {
  isPointMeasurementEntry,
  MeasurementCollection,
  MeasurementMode,
  PointMeasurementEntry,
} from "../types/MeasurementTypes";

const updateLast =
  (measurement: PointMeasurementEntry) => (prev: MeasurementCollection) => {
    const existingIndex = prev
      .map((m, i) => ({ m, i }))
      .filter(
        ({ m }) =>
          isPointMeasurementEntry(m) && m.type === MeasurementMode.PointQuery
      )
      .map(({ i }) => i)
      .pop();
    if (existingIndex !== undefined) {
      const newCollection = [...prev];
      newCollection[existingIndex] = measurement;
      return newCollection;
    }
    return [...prev, measurement];
  };

const updateCollection = (
  setCollection: Dispatch<SetStateAction<MeasurementCollection>>,
  measurement: PointMeasurementEntry,
  soloMode: boolean
) => {
  if (soloMode) {
    setCollection(updateLast(measurement));
  } else {
    setCollection((prevCollection: MeasurementCollection) => [
      ...prevCollection,
      measurement,
    ]);
  }
};

const useCesiumPointQuery = (
  viewer: Viewer | null,
  enabled: boolean = true,
  setCollection: Dispatch<SetStateAction<MeasurementCollection>>,
  // custom measurement type settings
  searchRadius: number = 10, // Default search radius to 10m, same as cross3D visual
  nivPEntities?: Entity[],
  soloMode: boolean = false
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

      const measurement: PointMeasurementEntry = {
        type: MeasurementMode.PointQuery, // Assuming PointQuery is the mode for this
        id: `point-${Date.now()}`,
        name: `P h${height.toFixed(1)}m`,
        geometryECEF: pickedPosition,
        geometryWGS84: {
          longitude,
          latitude,
          height,
        },
        timestamp: new Date().getTime(),
        metadata: null, // No additional metadata for point query
      };

      updateCollection(setCollection, measurement, soloMode);

      console.debug(
        `[SceneClick] Created terrain point at elevation: ${height.toFixed(3)}m`
      );
    }, ScreenSpaceEventType.LEFT_CLICK);

    console.debug("[SceneClick] Terrain click handler enabled");

    // Cleanup function
    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      console.debug("[SceneClick] Terrain click handler cleaned up");
    };
  }, [viewer, enabled, nivPEntities, searchRadius, soloMode]);

  return {};
};

export default useCesiumPointQuery;
