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
} from "./lib/leaflet-cesium/transition/types";
export { transitionToCesium } from "./lib/leaflet-cesium/transition/transition-to-cesium";
export { 
  transitionToLeaflet,
  type TransitionToLeafletResult,
} from "./lib/leaflet-cesium/transition/transition-to-leaflet";