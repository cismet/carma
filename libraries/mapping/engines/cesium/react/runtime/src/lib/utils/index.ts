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
export {
  CUSTOM_SHADERS_DEFINITIONS,
  getHeadingPitchForMouseEvent,
} from "@carma-mapping/engines/cesium/core";
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
export {
  getSceneCenter,
  pickFromClampedGeojson,
  pickSceneCenter,
  pickScenePositions,
} from "./pick-position";
export type { PickResult } from "./pick-position/pick-scene-positions";

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
  generateRingFromDegrees,
  generatePositionsForRing,
} from "./geometryGenerators";
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

// Tileset
export { guardTileset } from "./guardTileset";

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
  isValidImageryLayer,
  isValidImageryProvider,
  isValidPrimitiveCollection,
  isValidScreenSpaceEventHandler,
  isValidScene,
  isValidTileset,
  isValidRuntime,
  withValidCesiumWidget,
} from "./instanceGates";

// Scene styles
export { setupPrimaryStyle, setupSecondaryStyle } from "./sceneStyles";
