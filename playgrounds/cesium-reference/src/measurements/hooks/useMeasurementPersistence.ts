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
  setMeasurements: (measurements: MeasurementCollection) => void
) => {
  const lastSavedRef = useRef<string | null>(null);
  const hasRestoredRef = useRef(false);

  // One-time restore on mount
  useEffect(() => {
    if (!hasRestoredRef.current) {
      const savedMeasurements = loadMeasurements();
      if (savedMeasurements && savedMeasurements.length > 0) {
        setMeasurements(savedMeasurements);
        console.debug("Measurements restored from localStorage");
      }
      hasRestoredRef.current = true;
    }
  }, [setMeasurements]);

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
