import { useEffect, useRef, useState } from "react";
import {
  Cartesian2,
  Cartesian3,
  Color,
  Entity,
  HeightReference,
  NearFarScalar,
} from "cesium";

import { PROJ4_CONVERTERS } from "@carma-commons/utils";

import { useCesiumViewer } from "../contexts/CesiumViewerContext";
import type { NivPPoint, ElevationStandard } from "./useNivPData";

export const SCALE_BY_DISTANCE = new NearFarScalar(0, 1, 5000, 0.0);
export const SCALE_BY_DISTANCE_POINTS = new NearFarScalar(0, 1, 5000, 0.5);
export const LABEL_FONT = "bold 20px Univers, Verdana Pro, sans-serif";

const getElevationValue = (
  point: NivPPoint,
  standard: ElevationStandard
): number => {
  switch (standard) {
    case "nhn2016":
      return point.hoehe_ueber_nhn2016;
    case "nhn":
      return point.hoehe_ueber_nhn;
    case "nn":
      return point.hoehe_ueber_nn;
    default:
      return point.hoehe_ueber_nhn;
  }
};

const useNivPEntities = (
  points: NivPPoint[],
  elevationStandard: ElevationStandard
) => {
  const { viewerRef, isViewerReady } = useCesiumViewer();
  const [entities, setEntities] = useState<Entity[]>([]);
  const currentEntitiesRef = useRef<Entity[]>([]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !isViewerReady) {
      console.debug(
        "[NIVP Entities] Viewer not ready for entity creation, waiting..."
      );
      return;
    }

    if (points.length === 0) {
      console.debug("[NIVP Entities] No points to add as entities");
      return;
    }

    if (viewer.isDestroyed()) {
      console.warn("[NIVP Entities] Viewer is destroyed, cannot add entities");
      return;
    }

    console.debug(
      `[NIVP Entities] Creating ${points.length} point entities...`
    );

    // Clear existing entities first
    currentEntitiesRef.current.forEach((entity) => {
      if (viewer && !viewer.isDestroyed()) {
        viewer.entities.remove(entity);
      }
    });

    const newEntities: Entity[] = points.map((point) => {
      // Transform UTM32 ETRS89 (EPSG:25832) to WGS84 (EPSG:4326)
      const [longitude, latitude] = PROJ4_CONVERTERS.CRS25832.inverse([
        point.x,
        point.y,
      ]);

      // Get elevation based on the selected standard
      const currentElevation = getElevationValue(point, elevationStandard);

      // Check if elevation is valid
      const hasValidElevation = !!(
        currentElevation &&
        !isNaN(currentElevation) &&
        currentElevation !== 0
      );

      // Create Cesium Cartesian3 position
      const cartesian = hasValidElevation
        ? Cartesian3.fromDegrees(longitude, latitude, currentElevation)
        : Cartesian3.fromDegrees(longitude, latitude, 0);

      const entity = new Entity({
        id: `nivp-point-${point.id}`,
        name: `NivP Point ${point.laufende_nummer}`,
        description: "Festpunkt",
        properties: {
          nivpData: {
            ...point,
            longitude,
            latitude,
            cartesian,
            currentElevation: currentElevation || 0,
            elevationStandard,
            hasValidElevation,
          },
        },
        position: cartesian,
        point: {
          pixelSize: 5,
          scaleByDistance: SCALE_BY_DISTANCE_POINTS,
          color: hasValidElevation ? Color.WHITE : Color.LIGHTGRAY,
          outlineColor: Color.BLACK.withAlpha(0.8),
          outlineWidth: 1,
          heightReference: hasValidElevation
            ? HeightReference.NONE
            : HeightReference.CLAMP_TO_3D_TILE,
          disableDepthTestDistance: 200,
        },
        label: {
          text: hasValidElevation
            ? `${(currentElevation || 0).toFixed(2)}`
            : "No Data",
          font: LABEL_FONT,
          fillColor: hasValidElevation ? Color.WHITE : Color.LIGHTGRAY,
          showBackground: true,
          backgroundColor: Color.BLACK.withAlpha(0.5),
          backgroundPadding: new Cartesian2(12, 6),
          pixelOffset: new Cartesian2(0, -30),
          scaleByDistance: SCALE_BY_DISTANCE,
          disableDepthTestDistance: 200,
        },
      });

      return entity;
    });

    setEntities(newEntities);
    currentEntitiesRef.current = newEntities;

    // Add entities to viewer
    newEntities.forEach((entity) => {
      if (viewer && !viewer.isDestroyed()) {
        viewer.entities.add(entity);
      }
    });

    console.debug(
      `[NIVP Entities] Added ${newEntities.length} point entities to viewer`
    );

    // Cleanup function to remove entities when dependencies change
    return () => {
      console.debug("[NIVP Entities] Cleaning up point entities...");
      try {
        currentEntitiesRef.current.forEach((entity) => {
          if (viewer && !viewer.isDestroyed()) {
            viewer.entities.remove(entity);
          }
        });
        currentEntitiesRef.current = [];
      } catch (error) {
        console.error("[NIVP Entities] Error during cleanup:", error);
      }
    };
  }, [viewerRef, isViewerReady, points, elevationStandard]);

  return {
    entities,
    entityCount: entities.length,
  };
};

export default useNivPEntities;
