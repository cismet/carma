// Reference React hook for map transitions (framework-agnostic, no Redux/TopicMap deps)
export {
  TransitionStage,
  DEFAULT_TRANSITION_OPTIONS,
  type TransitionOptions,
  type TransitionToCesiumOptions,
  type TransitionToLeafletOptions,
} from "./lib/leaflet-cesium/types";
export { transitionToCesium } from "./lib/leaflet-cesium/transition-to-cesium";
export { transitionToLeaflet } from "./lib/leaflet-cesium/transition-to-leaflet";

export {
  calculateDistanceFromZoom,
  calculateZoomFromDistance,
  createZoomDistanceConverter,
  type ZoomDistanceConverter,
} from "./lib/leaflet-cesium/zoom-distance-converter";
