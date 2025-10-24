import { useState, useCallback, useEffect } from "react";
import { useCesiumContext } from "@carma-mapping/engines/cesium/core";
import { useMapTransition } from "./use-map-transition";
import { useTransitionContext } from "./use-transition-context";
import { isTransitioningState } from "./TransitionContext";
import { TransitionCtxEvent } from "./transition-context-event-map";

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
 * @returns isTransitioning - Whether a transition is in progress (derived from TransitionContext state)
 * @returns toggleMode - Function to trigger mode transition
 */
export const useMapModeToggle = (options: MapModeToggleOptions = {}) => {
  const { duration, onComplete, onCancel, onTransitionStart, onTransitionEnd } =
    options;

  const { isSuspendedRef } = useCesiumContext();
  const { transitionStateRef, subscribe } = useTransitionContext();

  // Track mode based on Cesium suspended state (suspended = 2D mode active)
  const [isMode2d, setIsMode2d] = useState(isSuspendedRef.current);

  // Track transition state reactively by subscribing to state changes
  const [isTransitioning, setIsTransitioning] = useState(
    isTransitioningState(transitionStateRef.current)
  );

  // Subscribe to transition events to keep isTransitioning reactive
  useEffect(() => {
    const updateState = () => {
      setIsTransitioning(isTransitioningState(transitionStateRef.current));
    };

    const unsubscribe3dStart = subscribe(
      TransitionCtxEvent.TransitionTo3dStart,
      updateState
    );
    const unsubscribe3dComplete = subscribe(
      TransitionCtxEvent.TransitionTo3dComplete,
      updateState
    );
    const unsubscribe2dStart = subscribe(
      TransitionCtxEvent.TransitionTo2dStart,
      updateState
    );
    const unsubscribe2dComplete = subscribe(
      TransitionCtxEvent.TransitionTo2dComplete,
      updateState
    );
    const unsubscribeCancelled = subscribe(
      TransitionCtxEvent.TransitionCancelled,
      updateState
    );

    return () => {
      unsubscribe3dStart();
      unsubscribe3dComplete();
      unsubscribe2dStart();
      unsubscribe2dComplete();
      unsubscribeCancelled();
    };
  }, [subscribe, transitionStateRef]);

  // Mode is now controlled ONLY by transition completion, not Activate/Suspend events
  // This prevents premature UI mode switching that causes component unmounts mid-transition

  const handleComplete = useCallback(
    (isTo2D: boolean) => {
      // isTransitioning now derived from context state - no local state to update
      setIsMode2d(isTo2D);
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
    isMode2d,
    isTransitioning,
    toggleMode,
  };
};
