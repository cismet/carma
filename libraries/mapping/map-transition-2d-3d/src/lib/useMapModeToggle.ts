import { useState, useEffect, useCallback } from "react";
import { useCesiumContext, CtxEvent } from "@carma-mapping/engines/cesium";
import { useMapTransition } from "./useMapTransition";

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

  const { subscribe, isSuspendedRef } = useCesiumContext();

  // Track mode based on Cesium suspended state (suspended = 2D mode active)
  const [isMode2d, setIsMode2d] = useState(isSuspendedRef.current);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Subscribe to Cesium context events to track mode
  useEffect(() => {
    const unsubActivate = subscribe(CtxEvent.Activate, () => {
      setIsMode2d(false); // Cesium active = 3D mode
    });
    const unsubSuspend = subscribe(CtxEvent.Suspend, () => {
      setIsMode2d(true); // Cesium suspended = 2D mode
    });
    return () => {
      unsubActivate();
      unsubSuspend();
    };
  }, [subscribe]);

  const handleComplete = useCallback(
    (isTo2D: boolean) => {
      setIsTransitioning(false);
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
