export {
  CarmaTopicMapContextProvider,
  type CarmaTopicMapContextProviderProps,
} from "./lib/CarmaTopicMapContextProvider";
export {
  CarmaTopicMapContext,
  type CarmaTopicMapContextType,
} from "./lib/CarmaTopicMapContext";
export {
  useCarmaTopicMapContext,
  type CombinedTopicMapContextType,
} from "./lib/useCarmaTopicMapContext";
export { useTopicMapSuspended } from "./lib/useTopicMapSuspended";
export {
  type RoutedMapBoundingBox,
  routedMapBBoxToTurfBBox,
  turfBBoxToRoutedMapBBox,
  // Legacy deprecated functions (backwards compatibility only)
  latLngBoundsToProjectedBBox,
  getBoundingBoxForLeafletMap,
} from "./lib/types";
