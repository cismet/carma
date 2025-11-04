/**
 * Transition stages for tracking progress during 2D↔3D transitions
 */
export enum TransitionStage {
  IDLE = 'IDLE',
  PREPARE_2D = 'PREPARE_2D',
  ZOOM_OUT = 'ZOOM_OUT',
  POSITION_3D_CAMERA = 'POSITION_3D_CAMERA',
  WAIT_RESOURCES = 'WAIT_RESOURCES',
  FADE_IN_3D = 'FADE_IN_3D',
  ANIMATE_CAMERA = 'ANIMATE_CAMERA',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR',
}

export type TransitionToCesiumOptions = {
  step1_prepare2dViewMaxZoom?: number;
  step1_zoomOutDurationMs?: number;
  step1_zoomOutEaseLinearity?: number;
  step2_initialRenderTimeoutMs?: number;
  step3_resourceWaitTimeoutMs?: number;
  step6_cameraAnimationDurationMs?: number;
};

export type TransitionToLeafletOptions = {
  step1_cameraAnimationDurationMs?: number;
};

export type TransitionOptions = {
  toCesium: TransitionToCesiumOptions;
  toLeaflet: TransitionToLeafletOptions;
};
