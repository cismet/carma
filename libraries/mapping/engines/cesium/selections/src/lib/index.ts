// Component
export { CesiumSelectionMarker } from "./components/CesiumSelectionMarker";
export type {
  CesiumSelectionMarkerProps,
  MarkerConfig,
} from "./components/CesiumSelectionMarker";

// Marker API (for advanced use)
export { addCesiumMarker, removeCesiumMarker } from "./markers/manager";

// Polygon selection API (moved from portals)
export {
  cesiumHandleSelection,
  createFootprintPrimitive,
} from "./polygon-selection";

export type {
  HitTriggerOptions,
  MarkerModelAsset,
  DerivedGeometries,
} from "./polygon-selection";

// Types
export type {
  MarkerPrimitiveData,
  MarkerModelAsset,
  PolylineConfig,
  MarkerOptions,
  ParsedMarkerModelAsset,
} from "./markers/types";
