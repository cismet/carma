import type { Degrees } from "@carma/units/types";
import type { Altitude } from "@carma/geo/types";

export enum TransitionStage {
  IDLE = "IDLE",
  PREPARE_2D = "PREPARE_2D",
  ZOOM_OUT = "ZOOM_OUT",
  POSITION_3D_CAMERA = "POSITION_3D_CAMERA",
  WAIT_RESOURCES = "WAIT_RESOURCES",
  FADE_IN_3D = "FADE_IN_3D",
  ANIMATE_CAMERA = "ANIMATE_CAMERA",
  COMPLETE = "COMPLETE",
  ERROR = "ERROR",
}

export type TransitionCallbacks = {
  onStageChange: (stage: TransitionStage, message: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
};

export type TransitionToLeafletCallbacks = TransitionCallbacks & {
  onLeafletViewSet?: (params: {
    center: { lat: number; lng: number };
    zoom: number;
  }) => void;
};

export type TransitionToCesiumOptions = {
  step1_prepare2dViewMaxZoom?: number;
  step1_zoomOutDurationMs?: number;
  step1_zoomOutEaseLinearity?: number;
  step2_initialRenderTimeoutMs?: number;
  step3_resourceWaitTimeoutMs?: number;
  step4_cssTransitionDurationMs?: number;
  step5_postCssDelayMs?: number;
  step6_cameraAnimationDurationMs?: number;
  defaultHeading?: Degrees;
  defaultPitch?: Degrees;
};

export type TransitionToLeafletOptions = {
  step1_cameraAnimationDurationMs?: number;
  step2_cssTransitionDurationMs?: number;
  groundHeightFallback?: Altitude.EllipsoidalWGS84Meters;
  /** Threshold for zoom snap rounding (0-1), default 0.75. Values below threshold round down, above round up. */
  zoomSnapThreshold?: number;
};

export type TransitionOptions = {
  toCesium?: TransitionToCesiumOptions;
  toLeaflet?: TransitionToLeafletOptions;
};

export const DEFAULT_TRANSITION_OPTIONS = {
  toCesium: {
    step1_prepare2dViewMaxZoom: 20,
    step1_zoomOutDurationMs: 700,
    step1_zoomOutEaseLinearity: 0.75,
    step2_initialRenderTimeoutMs: 100,
    step3_resourceWaitTimeoutMs: 100,
    step4_cssTransitionDurationMs: 1000,
    step6_cameraAnimationDurationMs: 1000,
    defaultHeading: 0 as Degrees,
    defaultPitch: -45 as Degrees,
  },
  toLeaflet: {
    step1_cameraAnimationDurationMs: 1000,
    step2_cssTransitionDurationMs: 1000,
  },
} as const satisfies Required<TransitionOptions>;
