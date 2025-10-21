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

export type MapTransitionLifecycle = {
  [MapTransitionState.preTransitionTo2d]?: () => void | Promise<void>;
  [MapTransitionState.preTransitionTo3d]?: () => void | Promise<void>;
};

export interface TransitionTo3dConfig {
  step1_prepare2dView?: {
    maxZoom?: number;
    zoomOutDuration?: number;
    zoomOutEaseLinearity?: number;
    zoomOutTimeoutBuffer?: number;
  };
  step2_cameraAnimation?: {
    duration?: number;
  };
}

export interface TransitionTo2dConfig {
  durationFactorCameraDeviation?: number;
  durationFactorZoomDiff?: number;
  maxDuration?: number;
}

/**
 * Configuration for map transitions between 2D and 3D modes
 */
export interface TransitionConfig {
  /** Settings for 2D → 3D transition */
  modeTo3d?: TransitionTo3dConfig;
  /** Settings for 3D → 2D transition */
  modeTo2d?: TransitionTo2dConfig;
}

export interface TransitionContextType {
  transitionStateRef: MutableRefObject<MapTransitionState>;
  transitionLifecycleRef: MutableRefObject<MapTransitionLifecycle>;
  config: Required<TransitionConfig>;
  subscribe: SubscribeTransitionCtxFn;
  emit: EmitTransitionCtxFn;
}

export const TransitionContext = createContext<TransitionContextType | null>(
  null
);
