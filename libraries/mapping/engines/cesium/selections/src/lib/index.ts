// Component
export { CesiumSelectionMarker } from "./components/CesiumSelectionMarker";
export type {
  CesiumSelectionMarkerProps,
  MarkerConfig,
} from "./components/CesiumSelectionMarker";

// Marker API (for advanced use)
export { addCesiumMarker, removeCesiumMarker } from "./markers/manager";

// Selection handling API
export { cesiumHandleSelection } from "./cesiumHandleSelection";
export { cesiumHitTrigger } from "./cesiumHitTrigger";

// Types from selection handlers
export type {
  HitTriggerOptions,
  DerivedGeometries,
} from "./cesiumHandleSelection";

// Types
export type {
  MarkerPrimitiveData,
  MarkerModelAsset,
  PolylineConfig,
  MarkerOptions,
  ParsedMarkerModelAsset,
} from "./markers/types";
