import { useCallback } from "react";
import { usePortalContext } from "../contexts/PortalContext";
import type { MapEngine, MapEngineRecord } from "../types/portal";
import type { ManagedEngineRecord } from "../types/map-engines";
import { ManagedEngineKeys } from "../constants";

/**
 * Hook for conveniently accessing and operating on active (ready, non-suspended) engines
 *
 * Provides filtered access to active engines and common operations across them.
 * Useful for coordinating actions across multiple engines simultaneously.
 *
 * @example
 * ```tsx
 * const { activeEngines, forEachActiveEngine, mapToActiveEngines } = useActiveEngines();
 *
 * // Call flyHome on all active engines
 * forEachActiveEngine((engine) => engine.flyHome?.());
 *
 * // Get names of all active engines
 * const activeEngineNames = mapToActiveEngines((engine) => engine.engine);
 * ```
 */
export const useActiveEngines = () => {
  const { enginesRef } = usePortalContext();

  // Filter to get only active engines (ready and not suspended)
  const isActiveEngine = (
    engine: MapEngineRecord
  ): engine is ManagedEngineRecord => engine.isReady && !engine.isSuspended;

  const activeEngines: ManagedEngineRecord[] =
    enginesRef.current.filter(isActiveEngine);

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
   */
  const isCesiumActive = activeEngines.some(
    (engine) => engine.engine === ManagedEngineKeys.CESIUM_3D
  );

  return {
    activeEngines,
    forEachActiveEngine,
    mapToActiveEngines,
    isEngineActive,
    getActiveEngine,
    isCesiumActive,
    hasActiveEngines: activeEngines.length > 0,
  };
};
