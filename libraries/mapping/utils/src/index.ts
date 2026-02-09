export * from "./lib/utils";
export { useLeafletZoomControls } from "./lib/hooks/useLeafletZoomControls";
export { useLayerLoading } from "./lib/hooks/useLayerLoading";
export { useLibreZoomControls } from "./lib/hooks/useLibreZoomControls";
export { useVisibleMapFeatures } from "./lib/hooks/useVisibleMapFeatures";
export type {
  UseVisibleMapFeaturesOptions,
  UseVisibleMapFeaturesResult,
  VisibleFeature,
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
