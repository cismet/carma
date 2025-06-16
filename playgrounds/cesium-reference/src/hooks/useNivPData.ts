import { useEffect, useState } from "react";

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

/**
 * Hook for loading and transforming NivP point data.
 * This is a pure data hook with no Cesium viewer dependencies.
 * Only loads data once - elevation standard changes are handled by useNivPEntities.
 */
const useNivPData = (
  uri: string,
  includeHistoric: boolean = false
) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allPoints, setAllPoints] = useState<NivPPoint[]>([]);
  const [filteredPoints, setFilteredPoints] = useState<NivPPoint[]>([]);

  // Load data once per session
  useEffect(() => {
    const loadNivPData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        console.debug("[NIVP Data] Loading json data...");

        const response = await fetch(uri);
        if (!response.ok) {
          throw new Error(`Failed to load ${uri}: ${response.status}`);
        }

        const rawData: NivPPoint[] = await response.json();

        console.debug(
          `[NIVP Data] Loaded ${rawData.length} total points`
        );

        setAllPoints(rawData);
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Unknown error loading NivP data";
        console.error("[NIVP Data] Error loading NivP data:", err);
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    loadNivPData();
  }, [uri]);

  // Filter points based on historic toggle only
  useEffect(() => {
    if (allPoints.length === 0) return;

    const filtered = allPoints.filter(
      (point) => includeHistoric || !point.historisch
    );

    // Only update if the actual filtered result changed (avoid unnecessary rerenders)
    setFilteredPoints(prevFiltered => {
      if (prevFiltered.length !== filtered.length) return filtered;
      
      // Check if the actual points changed (by comparing IDs)
      const hasChanged = prevFiltered.some((p, i) => p.id !== filtered[i]?.id);
      return hasChanged ? filtered : prevFiltered;
    });
  }, [allPoints, includeHistoric]);

  return {
    isLoading,
    error,
    allPoints,
    filteredPoints,
    pointCount: filteredPoints.length,
  };
};

export default useNivPData;
