// Bring in ambient Window globals for consumers of this package
import "./types/env";

export type {
  CameraPositionAndOrientation,
  CesiumOptions,
  TerrainProviderConfig,
  SceneStyle,
  SceneStyles,
  CesiumConfig,
  CesiumState,
  RootState,
  SceneStateDescription,
  AppState,
} from "./index.d";
export type {
  MarkerData,
  Marker3dData,
  MarkerPrimitiveData,
  MarkerModelAsset,
  ParsedMarkerModelAsset,
  PolylineConfig,
  MarkerOptions,
} from "./extensions/markers";

export {
  CESIUM_RUNTIME_TRANSITION_STATE,
  cesiumReducer,
  clearIsAnimating,
  clearTransition,
  getCesiumConfig,
  selectCesiumRuntimeCurrentTransition,
  selectCesiumRuntimeIsAnimating,
  selectCesiumRuntimeIsTransitioning,
  selectCesiumRuntimeModels,
  selectCurrentSceneStyle,
  selectSceneStylePrimary,
  selectSceneStyleSecondary,
  selectSceneStyles,
  selectScreenSpaceCameraControllerEnableCollisionDetection,
  selectScreenSpaceCameraControllerMaximumZoomDistance,
  selectScreenSpaceCameraControllerMinimumZoomDistance,
  selectShowPrimaryTileset,
  selectShowSecondaryTileset,
  selectTilesetOpacity,
  setCurrentSceneStyle,
  setIsAnimating,
  setScreenSpaceCameraControllerEnableCollisionDetection,
  setScreenSpaceCameraControllerMaximumZoomDistance,
  setScreenSpaceCameraControllerMinimumZoomDistance,
  setShowPrimaryTileset,
  setShowSecondaryTileset,
  setTilesetOpacity,
  setTransitionTo2d,
  setTransitionTo3d,
  toggleCurrentSceneStyle,
  toggleIsAnimating,
} from "./slices/cesium";

export {
  CesiumContext,
  type CesiumContextType,
  type CesiumRuntime,
} from "./CesiumContext";
export { CesiumContextProvider } from "./CesiumContextProvider";
export {
  CesiumErrorHandler as CesiumErrorHandling,
  type ForwardedCesiumError,
} from "./CesiumErrorHandler";

export {
  CesiumHost,
  type CesiumHostState,
  type CesiumHostProps,
  type InitialCameraView,
} from "./CesiumHost";
export type {
  CameraLimiterConfig,
  CameraLimiterOptions,
  CameraLimiterReenableTransitionOptions,
  CameraLimiterTransitionsOptions,
  CameraPitchLimiterOptions,
} from "./camera-limiter-options";
export {
  DEFAULT_WIDGET_CONSTRUCTOR_OPTIONS,
  type CesiumWidgetConstructorOptions,
} from "./cesiumWidgetDefaults";

export { Compass } from "./components/controls/Compass";
export { PitchingCompass } from "./components/controls/PitchingCompass";
export { SceneStyleToggle } from "./components/controls/SceneStyleToggle";

export {
  useCesiumContext,
  useCesiumContextOptional,
} from "./hooks/useCesiumContext";
export { useGeometryInstanceOpacityAnimation } from "./hooks/useGeometryInstanceOpacityAnimation";
export { useSceneStyles } from "./hooks/useSceneStyles";
export { useZoomControls } from "./hooks/useZoomControls";
export {
  useCesiumCameraLimiterToggle,
  type UseCesiumCameraLimiterToggleOptions,
} from "./hooks/useCesiumCameraLimiterToggle";

export { CESIUM_RUNTIME_STATE_KEYS } from "./runtime-state-keys";

// Hooks for app integration
export { useReloadOnCesiumRenderError } from "./hooks/useReloadOnCesiumRenderError";

// Marker utilities
export { addCesiumMarker, removeCesiumMarker } from "./extensions/markers";

export {
  addElevationsToGeoJson,
  animateInterpolateHeadingPitchRange,
  animateOpacity,
  applyGeometryInstanceOpacity,
  assertWindowCesiumEnv,
  cancelSceneAnimation,
  cesiumCameraForceOblique,
  cesiumCameraToCssTransform,
  checkWindowEnv,
  configureCesiumErrorHandling,
  CUSTOM_SHADERS_DEFINITIONS,
  createExtrudedWallVisualizer,
  createGroundPolygonVisualizer,
  createGroundPolylineVisualizer,
  createLineVisualizer,
  createRotationAxisVisualizer,
  createSelectionEdgePrimitive,
  createWallPrimitives,
  cssPerspectiveFromCesiumCameraForElement,
  distanceFromZoomLevel,
  fovToCssPerspectiveByFov,
  geoJsonHasMissingElevations,
  getBoundingSphereFromCoordinates,
  getBoundingSphereFromGeoJson,
  getBoundingSphereFromGeoJsonGeometry,
  getCesiumVersion,
  getCoordinatesFromGeoJson,
  getCoordinatesFromGeoJsonGeometry,
  getElevationAsync,
  getGeoJsonGeometryCacheKey,
  getHeadingPitchForMouseEvent,
  getHeadingPitchRangeFromHeight,
  getHeadingPitchRangeFromZoom,
  generatePositionsForRing,
  generateRingFromDegrees,
  getProviderScopedCache,
  getSceneCenter,
  getSurfaceElevationAsync,
  getTerrainAwareBoundingSphereFromFeature,
  getTerrainAwareBoundingSphereFromGeoJsonGeometry,
  getTerrainElevationAsync,
  guardCamera,
  guardPrimitiveCollection,
  guardSampleTerrainMostDetailedAsync,
  guardScene,
  guardScreenSpaceCameraController,
  guardTileset,
  initSceneAnimationMap,
  invertedPolygonHierarchy,
  isValidCesiumTerrainProvider,
  isValidEllipsoidTerrainProvider,
  isValidImageryLayer,
  isValidImageryProvider,
  isValidPrimitiveCollection,
  isValidRuntime,
  isValidScene,
  isValidScreenSpaceEventHandler,
  isValidTileset,
  pickFromClampedGeojson,
  pickSceneCenter,
  pickScenePositions,
  polygonHierarchyFromPolygonCoords,
  readGeometryInstanceOpacity,
  removeGroundPrimitiveById,
  setupPrimaryStyle,
  setupSecondaryStyle,
  testCameraObliqueCompliant,
  triggerCesiumRenderError,
  triggerCesiumShowErrorPanel,
  withValidCesiumWidget,
  type CameraForceObliqueOptions,
  type ElevationResult,
  type ExtrudedWallVisualizer,
  type ExtrudedWallVisualizerOptions,
  type GeoJsonElevationOptions,
  type GeoJsonElevationResult,
  type GeometryInstanceRef,
  type GroundPolygonVisualizer,
  type GroundPolygonVisualizerOptions,
  type GroundPolylineVisualizer,
  type GroundPolylineVisualizerOptions,
  type LineVisualizer,
  type LineVisualizerOptions,
  type PickResult,
  type RotationAxisVisualizer,
  type RotationAxisVisualizerOptions,
  type SceneAnimationMap,
  type WallPrimitiveSegment,
  type WallPrimitivesResult,
} from "./utils";
