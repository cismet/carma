import { useMemo, useRef, type ReactNode } from "react";
import { createEventBus } from "@carma/providers/event-bus";

import {
  TransitionContext,
  MapTransitionState,
  type TransitionContextType,
  type TransitionStageTracker,
  type TransitionConfig,
} from "./TransitionContext";
import type { TransitionContextEventMap } from "./transition-context-event-map";

const DEFAULT_TRANSITION_CONFIG: Required<TransitionConfig> = {
  modeTo3d: {
    step1_prepare2dView: {
      maxZoom: 20,
      zoomOutDurationMs: 700,
      zoomOutEaseLinearity: 0.75,
      zoomOutTimeoutBufferMs: 100,
    },
    step2_initialRender: {
      timeoutMs: 500,
    },
    step3_waitForResources: {
      timeoutMs: 2000,
    },
    step4_positionCamera: {},
    step5_cssFadeIn: {
      durationMs: 1000,
    },
    step6_cameraAnimation: {
      durationMs: 2000,
    },
  },
  modeTo2d: {
    step1_calculatePosition: {},
    step2_cameraTiltAnimation: {
      durationFactorCameraDeviationMs: 1.5,
      durationFactorZoomDiffMs: 500,
      maxDurationMs: 2000,
    },
    step3_cssFadeOut: {
      durationMs: 1000,
    },
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
  // TODO have stage tracker handle sending events for external use eg css transitions etc
  const transitionStageTrackerRef = useRef<TransitionStageTracker>({});

  const mergedConfig = useMemo<Required<TransitionConfig>>(
    () => ({
      modeTo3d: {
        step1_prepare2dView: {
          ...DEFAULT_TRANSITION_CONFIG.modeTo3d.step1_prepare2dView,
          ...config.modeTo3d?.step1_prepare2dView,
        },
        step2_initialRender: {
          ...DEFAULT_TRANSITION_CONFIG.modeTo3d.step2_initialRender,
          ...config.modeTo3d?.step2_initialRender,
        },
        step3_waitForResources: {
          ...DEFAULT_TRANSITION_CONFIG.modeTo3d.step3_waitForResources,
          ...config.modeTo3d?.step3_waitForResources,
        },
        step4_positionCamera: {
          ...DEFAULT_TRANSITION_CONFIG.modeTo3d.step4_positionCamera,
          ...config.modeTo3d?.step4_positionCamera,
        },
        step5_cssFadeIn: {
          ...DEFAULT_TRANSITION_CONFIG.modeTo3d.step5_cssFadeIn,
          ...config.modeTo3d?.step5_cssFadeIn,
        },
        step6_cameraAnimation: {
          ...DEFAULT_TRANSITION_CONFIG.modeTo3d.step6_cameraAnimation,
          ...config.modeTo3d?.step6_cameraAnimation,
        },
      },
      modeTo2d: {
        step1_calculatePosition: {
          ...DEFAULT_TRANSITION_CONFIG.modeTo2d.step1_calculatePosition,
          ...config.modeTo2d?.step1_calculatePosition,
        },
        step2_cameraTiltAnimation: {
          ...DEFAULT_TRANSITION_CONFIG.modeTo2d.step2_cameraTiltAnimation,
          ...config.modeTo2d?.step2_cameraTiltAnimation,
        },
        step3_cssFadeOut: {
          ...DEFAULT_TRANSITION_CONFIG.modeTo2d.step3_cssFadeOut,
          ...config.modeTo2d?.step3_cssFadeOut,
        },
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
      transitionStageTrackerRef,
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
