import { MapEngine } from "../types/portal";
import { ManagedEngineRecord } from "../types/map-engines";
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
export declare const useActiveEngines: () => {
  activeEngines: ManagedEngineRecord[];
  forEachActiveEngine: (
    callback: (engine: ManagedEngineRecord) => void
  ) => void;
  mapToActiveEngines: <T>(callback: (engine: ManagedEngineRecord) => T) => T[];
  isEngineActive: (engineType: MapEngine) => boolean;
  getActiveEngine: (engineType: MapEngine) => ManagedEngineRecord | undefined;
  isCesiumActive: boolean;
  hasActiveEngines: boolean;
};
