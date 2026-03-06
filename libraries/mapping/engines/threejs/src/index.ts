// @carma-mapping/engines/threejs
// Generic 3D vector layer engine for MapLibre

// Types
export type {
  Carma3dConfig,
  FieldMapping,
  TypeMapEntry,
  MappedFeature,
  ProfileFn,
  FactoryStats,
  ThreePerfData,
} from "./types";

// Profile registry
export { registerProfile, getProfile, hasProfile } from "./profileRegistry";

// Feature mapping
export { mapFeatures, deduplicateFeatures } from "./featureMapper";

// Generic layer builder + sync
export {
  buildGenericLayer,
  syncGenericLayerFromSource,
} from "./GenericThreeLayer";
export type { RebuildFn, GenericCustomLayer } from "./GenericThreeLayer";

// Factories
export { buildLatheInstances } from "./factories/LatheFactory";
export { buildLoftMeshes } from "./factories/LoftFactory";
