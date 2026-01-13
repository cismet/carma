import { useEffect, useRef, useState } from "react";

import {
  Cartesian3,
  Color,
  PointPrimitiveCollection,
  type Scene,
} from "cesium";

import { PROJ4_CONVERTERS } from "@carma-commons/utils";
import { NivPoint, TransformedNivPoint } from "../types/NivPointTypes";
import { isPointMeasurementEntry } from "../types/MeasurementTypes";
import { useCesiumMeasurements } from "../CesiumMeasurementsContext";
import { useCRS, VerticalDatum } from "../CRSContext";

const getElevationValue = (
  point: NivPoint,
  standard: VerticalDatum
): number => {
  switch (standard) {
    case VerticalDatum.NHN2016:
      return point.hoehe_ueber_nhn2016;
    case VerticalDatum.NHN:
      return point.hoehe_ueber_nhn;
    case VerticalDatum.NN:
      return point.hoehe_ueber_nn;
    default:
      return point.hoehe_ueber_nhn;
  }
};

export const useNivPoints = (
  scene: Scene | null,
  uri: string,
  enabled: boolean = true,
  includeHistoric: boolean = false
) => {
  const { verticalDatum } = useCRS();
  const { measurements, pointRadius } = useCesiumMeasurements();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allPoints, setAllPoints] = useState<TransformedNivPoint[]>([]);
  const [filteredPoints, setFilteredPoints] = useState<TransformedNivPoint[]>(
    []
  );
  const pointPrimitiveCollectionRef = useRef<PointPrimitiveCollection | null>(
    null
  );
  const [nearestNivPoint, setNearestNivPoint] =
    useState<TransformedNivPoint | null>(null);

  // Load and transform data once per session
  useEffect(() => {
    if (!scene || !enabled) return;

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

            let cartesian: Cartesian3;
            let finalElevation = currentElevation || 0;

            if (hasValidElevation) {
              // Use the valid elevation data
              cartesian = Cartesian3.fromDegrees(
                longitude,
                latitude,
                currentElevation
              );
            } else if (point.historisch) {
              // For historical points without height, place them 0.5m above ground level
              finalElevation = 0.5;
              cartesian = Cartesian3.fromDegrees(
                longitude,
                latitude,
                finalElevation
              );
            } else {
              // For non-historical points without height, use ground level
              cartesian = Cartesian3.fromDegrees(longitude, latitude, 0);
            }

            return {
              ...point,
              longitude,
              latitude,
              cartesian,
              currentElevation: finalElevation,
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
  }, [scene, uri, verticalDatum, enabled]);

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

      let cartesian: Cartesian3;
      let finalElevation = currentElevation || 0;

      if (hasValidElevation) {
        // Use the valid elevation data
        cartesian = Cartesian3.fromDegrees(
          point.longitude,
          point.latitude,
          currentElevation
        );
      } else if (point.historisch) {
        // For historical points without height, place them 0.5m above ground level
        finalElevation = 0.5;
        cartesian = Cartesian3.fromDegrees(
          point.longitude,
          point.latitude,
          finalElevation
        );
      } else {
        // For non-historical points without height, use ground level
        cartesian = Cartesian3.fromDegrees(point.longitude, point.latitude, 0);
      }

      return {
        ...point,
        cartesian,
        currentElevation: finalElevation,
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

  // Create and manage primitives
  useEffect(() => {
    if (!scene || !enabled || filteredPoints.length === 0) return;

    console.debug(
      `[NIVP] Creating ${filteredPoints.length} point primitives...`
    );

    // Create or get the PointPrimitiveCollection
    if (!pointPrimitiveCollectionRef.current) {
      pointPrimitiveCollectionRef.current = scene.primitives.add(
        new PointPrimitiveCollection()
      );
    }

    const pointCollection = pointPrimitiveCollectionRef.current;

    // Add each point as a primitive
    filteredPoints.forEach((point) => {
      const isClampedHistorical = point.historisch && !point.hasValidElevation;

      pointCollection.add({
        position: point.cartesian,
        pixelSize: 5,
        color: point.hasValidElevation
          ? Color.WHITE
          : isClampedHistorical
          ? Color.YELLOW
          : Color.LIGHTGRAY,
        outlineColor: Color.BLACK.withAlpha(0.8),
        outlineWidth: 1,
        id: `nivp-point-${point.id}`,
      });
    });

    console.debug(
      `[NIVP] Added ${filteredPoints.length} point primitives to scene`
    );

    // Cleanup function
    return () => {
      console.debug("[NIVP] Cleaning up point primitives...");
      if (pointPrimitiveCollectionRef.current && !scene.isDestroyed?.()) {
        scene.primitives.remove(pointPrimitiveCollectionRef.current);
        pointPrimitiveCollectionRef.current = null;
      }
    };
  }, [scene, filteredPoints, enabled]);

  // Find nearest point
  useEffect(() => {
    if (!filteredPoints || !measurements || measurements.length < 1) return;

    const pointMeasurements = measurements.filter(isPointMeasurementEntry);
    const lastPoint = pointMeasurements[pointMeasurements.length - 1];

    if (!lastPoint) {
      setNearestNivPoint(null);
      return;
    }

    let nearestDistance = Infinity;
    let nearestPoint: TransformedNivPoint | null = null;

    filteredPoints.forEach((point) => {
      const distance = Cartesian3.distance(
        lastPoint.geometryECEF,
        point.cartesian
      );
      if (distance < nearestDistance && distance <= pointRadius) {
        nearestDistance = distance;
        nearestPoint = point;
      }
    });

    if (nearestPoint) {
      setNearestNivPoint(nearestPoint);
      console.debug(
        `[NIVP] Nearest point found: ${nearestPoint.id} at distance ${nearestDistance}`
      );
    } else {
      setNearestNivPoint(null);
    }
  }, [measurements, filteredPoints, pointRadius]);

  return {
    isLoading,
    error,
    points: filteredPoints,
    pointCount: filteredPoints.length,
    verticalDatum,
    nearestNivPoint,
    pointCollection: pointPrimitiveCollectionRef.current,
  };
};

export default useNivPoints;
