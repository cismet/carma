import { useEffect, useCallback, useRef } from "react";
import type { MeasurementCollection } from "../types/MeasurementTypes";
import {
  saveMeasurements,
  loadMeasurements,
} from "../utils/measurementPersistence";

/**
 * Hook for persisting measurements to localStorage
 * Saves immediately on every change, but only if data actually differs
 */
export const useMeasurementPersistence = (
  measurements: MeasurementCollection,
  setMeasurements: (measurements: MeasurementCollection) => void,
  tilesetReady: boolean = false
) => {
  const lastSavedRef = useRef<string | null>(null);
  const hasRestoredRef = useRef(false);

  // Debug: Log when tileset becomes ready
  useEffect(() => {
    if (tilesetReady) {
      console.debug(
        "[MeasurementPersistence] Tileset is ready for measurement restoration"
      );
    }
  }, [tilesetReady]);

  // One-time restore on mount, but only after tileset is ready
  useEffect(() => {
    if (!hasRestoredRef.current && tilesetReady) {
      const savedMeasurements = loadMeasurements();
      if (savedMeasurements && savedMeasurements.length > 0) {
        console.debug(
          `[MeasurementPersistence] Restoring ${savedMeasurements.length} measurements from localStorage (tileset ready: ${tilesetReady})`
        );

        // Log measurement types for debugging
        const measurementTypes = savedMeasurements.reduce((acc, m) => {
          acc[m.type] = (acc[m.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        console.debug(
          "[MeasurementPersistence] Measurement types:",
          measurementTypes
        );

        // Small delay to ensure tileset is fully ready and rendering
        setTimeout(() => {
          setMeasurements(savedMeasurements);
          console.debug(
            "[MeasurementPersistence] Measurements restored from localStorage"
          );
        }, 250);
      }
      hasRestoredRef.current = true;
    }
  }, [setMeasurements, tilesetReady]);

  // Auto-save measurements immediately when they change, but only if different
  useEffect(() => {
    // Only save after initial restore has happened
    if (hasRestoredRef.current) {
      const currentJson = JSON.stringify(measurements);
      console.debug("Saving measurements requested", measurements.length);
      // Only save if the JSON actually changed
      if (currentJson !== lastSavedRef.current) {
        saveMeasurements(measurements);
        lastSavedRef.current = currentJson;
      }
    }
  }, [measurements]);

  // Manual controls
  const save = useCallback(() => {
    saveMeasurements(measurements);
  }, [measurements]);

  const load = useCallback(() => {
    const savedMeasurements = loadMeasurements();
    if (savedMeasurements) {
      setMeasurements(savedMeasurements);
    }
    return savedMeasurements;
  }, [setMeasurements]);

  return {
    save,
    load,
    hasSaved: () => loadMeasurements() !== null,
  };
};
