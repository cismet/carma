// Camera utilities
export {
  cesiumCameraToCssTransform,
  cssPerspectiveFromCesiumCameraForElement,
  fovToCssPerspectiveByFov,
} from "./cesiumCameraToCssTransform";
export { guardCamera } from "./guardCamera";

// Scene utilities
export { guardScene } from "./guardScene";
export { sceneHasTweens } from "./sceneHasTweens";
export { guardScreenSpaceCameraController } from "./guardScreenSpaceCameraController";

// Animation utilities
export {
  cesiumAnimateFov,
  type CesiumAnimateFovOptions,
} from "./cesiumAnimateFov";
export { getHeadingPitchForMouseEvent } from "./cesiumAnimateOrbits";
export { animateInterpolateHeadingPitchRange } from "./cesiumAnimations";
export {
  type SceneAnimationMap,
  cancelSceneAnimation,
  initSceneAnimationMap,
} from "./sceneAnimationMap";

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

// Ground primitives
export {
  invertedPolygonHierarchy,
  polygonHierarchyFromPolygonCoords,
  removeGroundPrimitiveById,
} from "./cesiumGroundPrimitives";
export { guardPrimitiveCollection } from "./guardPrimitiveCollection";

// Tileset
export { guardTileset } from "./guardTileset";

// Setup and environment
export { getIsViewerReadyAsync, setupCesiumEnvironment } from "./cesiumSetup";
export {
  getCesiumVersion,
  checkWindowEnv,
  assertWindowCesiumEnv,
} from "./cesiumEnv";

// Error handling
export {
  configureCesiumErrorHandling,
  triggerCesiumRenderError,
  triggerCesiumShowErrorPanel,
} from "./cesiumErrorHandling";

// Hash params codec
export {
  encodeCesiumCamera,
  decodeCesiumCamera,
  cesiumCameraParamKeys,
  cesiumClearParamKeys,
} from "./cesiumHashParamsCodec";

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
