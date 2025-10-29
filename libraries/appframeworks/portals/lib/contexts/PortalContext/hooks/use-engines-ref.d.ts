import { MapEngine, MapEngineRecord } from "../../../types/portal";
import { ManagedEngineRecord } from "../../../types/map-engines";
/**
 * Internal custom hook to work with engines ref directly
 * Used within PortalStateProvider to avoid circular dependency
 * Provides stable references to prevent unnecessary re-renders
 *
 * This is derived state - all logic is based on the enginesRef parameter
 */
export declare const useEnginesRef: (
  enginesRef: React.MutableRefObject<MapEngineRecord[]>
) => {
  activeEngines: ManagedEngineRecord[];
  forEachActiveEngine: (
    callback: (engine: ManagedEngineRecord) => void
  ) => void;
  mapToActiveEngines: <T>(callback: (engine: ManagedEngineRecord) => T) => T[];
  isEngineActive: (engineType: MapEngine) => boolean;
  getActiveEngine: (engineType: MapEngine) => ManagedEngineRecord | undefined;
  isCesiumActive: () => boolean;
  hasActiveEngines: boolean;
};
