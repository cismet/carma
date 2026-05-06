// Camera utilities
export {
  cesiumCameraToCssTransform,
  cssPerspectiveFromCesiumCameraForElement,
  fovToCssPerspectiveByFov,
} from "./cesiumCameraToCssTransform";
export { guardCamera } from "./guardCamera";
export {
  cesiumCameraForceOblique,
  testCameraObliqueCompliant,
  type CameraForceObliqueOptions,
} from "@carma-mapping/engines/cesium/core";

// Scene utilities
export { guardScene } from "./guardScene";
export { guardScreenSpaceCameraController } from "./guardScreenSpaceCameraController";

// Animation utilities
export { getHeadingPitchForMouseEvent } from "@carma-mapping/engines/cesium/core";
export { animateInterpolateHeadingPitchRange } from "./cesiumAnimations";
export { animateOpacity } from "./animateOpacity";
export {
  applyGeometryInstanceOpacity,
  readGeometryInstanceOpacity,
} from "./geometryInstanceOpacity";
export type { GeometryInstanceRef } from "./geometryInstanceOpacity";
export {
  type SceneAnimationMap,
  cancelSceneAnimation,
  initSceneAnimationMap,
} from "@carma-mapping/engines/cesium/core";

export {
  distanceFromZoomLevel,
  getHeadingPitchRangeFromHeight,
  getHeadingPitchRangeFromZoom,
} from "./positions";

// Pickers and pixels
export * from "./pick-position";

// Elevation
export {
  getElevationAsync,
  getSurfaceElevationAsync,
  getTerrainElevationAsync,
  type ElevationResult,
} from "./elevation";
export { guardSampleTerrainMostDetailedAsync } from "./guardSampleTerrainMostDetailedAsync";
export {
  addElevationsToGeoJson,
  geoJsonHasMissingElevations,
  type GeoJsonElevationOptions,
  type GeoJsonElevationResult,
} from "./geojson-elevation";

// Ground primitives
export {
  invertedPolygonHierarchy,
  polygonHierarchyFromPolygonCoords,
  removeGroundPrimitiveById,
} from "./cesiumGroundPrimitives";
export { guardPrimitiveCollection } from "./guardPrimitiveCollection";

// Adhoc primitives
export { createSelectionEdgePrimitive } from "./adhoc-primitives/create-selection-edge-primitive";
export {
  createWallPrimitives,
  type WallPrimitivesResult,
  type WallPrimitiveSegment,
} from "./adhoc-primitives/create-wall-primitives";
export { getBoundingSphereFromCoordinates } from "@carma-mapping/engines/cesium/core";
export {
  getBoundingSphereFromGeoJson,
  getBoundingSphereFromGeoJsonGeometry,
  getCoordinatesFromGeoJson,
  getGeoJsonGeometryCacheKey,
  getCoordinatesFromGeoJsonGeometry,
  getProviderScopedCache,
  getTerrainAwareBoundingSphereFromFeature,
  getTerrainAwareBoundingSphereFromGeoJsonGeometry,
} from "./getBoundingSphereFromGeoJsonGeometry";
export {
  createExtrudedWallVisualizer,
  type ExtrudedWallVisualizer,
  type ExtrudedWallVisualizerOptions,
} from "./createExtrudedWallVisualizer";
export {
  createGroundPolylineVisualizer,
  type GroundPolylineVisualizer,
  type GroundPolylineVisualizerOptions,
} from "./createGroundPolylineVisualizer";
export {
  createGroundPolygonVisualizer,
  type GroundPolygonVisualizer,
  type GroundPolygonVisualizerOptions,
} from "./createGroundPolygonVisualizer";
export {
  createLineVisualizer,
  type LineVisualizer,
  type LineVisualizerOptions,
} from "./createLineVisualizer";
export {
  createRotationAxisVisualizer,
  type RotationAxisVisualizer,
  type RotationAxisVisualizerOptions,
} from "./createRotationAxisVisualizer";
export { createModelPrimitiveFromConfig } from "./createModelPrimitiveFromConfig";
export {
  clampModelSamplingHighlightOpacity,
  createModelSamplingHighlightShader,
  DEFAULT_MODEL_SAMPLING_HIGHLIGHT_FADE_DURATION_MS,
  DEFAULT_MODEL_SAMPLING_HIGHLIGHT_COLOR,
  DEFAULT_MODEL_SAMPLING_HIGHLIGHT_OPACITY,
  setModelSamplingHighlightShaderUniforms,
  type ModelSamplingHighlightShaderUniformOptions,
} from "./modelHighlightShader";
export {
  buildModelKey,
  extractPickedProperties,
  getPrimitiveSelectionId,
  isModelPick,
} from "./modelManager";

// Tileset
export { guardTileset } from "./guardTileset";

// Setup and environment
export { getIsViewerReadyAsync, setupCesiumEnvironment } from "./cesiumSetup";
export {
  getCesiumVersion,
  checkWindowEnv,
  assertWindowCesiumEnv,
} from "@carma-mapping/engines/cesium/core";

// Error handling
export {
  configureCesiumErrorHandling,
  triggerCesiumRenderError,
  triggerCesiumShowErrorPanel,
} from "./cesiumErrorHandling";

// Instance validation gates
export {
  isValidCesiumTerrainProvider,
  isValidEllipsoidTerrainProvider,
  isValidEntity,
  isValidEntityCollection,
  isValidImageryLayer,
  isValidImageryProvider,
  isValidPrimitiveCollection,
  isValidScreenSpaceEventHandler,
  isValidScene,
  isValidTileset,
  isValidViewer,
  withValidViewer,
} from "./instanceGates";

// Scene styles
export * from "./sceneStyles";
