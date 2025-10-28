import { useCallback } from "react";
import { useMapTransition } from "./use-map-transition";
import { useTransitionContext } from "./use-transition-context";

export type MapModeToggleOptions = {
  currentEngine: "leaflet2d" | "maplibre2d" | "cesium3d";
  duration?: number;
  onComplete?: (isTo2D: boolean) => void;
  onCancel?: (isTo2D: boolean) => void;
  onTransitionStart?: () => void;
  onTransitionEnd?: () => void;
  onEngineChange?: (engine: "leaflet2d" | "cesium3d") => void;
};

/**
 * Hook for toggling between 2D and 3D map modes.
 * Derives current mode from PortalContext's engine state (passed as parameter).
 *
 * @returns isTransitioning - Whether a transition is in progress
 * @returns toggleMode - Function to trigger mode transition
 */
export const useMapModeToggle = (options: MapModeToggleOptions) => {
  const {
    currentEngine,
    duration,
    onComplete,
    onCancel,
    onTransitionStart,
    onTransitionEnd,
    onEngineChange,
  } = options;

  const { isTransitioningRef } = useTransitionContext();

  // Derive mode from portal's current engine (passed as parameter)
  const isMode2d = currentEngine !== "cesium3d";

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
    console.debug("[MapModeToggle] Toggling mode", { isMode2d });
    // isTransitioning now derived from context state - transition functions manage the state
    onTransitionStart?.();

    try {
      if (isMode2d) {
        // transitionToMode3d handles its own initialization if needed
        await transitionToMode3d();
      } else {
        await transitionToMode2d();
      }
    } catch (error) {
      console.error("[MapModeToggle] Transition failed:", error);
      // Context state will be reset by transition function on error
      onTransitionEnd?.();
      throw error;
    }
  }, [
    isMode2d,
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
