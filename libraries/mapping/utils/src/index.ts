export * from "./lib/utils";
export * from "./lib/contracts/catalog/service-options";
export * from "./lib/contracts/feature-info/feature-info";
export * from "./lib/contracts/results/results";
export { useLeafletZoomControls } from "./lib/hooks/useLeafletZoomControls";
export { useLayerLoading } from "./lib/hooks/useLayerLoading";
export { useLibreZoomControls } from "./lib/hooks/useLibreZoomControls";
export { useVisibleMapFeatures } from "./lib/hooks/useVisibleMapFeatures";
export type {
  UseVisibleMapFeaturesOptions,
  UseVisibleMapFeaturesResult,
  MapGeoJSONFeatureWithOriginal,
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
export { resolveLayerIconUrl, twemojiUrl } from "./lib/iconUtils";
