import { useCallback } from "react";
import { useMapTransition } from "./use-map-transition";
import { useTransitionContext } from "./use-transition-context";
import { usePortalContext } from "@carma-appframeworks/portals";

export type MapModeToggleOptions = {
  // currentEngine is no longer needed - derived from PortalContext
  duration?: number;
  onComplete?: (isTo2D: boolean) => void;
  onCancel?: (isTo2D: boolean) => void;
  onTransitionStart?: () => void;
  onTransitionEnd?: () => void;
  onEngineChange?: (engine: "leaflet2d" | "cesium3d") => void;
};

/**
 * Hook for toggling between 2D and 3D map modes.
 * Derives current mode from PortalContext's engine state automatically.
 *
 * @returns isTransitioning - Whether a transition is in progress
 * @returns toggleMode - Function to trigger mode transition
 */
export const useMapModeToggle = (options: MapModeToggleOptions) => {
  const {
    duration,
    onComplete,
    onCancel,
    onTransitionStart,
    onTransitionEnd,
    onEngineChange,
  } = options;

  // Get current engine from PortalContext
  const { getEngines } = usePortalContext();
  const engines = getEngines();
  const activeEngines = engines.filter(e => e.isReady && !e.isSuspended);
  const currentEngine = activeEngines.length > 0 ? activeEngines[0].engine : "leaflet2d";

  // Derive current mode from engine (2D if not cesium)
  const isMode2d = currentEngine !== "cesium3d";

  // Log initial state for debugging
  console.log("[MapModeToggle] ===== HOOK INITIALIZED =====");
  console.log("[MapModeToggle] Engine state:", {
    totalEngines: engines.length,
    activeEngines: activeEngines.length,
    currentEngine,
    isMode2d,
    allEngineTypes: engines.map(e => e.engineType || e.engine),
    engines: engines.map(e => ({
      engineType: e.engineType,
      engine: e.engine,
      isReady: e.isReady,
      isSuspended: e.isSuspended,
      hasInstance: !!e.instance
    }))
  });

  const { isTransitioningRef } = useTransitionContext();

  const handleComplete = useCallback(
    (isTo2D: boolean) => {
      // isTransitioning now derived from context state
      onTransitionEnd?.();
      onComplete?.(isTo2D);
    },
    [onComplete, onTransitionEnd]
  );

  const handleCancel = useCallback(
    (isTo2D: boolean) => {
      // isTransitioning now derived from context state - no local state to update
      onTransitionEnd?.();
      onCancel?.(isTo2D);
    },
    [onCancel, onTransitionEnd]
  );

  const { transitionToMode2d, transitionToMode3d } = useMapTransition({
    ...(duration !== undefined && { duration }),
    onComplete: handleComplete,
    onCancel: handleCancel,
    onEngineChange,
  });

  const toggleMode = useCallback(async () => {
    console.log("[MapModeToggle] ===== TOGGLE MODE CLICKED =====");
    console.log("[MapModeToggle] Current state:", { isMode2d, isTransitioning: isTransitioningRef.current });
    
    // isTransitioning now derived from context state - transition functions manage the state
    onTransitionStart?.();

    try {
      if (isMode2d) {
        console.log("[MapModeToggle] Transitioning to 3D mode");
        // transitionToMode3d handles its own initialization if needed
        await transitionToMode3d();
        console.log("[MapModeToggle] 3D transition completed");
      } else {
        console.log("[MapModeToggle] Transitioning to 2D mode");
        await transitionToMode2d();
        console.log("[MapModeToggle] 2D transition completed");
      }
    } catch (error) {
      console.error("[MapModeToggle] Transition failed:", error);
      // Context state will be reset by transition function on error
      onTransitionEnd?.();
      throw error;
    }
  }, [
    isMode2d,
    getEngines,
    transitionToMode3d,
    transitionToMode2d,
    onTransitionStart,
    onTransitionEnd,
  ]);

  return {
    isTransitioning: isTransitioningRef.current,
    toggleMode,
  };
};
