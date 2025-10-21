import { useState, useCallback } from "react";
import { useCesiumContext } from "@carma-mapping/engines/cesium/core";
import { useMapTransition } from "./use-map-transition";

export type MapModeToggleOptions = {
  duration?: number;
  onComplete?: (isTo2D: boolean) => void;
  onCancel?: (isTo2D: boolean) => void;
  onTransitionStart?: () => void;
  onTransitionEnd?: () => void;
};

/**
 * Hook for toggling between 2D and 3D map modes.
 * Tracks current mode via Cesium context events and provides toggle function.
 *
 * @returns isMode2d - Current mode (true = 2D, false = 3D)
 * @returns isTransitioning - Whether a transition is in progress
 * @returns toggleMode - Function to trigger mode transition
 */
export const useMapModeToggle = (options: MapModeToggleOptions = {}) => {
  const { duration, onComplete, onCancel, onTransitionStart, onTransitionEnd } =
    options;

  const { isSuspendedRef } = useCesiumContext();

  // Track mode based on Cesium suspended state (suspended = 2D mode active)
  const [isMode2d, setIsMode2d] = useState(isSuspendedRef.current);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Mode is now controlled ONLY by transition completion, not Activate/Suspend events
  // This prevents premature UI mode switching that causes component unmounts mid-transition

  const handleComplete = useCallback(
    (isTo2D: boolean) => {
      setIsTransitioning(false);
      setIsMode2d(isTo2D);
      onTransitionEnd?.();
      onComplete?.(isTo2D);
    },
    [onComplete, onTransitionEnd]
  );

  const handleCancel = useCallback(
    (isTo2D: boolean) => {
      setIsTransitioning(false);
      onTransitionEnd?.();
      onCancel?.(isTo2D);
    },
    [onCancel, onTransitionEnd]
  );

  const { transitionToMode2d, transitionToMode3d } = useMapTransition({
    ...(duration !== undefined && { duration }),
    onComplete: handleComplete,
    onCancel: handleCancel,
  });

  const toggleMode = useCallback(async () => {
    console.debug("[MapModeToggle] Toggling mode", { isMode2d });
    setIsTransitioning(true);
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
      setIsTransitioning(false);
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
    isMode2d,
    isTransitioning,
    toggleMode,
  };
};
