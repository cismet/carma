/**
 * Transition stages for tracking progress during 2D↔3D transitions
 */
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

/**
 * Transition direction enum (used as values)
 */
export enum TransitionDirection {
  UNSET = 0,
  TO_CESIUM = 1,
  TO_LEAFLET = 2,
}

/**
 * Transition state enum (used as values)
 */
export enum TransitionState {
  UNSET = 0,
  IS_CESIUM = 1,
  IS_LEAFLET = 2,
  TO_CESIUM = 3,
  TO_LEAFLET = 4,
}

/**
 * Cesium transition stages enum (used as values)
 */
export enum ToCesiumStages {
  UNSET = 0,
  VALIDATE_REQUIREMENTS = 1,
  PREPOSITION_CESIUM = 2,
  PREPARE_2D_VIEW = 2,
  SYNC_VIEW_CESIUM = 3,
  VALIDATE_CESIUM_PRESENTABLE = 4,
  CSS_REVEAL_CESIUM_CONTAINER = 5,
  ANIMATE_CESIUM_CAMERA = 6,
}

/**
 * Options for transition to Cesium (2D → 3D)
 */
export type TransitionToCesiumOptions = {
  step1_prepare2dViewMaxZoom?: number;
  step1_zoomOutDurationMs?: number;
  step1_zoomOutEaseLinearity?: number;
  step2_initialRenderTimeoutMs?: number;
  step3_resourceWaitTimeoutMs?: number;
  step6_cameraAnimationDurationMs?: number;
};

/**
 * Options for transition to Leaflet (3D → 2D)
 */
export type TransitionToLeafletOptions = {
  step1_cameraAnimationDurationMs?: number;
};

/**
 * Combined transition options
 */
export type TransitionOptions = {
  toCesium?: TransitionToCesiumOptions;
  toLeaflet?: TransitionToLeafletOptions;
};

/**
 * Default values for all transition options
 */
export const DEFAULT_TRANSITION_OPTIONS = {
  toCesium: {
    step1_prepare2dViewMaxZoom: 20,
    step1_zoomOutDurationMs: 700,
    step1_zoomOutEaseLinearity: 0.75,
    step2_initialRenderTimeoutMs: 100,
    step3_resourceWaitTimeoutMs: 100,
    step6_cameraAnimationDurationMs: 1000,
  },
  toLeaflet: {
    step1_cameraAnimationDurationMs: 1000,
  },
} as const satisfies Required<TransitionOptions>;
