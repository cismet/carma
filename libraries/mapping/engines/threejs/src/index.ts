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
// 3D Tiles
export {
  buildTiles3dLayer,
  DEFAULT_ERROR_TARGET_PIXELS,
} from "./tiles3d/Tiles3dLayer";
export type {
  Tiles3dCustomLayer,
  Tiles3dLayerOptions,
} from "./tiles3d/Tiles3dLayer";
export {
  GLTFPrimitiveOutlineExtension,
  TILE_OUTLINE_FLAG,
} from "./tiles3d/primitiveOutline";
export { RetryFetchPlugin } from "./tiles3d/retryFetch";
export type { RetryFetchPluginOptions } from "./tiles3d/retryFetch";
export { synthesizeLodCamera } from "./tiles3d/lodCamera";
export type { LodCameraFrame } from "./tiles3d/lodCamera";

export { buildLod2Meshes } from "./factories/Lod2Factory";
export type { Lod2Building, Lod2RoofFace } from "./factories/Lod2Factory";
export {
  buildExtrusionMeshes,
  DEFAULT_BUILDING_OPACITY,
  defaultBuildingColors,
  featureBuildingColors,
  type BuildingColors,
  type BuildingColorSource,
} from "./factories/ExtrusionFactory";
export type { BuildingFeature } from "./factories/ExtrusionFactory";
