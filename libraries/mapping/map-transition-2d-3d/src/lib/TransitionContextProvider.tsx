import { useMemo, useRef, useEffect, type ReactNode } from "react";
import { createEventBus } from "@carma/providers/event-bus";

import {
  TransitionContext,
  MapTransitionState,
  type TransitionContextType,
  type TransitionStageTracker,
  type TransitionConfig,
} from "./TransitionContext";
import type { TransitionContextEventMap } from "./transition-context-event-map";
import { TransitionCtxEvent } from "./transition-context-event-map";

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

  // Watch for transition state changes and emit completion events
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const currentState = transitionStateRef.current;

      // Emit events when entering final states
      if (currentState === MapTransitionState.mode3d) {
        const tracker = transitionStageTrackerRef.current;
        // Check if we just completed a transition (has transition stages)
        if (tracker.step6_cameraAnimation?.endTime) {
          console.debug(
            "[TransitionContextProvider] Emitting TransitionTo3dComplete"
          );
          emit(TransitionCtxEvent.TransitionTo3dComplete, undefined);
          // Clear tracker to avoid re-emitting
          transitionStageTrackerRef.current = {};
        }
      } else if (currentState === MapTransitionState.mode2d) {
        const tracker = transitionStageTrackerRef.current;
        // Check if we just completed a transition (has transition stages)
        if (tracker.step2_cameraTiltAnimation?.endTime) {
          console.debug(
            "[TransitionContextProvider] Emitting TransitionTo2dComplete"
          );
          emit(TransitionCtxEvent.TransitionTo2dComplete, undefined);
          // Clear tracker to avoid re-emitting
          transitionStageTrackerRef.current = {};
        }
      }
    }, 100); // Check every 100ms

    return () => clearInterval(checkInterval);
  }, [emit]);

  // Watch for engine switching events based on transition state changes
  useEffect(() => {
    let lastState = transitionStateRef.current;

    const checkInterval = setInterval(() => {
      const currentState = transitionStateRef.current;

      if (currentState === lastState) {
        return; // No change
      }

      console.debug(
        `[TransitionContextProvider] State change: ${lastState} → ${currentState}`
      );

      // Emit engine switching events when entering transition states
      if (currentState === MapTransitionState.transitionTo3d) {
        console.debug(
          "[TransitionContextProvider] Switching engines: Cesium active, TopicMap suspended"
        );
        emit(TransitionCtxEvent.TransitionTo3dStart, undefined);
      } else if (currentState === MapTransitionState.transitionTo2d) {
        console.debug(
          "[TransitionContextProvider] Switching engines: TopicMap active, Cesium suspended"
        );
        emit(TransitionCtxEvent.TransitionTo2dStart, undefined);
      }

      lastState = currentState;
    }, 50); // Check every 50ms for responsive engine switching

    return () => clearInterval(checkInterval);
  }, [emit]);

  console.debug("[TransitionContextProvider] Rendered", contextValue);

  return (
    <TransitionContext.Provider value={contextValue}>
      {children}
    </TransitionContext.Provider>
  );
};

export default TransitionContextProvider;
