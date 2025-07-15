import type { MeasurementCollection } from "../types/MeasurementTypes";

const STORAGE_KEY = "cesium-reference-measurements";

/**
 * Saves measurements to localStorage
 */
export const saveMeasurements = (measurements: MeasurementCollection): void => {
  try {
    // Simple serialization - just store the measurements as-is
    localStorage.setItem(STORAGE_KEY, JSON.stringify(measurements));
    console.debug("Measurements saved to localStorage", measurements.length);
  } catch (error) {
    console.warn("Failed to save measurements to localStorage:", error);
  }
};

/**
 * Loads measurements from localStorage
 * Sets shouldRebuildEntry flag to trigger state reconstruction
 */
export const loadMeasurements = (): MeasurementCollection | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const measurements = JSON.parse(saved) as MeasurementCollection;

      // Set shouldRebuildEntry flag for all traverse measurements
      const restored = measurements.map((entry) => {
        if (entry.type === "traverse") {
          return {
            ...entry,
            shouldRebuildEntry: true, // Trigger rebuild of derived state
          };
        }
        return entry;
      });

      console.debug("Measurements loaded from localStorage", restored.length);
      return restored;
    }
  } catch (error) {
    console.warn("Failed to load measurements from localStorage:", error);
  }
  return null;
};
