// @carma-mapping/engines/threejs
// Generic 3D vector layer engine for MapLibre

// Types
export type {
  Carma3dConfig,
  ColorMapping,
  FieldMapping,
  TypeMapEntry,
  MappedFeature,
  ProfileFn,
  FactoryStats,
  ThreePerfData,
} from "./types";

// Profile registry
export {
  registerProfile,
  getProfile,
  hasProfile,
  ensureProfiles,
} from "./profileRegistry";

// Feature mapping
export { mapFeatures, deduplicateFeatures } from "./featureMapper";

// Generic layer builder + sync
export {
  buildGenericLayer,
  buildOverlayLayer,
  syncGenericLayerFromSource,
  resolveOrigin,
} from "./GenericThreeLayer";
export type {
  RebuildFn,
  GenericCustomLayer,
  RaycastDebugResult,
  SourceFeatureData,
} from "./GenericThreeLayer";

// Factories
export { buildLatheInstances } from "./factories/LatheFactory";
export { buildLoftMeshes } from "./factories/LoftFactory";
export {
  buildExtrusionMeshes,
  defaultBuildingColors,
  featureBuildingColors,
  type BuildingColors,
} from "./factories/ExtrusionFactory";
export type { BuildingFeature } from "./factories/ExtrusionFactory";
