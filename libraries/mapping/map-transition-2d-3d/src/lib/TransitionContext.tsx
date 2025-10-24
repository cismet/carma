import { createContext, type MutableRefObject } from "react";
import type {
  SubscribeTransitionCtxFn,
  EmitTransitionCtxFn,
} from "./transition-context-event-map";

/**
 * Unified transition state that tracks both stable modes and specific transition stages.
 * State names directly correspond to the actual stage being executed.
 *
 * Benefits of unification:
 * - Single source of truth for current transition phase
 * - State enum values match stage names used in code
 * - Easy to determine if transitioning: state !== mode2d && state !== mode3d
 * - Timing metadata (TransitionStageTracker) uses same keys
 */
export enum MapTransitionState {
  // Stable states (not transitioning)
  mode2d = "mode2d",
  mode3d = "mode3d",

  // To3D transition stages (fine-grained, matches actual execution steps)
  to3d_step1_prepare2dView = "to3d_step1_prepare2dView",
  to3d_step2_initialRender = "to3d_step2_initialRender",
  to3d_step3_waitForResources = "to3d_step3_waitForResources",
  to3d_step4_positionCamera = "to3d_step4_positionCamera",
  to3d_step5_cssFadeIn = "to3d_step5_cssFadeIn",
  to3d_step6_cameraAnimation = "to3d_step6_cameraAnimation",

  // To2D transition stages (fine-grained, matches actual execution steps)
  to2d_step1_calculatePosition = "to2d_step1_calculatePosition",
  to2d_step2_cameraTiltAnimation = "to2d_step2_cameraTiltAnimation",
  to2d_step3_cssFadeOut = "to2d_step3_cssFadeOut",
}

/**
 * Helper to check if currently in a transition state (not in stable mode)
 */
export const isTransitioningState = (state: MapTransitionState): boolean => {
  return (
    state !== MapTransitionState.mode2d && state !== MapTransitionState.mode3d
  );
};

/**
 * Timing metadata for a single transition stage.
 * Tracks when stage started, ended, and if it encountered errors.
 */
export type TransitionStageMetadata = {
  startTime: number;
  endTime?: number;
  error?: Error;
};

/**
 * Stage tracker maps state enum values to timing metadata.
 * Only contains entries for stages that have been executed.
 *
 * Example:
 * {
 *   [MapTransitionState.to3d_step1_prepare2dView]: { startTime: 1234, endTime: 1456 },
 *   [MapTransitionState.to3d_step2_initialRender]: { startTime: 1456 },
 * }
 */
export type TransitionStageTracker = Partial<
  Record<MapTransitionState, TransitionStageMetadata>
>;

export interface TransitionTo3dConfig {
  /**
   * Fallback ground elevation in meters when terrain provider not available.
   * Default: 10000m (conservative global value)
   * Regional examples:
   * - Wuppertal: 400m (max elevation ~400m)
   * - Flat regions: Lower values for better initial view
   */
  fallbackGroundElevationM?: number;

  step1_prepare2dView?: {
    maxZoom?: number;
    zoomOutDurationMs?: number;
    zoomOutEaseLinearity?: number;
    zoomOutTimeoutBufferMs?: number;
  };
  step2_initialRender?: {
    timeoutMs?: number;
  };
  step3_waitForResources?: {
    timeoutMs?: number;
  };
  step4_positionCamera?: {
    /** Camera positioning is synchronous, no duration needed */
  };
  step5_cssFadeIn?: {
    durationMs?: number;
  };
  step6_cameraAnimation?: {
    durationMs?: number;
  };
}

export interface TransitionTo2dConfig {
  step1_calculatePosition?: {
    /** No timing config needed for synchronous calculations */
  };
  step2_cameraTiltAnimation?: {
    durationFactorCameraDeviationMs?: number;
    durationFactorZoomDiffMs?: number;
    maxDurationMs?: number;
  };
  step3_cssFadeOut?: {
    durationMs?: number;
  };
}

/**
 * Configuration for map transitions between 2D and 3D modes
 */
export interface TransitionConfig {
  modeTo3d?: TransitionTo3dConfig;
  modeTo2d?: TransitionTo2dConfig;
}

export interface TransitionContextType {
  transitionStateRef: MutableRefObject<MapTransitionState>;
  transitionStageTrackerRef: MutableRefObject<TransitionStageTracker>;
  config: Required<TransitionConfig>;
  subscribe: SubscribeTransitionCtxFn;
  emit: EmitTransitionCtxFn;
}

export const TransitionContext = createContext<TransitionContextType | null>(
  null
);
