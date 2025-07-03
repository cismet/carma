import { useEffect, useState, useRef } from "react";
import type { Viewer } from "cesium";
import {
  Cartesian2,
  Cartesian3,
  Color,
  Entity,
  HeightReference,
  NearFarScalar,
} from "cesium";

import { PROJ4_CONVERTERS } from "@carma-commons/utils";
import {
  VerticalDatum,
  NivPoint,
  TransformedNivPoint,
} from "../types/VerticalDatumTypes";
import { isPointMeasurementEntry } from "../types/MeasurementTypes";
import { useCesiumMeasurements } from "../CesiumMeasurementsContext";

export const SCALE_BY_DISTANCE = new NearFarScalar(0, 1, 5000, 0.0);
export const SCALE_BY_DISTANCE_POINTS = new NearFarScalar(0, 1, 5000, 0.5);

export const LABEL_FONT = "bold 20px Univers, Verdana Pro, sans-serif";

const getElevationValue = (
  point: NivPoint,
  standard: VerticalDatum
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

const getElevationLabel = (standard: VerticalDatum): string => {
  switch (standard) {
    case "nhn2016":
      return "NHN2016";
    case "nhn":
      return "NHN";
    case "nn":
      return "NN";
    default:
      return "NHN";
  }
};

export const useNivPoints = (
  viewer: Viewer | null,
  uri: string,
  enabled: boolean = true,
  verticalDatum: VerticalDatum = "nhn",
  includeHistoric: boolean = false
) => {
  const { measurements, pointRadius } = useCesiumMeasurements();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allPoints, setAllPoints] = useState<TransformedNivPoint[]>([]); // Session permanent objects
  const [filteredPoints, setFilteredPoints] = useState<TransformedNivPoint[]>(
    []
  );
  const [entities, setEntities] = useState<Entity[]>([]);
  const [nearestNivPoint, setNearestNivPoint] = useState<Entity | null>(null);
  const currentEntitiesRef = useRef<Entity[]>([]);

  // Load and transform data once per session
  useEffect(() => {
    if (!viewer || !enabled) return;

    const loadNivPData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        console.debug("[NIVP] Loading json data...");

        const response = await fetch(uri);
        if (!response.ok) {
          throw new Error(`Failed to load ${uri}: ${response.status}`);
        }

        const rawData: NivPoint[] = await response.json();

        // Transform all points to session permanent objects
        const transformedPoints: TransformedNivPoint[] = rawData.map(
          (point) => {
            // Transform UTM32 ETRS89 (EPSG:25832) to WGS84 (EPSG:4326)
            const [longitude, latitude] = PROJ4_CONVERTERS.CRS25832.inverse([
              point.x,
              point.y,
            ]);

            // Get elevation based on the selected standard
            const currentElevation = getElevationValue(point, verticalDatum);

            // Check if elevation is valid
            const hasValidElevation = !!(
              currentElevation &&
              !isNaN(currentElevation) &&
              currentElevation !== 0
            );

            // Create Cesium Cartesian3 position
            // For valid elevation, use absolute position; for invalid, use ground level (will be clamped)
            const cartesian = hasValidElevation
              ? Cartesian3.fromDegrees(longitude, latitude, currentElevation)
              : Cartesian3.fromDegrees(longitude, latitude, 0);

            return {
              ...point,
              longitude,
              latitude,
              cartesian,
              currentElevation: currentElevation || 0,
              verticalDatum,
              hasValidElevation,
            };
          }
        );

        console.debug(
          `[NIVP] Transformed ${transformedPoints.length} total points (session permanent objects)`
        );

        setAllPoints(transformedPoints);
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Unknown error loading NivP data";
        console.error("[NIVP] Error loading NivP data:", err);
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    loadNivPData();
  }, [viewer, uri, verticalDatum, enabled]); // Include verticalDatum for initial transformation

  // Filter points based on historic toggle and elevation standard
  useEffect(() => {
    if (allPoints.length === 0) return;

    // Filter out historic points if includeHistoric is false
    const filtered = allPoints.filter(
      (point) => includeHistoric || !point.historisch
    );

    // Update elevation data based on current standard
    const updatedPoints = filtered.map((point) => {
      const currentElevation = getElevationValue(point, verticalDatum);
      const hasValidElevation = !!(
        currentElevation &&
        !isNaN(currentElevation) &&
        currentElevation !== 0
      );

      // Update cartesian position based on new elevation standard
      const cartesian = hasValidElevation
        ? Cartesian3.fromDegrees(
            point.longitude,
            point.latitude,
            currentElevation
          )
        : Cartesian3.fromDegrees(point.longitude, point.latitude, 0);

      return {
        ...point,
        cartesian,
        currentElevation: currentElevation || 0,
        verticalDatum,
        hasValidElevation,
      };
    });

    console.debug(
      `[NIVP] Filtered to ${updatedPoints.length} points (includeHistoric: ${includeHistoric}, verticalDatum: ${verticalDatum})`
    );

    const validElevationCount = updatedPoints.filter(
      (p) => p.hasValidElevation
    ).length;
    const invalidElevationCount = updatedPoints.length - validElevationCount;
    console.debug(
      `[NIVP] Valid elevation points: ${validElevationCount}, Invalid elevation points: ${invalidElevationCount}`
    );

    setFilteredPoints(updatedPoints);
  }, [allPoints, includeHistoric, verticalDatum]);

  useEffect(() => {
    if (!viewer || !enabled || filteredPoints.length === 0) return;

    console.debug(`[NIVP] Creating ${filteredPoints.length} point entities...`);

    const newEntities: Entity[] = filteredPoints.map((point) => {
      const entity = new Entity({
        id: `nivp-point-${point.id}`,
        name: `NivP Point ${point.laufende_nummer}`,
        // Store the original point data for access in useSceneClick
        properties: {
          nivpData: point,
        },
        position: point.cartesian,
        point: {
          pixelSize: 5,
          scaleByDistance: SCALE_BY_DISTANCE_POINTS,
          color: point.hasValidElevation ? Color.WHITE : Color.LIGHTGRAY,
          outlineColor: Color.BLACK.withAlpha(0.8),
          outlineWidth: 1,
          // Use NONE for valid elevation (absolute position) and CLAMP_TO_3D_TILE for invalid
          heightReference: point.hasValidElevation
            ? HeightReference.NONE
            : HeightReference.CLAMP_TO_3D_TILE,
          disableDepthTestDistance: 200,
        },
        label: {
          text: point.hasValidElevation
            ? `${point.currentElevation.toFixed(2)}`
            : "No Data",
          font: LABEL_FONT,
          fillColor: point.hasValidElevation ? Color.WHITE : Color.LIGHTGRAY,
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
      // Add HMR robustness - check if viewer is not destroyed
      if (viewer && !viewer.isDestroyed()) {
        viewer.entities.add(entity);
      }
    });

    console.debug(
      `[NIVP] Added ${newEntities.length} point entities to viewer`
    );

    // Cleanup function to remove entities when component unmounts
    return () => {
      console.debug("[NIVP] Cleaning up point entities...");
      try {
        // Clean up the entities that were tracked in the ref
        currentEntitiesRef.current.forEach((entity) => {
          // Add HMR robustness - check if viewer is not destroyed
          if (viewer && !viewer.isDestroyed()) {
            viewer.entities.remove(entity);
          }
        });
        currentEntitiesRef.current = [];
      } catch (error) {
        console.error("[useNivPoints] Error during cleanup:", error);
      }
    };
  }, [viewer, filteredPoints, verticalDatum, enabled]);

  useEffect(() => {
    if (!entities || !measurements || measurements.length < 1) return;

    const pointMeasurements = measurements.filter(isPointMeasurementEntry);

    const lastPoint = pointMeasurements[pointMeasurements.length - 1];

    let distance = Infinity;
    let entityIndex = 0;

    while (
      distance > pointRadius &&
      entityIndex < entities.length &&
      lastPoint
    ) {
      const entity = entities[entityIndex];
      const entityDistance = Cartesian3.distance(
        lastPoint.geometryECEF,
        entity.position.getValue(viewer.clock.currentTime)
      );
      if (entityDistance < distance) {
        distance = entityDistance;
      }
      entityIndex++;
    }

    if (distance <= pointRadius && lastPoint) {
      const nearestPoint = entities[entityIndex - 1];
      setNearestNivPoint(nearestPoint);
      console.debug(
        `[NIVP] Nearest point found: ${nearestPoint.id} at distance ${distance}`
      );
    } else {
      setNearestNivPoint(null);
    }
  }, [measurements, entities, pointRadius]);

  return {
    isLoading,
    error,
    points: filteredPoints,
    entities,
    pointCount: filteredPoints.length,
    verticalDatum,
    nearestNivPoint,
  };
};

export default useNivPoints;
