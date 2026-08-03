export * from "./lib/utils";
export * from "./lib/contracts/catalog/service-options.d";
export * from "./lib/contracts/feature-info/feature-info.d";
export * from "./lib/contracts/results/results.d";
export { useLeafletZoomControls } from "./lib/hooks/useLeafletZoomControls";
export { useLayerLoading } from "./lib/hooks/useLayerLoading";
export { useLibreZoomControls } from "./lib/hooks/useLibreZoomControls";
export {
  useVisibleMapFeatures,
  DEBUG_BBOX_SOURCE_ID,
  DEBUG_BBOX_LAYER_ID,
} from "./lib/hooks/useVisibleMapFeatures";
export type {
  UseVisibleMapFeaturesOptions,
  UseVisibleMapFeaturesResult,
  MapGeoJSONFeatureWithOriginal,
  MapQueryInsetPx,
} from "./lib/hooks/useVisibleMapFeatures";

// Feature utils (sandboxed eval)
export {
  functionToFeature,
  functionToInfo,
  objectToFeature,
  objectToInfo,
  createFeatureInfoUrl,
  createUrl,
  createVectorFeature,
  getInfoBoxControlObjectFromMappingAndVectorFeature,
  type VectorFeatureInput,
  type VectorFeatureResult,
} from "./lib/featureUtils";
export { parseToMapLayer } from "./lib/layerUtils";
export {
  resolveIconUrl,
  resolveLayerIconUrl,
  mapIconPath,
  twemojiUrl,
  DEFAULT_ICON_PREFIX,
} from "./lib/iconUtils";

// setFeatureState/getFeatureState target builder (geojson-aware)
export { buildFeatureStateTarget } from "./lib/featureStateTarget";
export type { FeatureStateRef } from "./lib/featureStateTarget";

// Stamp feature.sourceLayer from properties._sourceLayer (geojson FCs)
export { stampSourceLayerFromProperty } from "./lib/sourceLayerStamp";

// Extent of the GeoJSON features a MapLibre style ships
export {
  getStyleFeatureBounds,
  getBoundsCenter,
  isPointBounds,
} from "./lib/styleFeatureBounds";
export type { LngLatBounds } from "./lib/styleFeatureBounds";
