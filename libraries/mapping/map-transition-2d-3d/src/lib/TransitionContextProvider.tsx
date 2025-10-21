import { useMemo, useRef, type ReactNode } from "react";
import { createEventBus } from "@carma/providers/event-bus";

import {
  TransitionContext,
  MapTransitionState,
  type TransitionContextType,
  type TransitionConfig,
} from "./TransitionContext";
import type { TransitionContextEventMap } from "./transition-context-event-map";

const DEFAULT_TRANSITION_CONFIG: Required<TransitionConfig> = {
  modeTo3d: {
    step1_prepare2dView: {
      maxZoom: 20,
      zoomOutDuration: 700,
      zoomOutEaseLinearity: 0.75,
      zoomOutTimeoutBuffer: 100,
    },
    step2_cameraAnimation: {
      duration: 1000,
    },
  },
  modeTo2d: {
    durationFactorCameraDeviation: 2,
    durationFactorZoomDiff: 1,
    maxDuration: 5,
  },
};

export interface TransitionContextProviderProps {
  children: ReactNode;
  config?: TransitionConfig;
}

/**
 * Provides transition coordination context for 2D/3D map transitions.
 * Manages transition state and emits/subscribes to transition events.
 *
 * NOTE: CesiumContext also exposes transitionStateRef and transitionLifecycleRef.
 * This is intentional to avoid circular dependencies:
 * - TransitionContext (here) is the source of truth for transition logic
 * - CesiumContext exposes refs for Cesium-specific hooks
 * - useMapTransition synchronizes between both contexts
 *
 * See CesiumContextProvider for detailed explanation.
 */
export const TransitionContextProvider = ({
  children,
  config = {},
}: TransitionContextProviderProps) => {
  const transitionStateRef = useRef<MapTransitionState>(
    MapTransitionState.mode2d
  );
  const transitionLifecycleRef = useRef({});

  const mergedConfig = useMemo<Required<TransitionConfig>>(
    () => ({
      modeTo3d: {
        step1_prepare2dView: {
          ...DEFAULT_TRANSITION_CONFIG.modeTo3d.step1_prepare2dView,
          ...config.modeTo3d?.step1_prepare2dView,
        },
        step2_cameraAnimation: {
          ...DEFAULT_TRANSITION_CONFIG.modeTo3d.step2_cameraAnimation,
          ...config.modeTo3d?.step2_cameraAnimation,
        },
      },
      modeTo2d: {
        ...DEFAULT_TRANSITION_CONFIG.modeTo2d,
        ...config.modeTo2d,
      },
    }),
    [config]
  );

  // Event bus for the Transition context
  const { subscribe, emit } = useMemo(
    () => createEventBus<TransitionContextEventMap>(),
    []
  );

  const contextValue = useMemo<TransitionContextType>(
    () => ({
      transitionStateRef,
      transitionLifecycleRef,
      config: mergedConfig,
      subscribe,
      emit,
    }),
    [mergedConfig, subscribe, emit]
  );

  console.debug("[TransitionContextProvider] Rendered", contextValue);

  return (
    <TransitionContext.Provider value={contextValue}>
      {children}
    </TransitionContext.Provider>
  );
};

export default TransitionContextProvider;
