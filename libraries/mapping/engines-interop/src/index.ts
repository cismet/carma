// Reference React hook for map transitions (framework-agnostic, no Redux/TopicMap deps)
export {
  TransitionDirection,
  TransitionState,
  ToCesiumStages,
  TransitionStage,
  DEFAULT_TRANSITION_OPTIONS,
  type TransitionOptions,
  type TransitionToCesiumOptions,
  type TransitionToLeafletOptions,
} from "./lib/leaflet-cesium/types";
export { transitionToCesium } from "./lib/leaflet-cesium/transition-to-cesium";
export { transitionToLeaflet } from "./lib/leaflet-cesium/transition-to-leaflet";

// Utility functions for camera distance calculations
export { calculateCameraDistance } from "./lib/leaflet-cesium/utils/cesium/camera-distance";
