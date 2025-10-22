import { createContext, type MutableRefObject } from "react";
import type {
  SubscribeTransitionCtxFn,
  EmitTransitionCtxFn,
} from "./transition-context-event-map";

export enum MapTransitionState {
  mode2d = "mode2d",
  mode3d = "mode3d",
  preTransitionTo2d = "preTransitionTo2d",
  transitionTo2d = "transitionTo2d",
  postTransitionTo2d = "postTransitionTo2d",
  preTransitionTo3d = "preTransitionTo3d",
  transitionTo3d = "transitionTo3d",
  postTransitionTo3d = "postTransitionTo3d",
}

/**
 * Stage tracking for transition progress
 * Records which steps have been completed during a transition
 */
export type TransitionStageTracker = {
  // To3D transition stages
  step1_prepare2dView?: { startTime: number; endTime?: number; error?: Error };
  step2_initialRender?: { startTime: number; endTime?: number; error?: Error };
  step3_waitForResources?: {
    startTime: number;
    endTime?: number;
    error?: Error;
  };
  step4_positionCamera?: { startTime: number; endTime?: number; error?: Error };
  step5_cssFadeIn?: { startTime: number; endTime?: number; error?: Error };
  step6_cameraAnimation?: {
    startTime: number;
    endTime?: number;
    error?: Error;
  };
  // To2D transition stages
  step1_calculatePosition?: {
    startTime: number;
    endTime?: number;
    error?: Error;
  };
  step2_cameraTiltAnimation?: {
    startTime: number;
    endTime?: number;
    error?: Error;
  };
  step3_cssFadeOut?: { startTime: number; endTime?: number; error?: Error };
};

export interface TransitionTo3dConfig {
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
