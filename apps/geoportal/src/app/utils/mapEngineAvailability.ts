import type { MapEngine } from "@carma-appframeworks/portals";

/**
 * Map engine types that features can be available on
 */
export type AvailableEngine = MapEngine | "maplibre";

/**
 * Check if a feature is available on the current map engine
 * @param currentEngine - The currently active map engine
 * @param availableOn - List of engines this feature is available on
 * @returns true if feature is available on current engine
 */
export const isFeatureAvailable = (
  currentEngine: MapEngine,
  availableOn: AvailableEngine[]
): boolean => {
  return availableOn.includes(currentEngine as AvailableEngine);
};

/**
 * Get disabled state for a feature based on engine availability
 * @param currentEngine - The currently active map engine
 * @param availableOn - List of engines this feature is available on
 * @returns true if feature should be disabled
 */
export const isFeatureDisabled = (
  currentEngine: MapEngine,
  availableOn: AvailableEngine[]
): boolean => {
  return !isFeatureAvailable(currentEngine, availableOn);
};

/**
 * Common engine availability presets
 */
export const EngineAvailability = {
  /** Only available in 2D Leaflet mode */
  LEAFLET_2D: ["leaflet2d"] as AvailableEngine[],

  /** Only available in 3D Cesium mode */
  CESIUM_3D: ["cesium3d"] as AvailableEngine[],

  /** Available in both 2D and 3D */
  ALL_ENGINES: ["leaflet2d", "cesium3d"] as AvailableEngine[],

  /** Available in 2D modes (Leaflet and MapLibre) */
  ALL_2D: ["leaflet2d", "maplibre"] as AvailableEngine[],
} as const;
