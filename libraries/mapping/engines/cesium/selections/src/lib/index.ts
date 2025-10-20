// Component
export { CesiumSelectionMarker } from "./components/CesiumSelectionMarker";
export type {
  CesiumSelectionMarkerProps,
  MarkerConfig,
} from "./components/CesiumSelectionMarker";

// Marker API (for advanced use)
export { addCesiumMarker, removeCesiumMarker } from "./markers/manager";

// Types
export type {
  MarkerPrimitiveData,
  MarkerModelAsset,
  PolylineConfig,
  MarkerOptions,
  ParsedMarkerModelAsset,
} from "./markers/types";
