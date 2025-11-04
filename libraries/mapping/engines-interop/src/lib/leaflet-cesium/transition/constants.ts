import type { TransitionOptions } from './types';



export enum TransitionDirection {
  UNSET = 0,
  TO_CESIUM = 1,
  TO_LEAFLET = 2,
}
export enum TransitionState {
  UNSET = 0,
  IS_CESIUM = 1,
  IS_LEAFLET = 2,
  TO_CESIUM = 3,
  TO_LEAFLET = 4,
}

export enum ToCesiumStages {
  UNSET = 0,
  VALIDATE_REQUIREMENTS = 1,
  PREPOSITION_CESIUM = 2, // allow for tile loading
  PREPARE_2D_VIEW = 2,
  SYNC_VIEW_CESIUM = 3, // sync effective pixel resolutions
  VALIDATE_CESIUM_PRESENTABLE = 4, // (optional) min tiles loaded cont for tilesets 
  CSS_REVEAL_CESIUM_CONTAINER = 5,
  ANIMATE_CESIUM_CAMERA = 6, // optional
};


export const noop = () => {};

export const noAnimation = {
  animate: false,
  duration: 0,
} as const;

export const defaultTransitionOptions: Required<TransitionOptions> = {
  step1_prepare2dViewMaxZoom: 20,
  step1_zoomOutDurationMs: 700,
  step1_zoomOutEaseLinearity: 0.75,
  step2_initialRenderTimeoutMs: 100,
  step3_resourceWaitTimeoutMs: 100,
  step6_cameraAnimationDurationMs: 1000,
  // For 2D transition
  step1_cameraAnimationDurationMs: 1000,
};
