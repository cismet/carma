// @carma-mapping/core
// High-level CarmaMap component and types

export const CORE_VERSION = "0.0.1";

// Components
export { CarmaMap } from "./components/CarmaMap";
export { FeatureDataView } from "./components/FeatureDataView";
export type { FeatureDataViewProps } from "./components/FeatureDataView";
export { DatasheetLayout } from "./components/DatasheetLayout";
export type { DatasheetLayoutProps } from "./components/DatasheetLayout";

// Re-export types from maplibre engine for convenience
export type { VectorStyle, LibreLayer } from "@carma-mapping/engines/maplibre";

// Hooks
export {
  useDynamicStyling,
  type UseDynamicStylingProps,
  type UseDynamicStylingResult,
} from "./hooks/useDynamicStyling";
export {
  useDynamicVectorLayer,
  type UseDynamicVectorLayerProps,
  type UseDynamicVectorLayerResult,
} from "./hooks/useDynamicVectorLayer";
export {
  useDynamicCismapLayer,
  type UseDynamicCismapLayerProps,
  type UseDynamicCismapLayerResult,
  type CismapVectorLayerProps,
} from "./hooks/useDynamicCismapLayer";
