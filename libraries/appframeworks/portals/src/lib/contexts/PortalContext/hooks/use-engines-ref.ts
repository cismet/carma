import { useCallback, useMemo } from "react";
import type { MapEngine, MapEngineRecord } from "../../../types/portal";
import type { ManagedEngineRecord, EngineRecords } from "../../../types/map-engines";
import { ManagedEngineKeys } from "../../../constants";

/**
 * Internal custom hook to work with engines ref directly
 * Used within PortalStateProvider to avoid circular dependency
 * Provides stable references to prevent unnecessary re-renders
 *
 * This is derived state - all logic is based on the enginesRef parameter
 */
export const useEnginesRef = (
  enginesRef: React.MutableRefObject<EngineRecords>
) => {
  // Memoize active engines to prevent re-renders when ref content doesn't change
  // Note: This will only update when the ref object itself changes, not its content
  // For content changes, external components need to trigger re-renders via context updates
  const activeEngines = useMemo(
    () =>
      enginesRef.current.filter(
        (engine): engine is ManagedEngineRecord =>
          engine.isReady && !engine.isSuspended
      ),
    [enginesRef] // Only depends on the ref object, not its content
  );

  /**
   * Execute a callback function on each active engine
   * Type-safe execution with proper engine record typing
   */
  const forEachActiveEngine = useCallback(
    (callback: (engine: ManagedEngineRecord) => void) => {
      activeEngines.forEach(callback);
    },
    [activeEngines]
  );

  /**
   * Map over active engines and return array of results
   * Type-safe mapping with proper engine record typing
   */
  const mapToActiveEngines = useCallback(
    <T>(callback: (engine: ManagedEngineRecord) => T): T[] => {
      return activeEngines.map(callback);
    },
    [activeEngines]
  );

  /**
   * Check if a specific engine type is active
   */
  const isEngineActive = useCallback(
    (engineType: MapEngine) => {
      return activeEngines.some((engine) => engine.engine === engineType);
    },
    [activeEngines]
  );

  /**
   * Get active engine by type
   */
  const getActiveEngine = useCallback(
    (engineType: MapEngine) => {
      return activeEngines.find((engine) => engine.engine === engineType);
    },
    [activeEngines]
  );

  /**
   * Check if Cesium is specifically active
   * Returns a memoized function for API compatibility
   */
  const getIsCesiumActive = useCallback(
    () =>
      activeEngines.some(
        (engine) => engine.engine === ManagedEngineKeys.CESIUM_3D
      ),
    [activeEngines]
  );

  /**
   * Check if any engines are active
   * Memoized for stability
   */
  const hasActiveEngines = useMemo(
    () => activeEngines.length > 0,
    [activeEngines]
  );

  // Memoize the entire return object to prevent re-renders
  return useMemo(
    () => ({
      activeEngines,
      forEachActiveEngine,
      mapToActiveEngines,
      isEngineActive,
      getActiveEngine,
      getIsCesiumActive,
      hasActiveEngines,
    }),
    [
      activeEngines,
      forEachActiveEngine,
      mapToActiveEngines,
      isEngineActive,
      getActiveEngine,
      getIsCesiumActive,
      hasActiveEngines,
    ]
  );
};
