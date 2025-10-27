import { useCallback } from "react";
import type { MapEngine } from "../../types/portal";
import { ManagedEngineKeys } from "../../constants";
import { useHashState } from "../HashStateProvider";

/**
 * Map Engine state management hook
 */
export const useMapEngineState = (
  currentEngine: React.MutableRefObject<MapEngine>,
  initialEngine: MapEngine,
  engineInitState: React.MutableRefObject<{
    leaflet2d: boolean;
    cesium3d: boolean;
  }>,
  onEngineFirstRequest?: (engine: MapEngine) => void
) => {
  const { updateHash } = useHashState();

  const setCurrentEngine = useCallback(
    (engine: MapEngine) => {
      currentEngine.current = engine;

      // Check if this is the first time this engine is being requested
      if (
        engine === ManagedEngineKeys.CESIUM_3D &&
        !engineInitState.current.cesium3d
      ) {
        engineInitState.current.cesium3d = true;
        onEngineFirstRequest?.(engine);
      } else if (
        engine === ManagedEngineKeys.LEAFLET_2D &&
        !engineInitState.current.leaflet2d
      ) {
        engineInitState.current.leaflet2d = true;
        onEngineFirstRequest?.(engine);
      }

      // Automatically update hash when engine changes
      updateHash(
        {
          engine:
            engine === ManagedEngineKeys.CESIUM_3D
              ? ManagedEngineKeys.CESIUM_3D
              : undefined,
        },
        { label: "PortalStateProvider:engine" }
      );
    },
    [updateHash, currentEngine, engineInitState, onEngineFirstRequest]
  );

  const useMapEngine = useCallback(
    () => ({
      current: currentEngine.current,
      set: setCurrentEngine,
      initial: initialEngine,
    }),
    [initialEngine, setCurrentEngine, currentEngine]
  );

  return { useMapEngine };
};
