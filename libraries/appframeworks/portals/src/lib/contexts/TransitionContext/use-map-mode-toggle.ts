import { useCallback } from "react";
import { isValidScene } from "@carma/cesium";
import { useMapTransition } from "./use-map-transition";
import { useTransitionContext } from "./use-transition-context";

export type MapModeToggleOptions = {
  duration?: number;
  onComplete?: (isTo2D: boolean) => void;
  onCancel?: (isTo2D: boolean) => void;
  onTransitionStart?: () => void;
  onTransitionEnd?: () => void;
  onEngineChange?: (engine: "leaflet2d" | "cesium3d") => void;
};

/**
 * Hook for toggling between 2D and 3D map modes.
 * Gets current mode from TransitionContext.
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

  const { isTransitioningRef, currentMode, onCesiumFadeInRef, onCesiumFadeOutRef } = useTransitionContext();
  const isMode2d = currentMode === "2d";

  // Log initial state for debugging
  console.log("[MapModeToggle] ===== HOOK INITIALIZED =====");
  console.log("[MapModeToggle] Current mode:", { currentMode, isMode2d });

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
    onCesiumFadeIn: () => {
      // Call the registered callback from context
      onCesiumFadeInRef.current?.();
    },
    onCesiumFadeOut: () => {
      // Call the registered callback from context
      onCesiumFadeOutRef.current?.();
    },
  });

  const toggleMode = useCallback(async () => {
    console.log("[MapModeToggle] ===== TOGGLE MODE CLICKED =====");
    console.log("[MapModeToggle] Current state:", { currentMode, isMode2d, isTransitioning: isTransitioningRef.current });
    
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
    currentMode,
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
