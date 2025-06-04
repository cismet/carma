import { useEffect, useState, useRef } from "react";
import type { Viewer } from "cesium";
import { Cartesian2, Cartesian3, Color, Entity, HeightReference } from "cesium";

import { PROJ4_CONVERTERS } from "@carma-commons/utils";

export type ElevationStandard = "nhn2016" | "nhn" | "nn";

export interface NivPPoint {
  hoehe_ueber_nn: number;
  festlegungsart: number;
  lagegenauigkeit: number;
  laufende_nummer: string;
  dgk_blattnummer: string;
  messungsjahr: number;
  lagebezeichnung: string;
  geometrie: number;
  id: number;
  punktnummer_nrw: string | null;
  bemerkung: string | null;
  historisch: boolean;
  hoehe_ueber_nhn2016: number;
  hoehe_ueber_nhn: number;
  x: number;
  y: number;
  geojson: {
    type: "Point";
    crs: { type: "name"; properties: { name: "EPSG:25832" } };
    coordinates: [number, number];
  };
}

export interface TransformedNivPPoint extends NivPPoint {
  longitude: number;
  latitude: number;
  cartesian: Cartesian3;
  currentElevation: number;
  elevationStandard: ElevationStandard;
  hasValidElevation: boolean;
}

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

const getElevationLabel = (standard: ElevationStandard): string => {
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

const useNivPPoints = (
  viewer: Viewer | null,
  elevationStandard: ElevationStandard = "nhn",
  uri: string,
  showLabels: boolean = true,
  includeHistoric: boolean = false
) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allPoints, setAllPoints] = useState<TransformedNivPPoint[]>([]); // Session permanent objects
  const [filteredPoints, setFilteredPoints] = useState<TransformedNivPPoint[]>(
    []
  );
  const [entities, setEntities] = useState<Entity[]>([]);
  const currentEntitiesRef = useRef<Entity[]>([]);

  // Load and transform data once per session
  useEffect(() => {
    if (!viewer) return;

    const loadNivPData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        console.debug("[NIVP] Loading json data...");

        const response = await fetch(uri);
        if (!response.ok) {
          throw new Error(`Failed to load ${uri}: ${response.status}`);
        }

        const rawData: NivPPoint[] = await response.json();

        // Transform all points to session permanent objects
        const transformedPoints: TransformedNivPPoint[] = rawData.map(
          (point) => {
            // Transform UTM32 ETRS89 (EPSG:25832) to WGS84 (EPSG:4326)
            const [longitude, latitude] = PROJ4_CONVERTERS.CRS25832.inverse([
              point.x,
              point.y,
            ]);

            // Get elevation based on the selected standard
            const currentElevation = getElevationValue(
              point,
              elevationStandard
            );

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
              elevationStandard,
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
  }, [viewer, uri, elevationStandard]); // Include elevationStandard for initial transformation

  // Filter points based on historic toggle and elevation standard
  useEffect(() => {
    if (allPoints.length === 0) return;

    // Filter out historic points if includeHistoric is false
    const filtered = allPoints.filter(
      (point) => includeHistoric || !point.historisch
    );

    // Update elevation data based on current standard
    const updatedPoints = filtered.map((point) => {
      const currentElevation = getElevationValue(point, elevationStandard);
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
        elevationStandard,
        hasValidElevation,
      };
    });

    console.debug(
      `[NIVP] Filtered to ${updatedPoints.length} points (includeHistoric: ${includeHistoric}, elevationStandard: ${elevationStandard})`
    );

    const validElevationCount = updatedPoints.filter(
      (p) => p.hasValidElevation
    ).length;
    const invalidElevationCount = updatedPoints.length - validElevationCount;
    console.debug(
      `[NIVP] Valid elevation points: ${validElevationCount}, Invalid elevation points: ${invalidElevationCount}`
    );

    setFilteredPoints(updatedPoints);
  }, [allPoints, includeHistoric, elevationStandard]);
  useEffect(() => {
    if (!viewer || filteredPoints.length === 0) return;

    console.debug(`[NIVP] Creating ${filteredPoints.length} point entities...`);

    const newEntities: Entity[] = filteredPoints.map((point) => {
      const elevationLabel = getElevationLabel(elevationStandard);

      const entity = new Entity({
        id: `nivp-point-${point.id}`,
        name: `NivP Point ${point.laufende_nummer}`,
        description: `
          <h3>NivP Point ${point.laufende_nummer}</h3>
          <table>
            <tr>
              <td><strong>Höhenbezug:</strong></td>
              <td><strong>${elevationLabel}</strong></td>
            </tr>
            <tr>
              <td><strong>Aktuelle Höhe:</strong></td>
              <td>${
                point.hasValidElevation
                  ? `${point.currentElevation.toFixed(3)} m`
                  : `Keine gültigen Höhenangaben`
              }</td>
            </tr>
            <tr>
              <td><strong>ID:</strong></td>
              <td>${point.id}</td>
            </tr>
            <tr>
              <td><strong>Punktnummer NRW:</strong></td>
              <td>${point.punktnummer_nrw || "nicht verfügbar"}</td>
            </tr>
            <tr>
              <td><strong>Lagebezeichnung:</strong></td>
              <td>${point.lagebezeichnung}</td>
            </tr>
            <tr>
              <td><strong>Höhe über NN:</strong></td>
              <td>${point.hoehe_ueber_nn.toFixed(3)} m</td>
            </tr>
            <tr>
              <td><strong>Höhe über NHN2016:</strong></td>
              <td>${point.hoehe_ueber_nhn2016.toFixed(3)} m</td>
            </tr>
            <tr>
              <td><strong>Höhe über NHN:</strong></td>
              <td>${point.hoehe_ueber_nhn.toFixed(3)} m</td>
            </tr>
            <tr>
              <td><strong>Bemerkung:</strong></td>
              <td>${point.bemerkung || "keine"}</td>
            </tr>
            <tr>
              <td><strong>Festlegungsart:</strong></td>
              <td>${point.festlegungsart}</td>
            </tr>
            <tr>
              <td><strong>Lagegenauigkeit:</strong></td>
              <td>${point.lagegenauigkeit}</td>
            </tr>
            <tr>
              <td><strong>Laufende Nummer:</strong></td>
              <td>${point.laufende_nummer}</td>
            </tr>
            <tr>
              <td><strong>DGK Blatt:</strong></td>
              <td>${point.dgk_blattnummer}</td>
            </tr>
            <tr>
              <td><strong>Messungsjahr:</strong></td>
              <td>${point.messungsjahr}</td>
            </tr>
            <tr>
              <td><strong>Geometrie:</strong></td>
              <td>${point.geometrie}</td>
            </tr>
            <tr>
              <td><strong>Historisch:</strong></td>
              <td>${point.historisch ? "Ja" : "Nein"}</td>
            </tr>
            <tr>
              <td><strong>UTM32 X:</strong></td>
              <td>${point.x.toFixed(2)} m</td>
            </tr>
            <tr>
              <td><strong>UTM32 Y:</strong></td>
              <td>${point.y.toFixed(2)} m</td>
            </tr>
            <tr>
              <td><strong>Longitude:</strong></td>
              <td>${point.longitude.toFixed(6)}°</td>
            </tr>
            <tr>
              <td><strong>Latitude:</strong></td>
              <td>${point.latitude.toFixed(6)}°</td>
            </tr>
          </table>
        `,
        position: point.cartesian,
        point: {
          pixelSize: 5,
          color: point.hasValidElevation ? Color.WHITE : Color.LIGHTGRAY,
          outlineColor: Color.BLACK.withAlpha(0.8),
          outlineWidth: 1,
          // Use NONE for valid elevation (absolute position) and CLAMP_TO_3D_TILE for invalid
          heightReference: point.hasValidElevation
            ? HeightReference.NONE
            : HeightReference.CLAMP_TO_3D_TILE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: showLabels
          ? {
              text: point.hasValidElevation
                ? `${point.currentElevation.toFixed(2)}`
                : "No Data",
              font: "bold 48px Arial, sans-serif",
              fillColor: point.hasValidElevation
                ? Color.WHITE
                : Color.LIGHTGRAY,
              showBackground: true,
              backgroundColor: Color.BLACK.withAlpha(0.5),
              backgroundPadding: new Cartesian2(12, 6),
              pixelOffset: new Cartesian2(0, -30),
              scale: 0.5,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }
          : undefined,
      });

      return entity;
    });

    setEntities(newEntities);
    currentEntitiesRef.current = newEntities;

    // Add entities to viewer
    newEntities.forEach((entity) => {
      viewer.entities.add(entity);
    });

    console.debug(
      `[NIVP] Added ${newEntities.length} point entities to viewer`
    );

    // Cleanup function to remove entities when component unmounts
    return () => {
      console.debug("[NIVP] Cleaning up point entities...");
      // Clean up the entities that were tracked in the ref
      currentEntitiesRef.current.forEach((entity) => {
        viewer.entities.remove(entity);
      });
      currentEntitiesRef.current = [];
    };
  }, [viewer, filteredPoints, elevationStandard, showLabels]);

  return {
    isLoading,
    error,
    points: filteredPoints,
    entities,
    pointCount: filteredPoints.length,
    elevationStandard,
  };
};

export default useNivPPoints;
