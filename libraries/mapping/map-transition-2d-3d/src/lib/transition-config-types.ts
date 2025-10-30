/**
 * Transition config with order indicated by property names
 */
export interface TransitionTo3dConfig {
  step1_prepare2dViewMaxZoom?: number;
  step1_zoomOutDurationMs?: number;
  step2_initialRenderTimeoutMs?: number;
  step3_resourceWaitTimeoutMs?: number;
  step4_fallbackGroundElevationM?: number;
  step5_cssFadeInDurationMs?: number;
  step6_cameraAnimationDurationMs?: number;
}

export interface TransitionTo2dConfig {
  step2_cameraTiltDurationFactorDeviationMs?: number;
  step2_cameraTiltDurationFactorZoomMs?: number;
  step2_cameraTiltMaxDurationMs?: number;
  step3_cssFadeOutDurationMs?: number;
}

export interface TransitionConfig {
  modeTo3d?: TransitionTo3dConfig;
  modeTo2d?: TransitionTo2dConfig;
}
