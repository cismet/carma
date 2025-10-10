// Bring in ambient Window globals for consumers of this package
import "./lib/types/env";

// @deprecated - Redux slice removed. Use CesiumContext instead.
// export * from "./lib/slices/cesium";

export {
  type CesiumContextType,
  CesiumContextProvider,
} from "./lib/providers/cesiumContext";

export { CustomCesiumWidget } from "./lib/CustomCesiumWidget";
export {
  CesiumErrorHandler as CesiumErrorHandling,
  type ForwardedCesiumError,
} from "./lib/CesiumErrorHandler";

export {
  CustomViewer,
  type InitialCameraView,
  type CameraLimiterOptions,
} from "./lib/CustomViewer";
export {
  DEFAULT_VIEWER_CONSTRUCTOR_OPTIONS,
  TRANSITION_DELAY,
} from "./lib/viewerDefaults";

export { ByGeojsonClassifier } from "./lib/components/ByGeojsonClassifier";
export { ByTilesetClassifier } from "./lib/components/ByTilesetClassifier";

export { Compass } from "./lib/components/controls/Compass";
export { HomeControl } from "./lib/components/controls/HomeControl";
export { SceneStyleToggle } from "./lib/components/controls/SceneStyleToggle";

export {
  useCesiumContext,
  useCesiumContextOptional,
} from "./lib/hooks/useCesiumContext";
export { CtxEvent } from "./lib/cesiumContextEventMap";
export { useCesiumCameraForceOblique } from "./lib/hooks/useCameraForceOblique";
export { useCesiumSuspended } from "./lib/hooks/useCesiumSuspended";
export { useHomeControl } from "./lib/hooks/useHomeControl";
export { useCesiumInitialCameraFromSearchParams } from "./lib/hooks/useCesiumInitialCameraFromSearchParams";
export { useFovWheelZoom } from "./lib/extensions/cameraFov/hooks/useFovWheelZoom";
export { useSceneStyles } from "./lib/hooks/useSceneStyles";
export { useZoomControls } from "./lib/hooks/useZoomControls";

export {
  type SubscribeCesiumCtxFn,
  type EmitCesiumCtxFn,
} from "./lib/cesiumContextEventMap";
export { VIEWERSTATE_KEYS, TILESET_IDS, SCENE_STYLES } from "./lib/constants";
export { CUSTOM_SHADERS_DEFINITIONS } from "./lib/shaders";

// TODO: all the utils used elsewhere with no cesium dependency should be moved to common helper utils lib

export {
  addCesiumMarker,
  removeCesiumMarker,
  MARKER_KEYS,
  type MarkerKey,
} from "./lib/extensions/markers";

export {
  type AnimationMap,
  cancelAnimation,
  initAnimationMap,
} from "./lib/utils/animationMap";

export {
  getOrbitPoint,
  getHeadingPitchForMouseEvent,
  animateCamera,
  PITCH,
} from "./lib/utils/cesiumAnimateOrbits";
export {
  cesiumAnimateFov,
  type CesiumAnimateFovOptions,
} from "./lib/utils/cesiumAnimateFov";

export { applyRollToHeadingForCameraNearNadir } from "./lib/utils/cesiumCamera";
export {
  cesiumCameraToCssTransform,
  cssPerspectiveFromCesiumCameraForElement,
  fovToCssPerspectiveByFov,
} from "./lib/utils/cesiumCameraToCssTransform";

// Centralized error handling and test triggers
export {
  configureCesiumErrorHandling,
  triggerCesiumRenderError,
  triggerCesiumShowErrorPanel,
} from "./lib/utils/cesiumErrorHandling";

// Hooks for app integration
export { useCesiumDevConsoleTrigger } from "./lib/hooks/useCesiumDevConsoleTrigger";
export { useReloadOnCesiumRenderError } from "./lib/hooks/useReloadOnCesiumRenderError";
export { type WithElevationProvidersCallback } from "./lib/hooks/useValidInstances";
export {
  getCesiumVersion,
  checkWindowEnv,
  assertWindowCesiumEnv,
} from "./lib/utils/cesiumEnv";

export {
  encodeCesiumCamera,
  decodeCesiumCamera,
  cesiumCameraParamKeys,
  cesiumClearParamKeys,
} from "./lib/utils/cesiumHashParamsCodec";

export {
  fromColorRgbaArray,
  isColorRgbaArray,
  toColorRgbaArray,
} from "./lib/utils/cesiumSerializer";

export {
  invertedPolygonHierarchy,
  polygonHierarchyFromPolygonCoords,
  removeGroundPrimitiveById,
} from "./lib/utils/cesiumGroundPrimitives";

export {
  getIsViewerReadyAsync,
  setupCesiumEnvironment,
} from "./lib/utils/cesiumSetup";

export { getElevationAsync, type ElevationResult } from "./lib/utils/elevation";
export { guardSampleTerrainMostDetailedAsync } from "./lib/utils/guardSampleTerrainMostDetailedAsync";

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
  tryWithValidCamera,
  tryWithValidScene,
} from "./lib/utils/instanceGates";

export { pickSceneCenter } from "./lib/utils/pickers";

// Transition utilities (used by map-transition-2d-3d)
export { animateInterpolateHeadingPitchRange } from "./lib/utils/cesiumAnimations";
export {
  getCameraHeightAboveGround,
  getTopDownCameraDeviationAngle,
  cameraToCartographicDegrees,
} from "./lib/utils/cesiumHelpers";
export {
  cesiumCenterPixelSizeToLeafletZoom,
  getScenePixelSize,
} from "./lib/utils/pixels";
export { getCesiumFrustumPixelDimensionsForDistance } from "./lib/utils/cesiumCamera";

export {
  distanceFromZoomLevel,
  getHeadingPitchRangeFromHeight,
  getHeadingPitchRangeFromZoom,
} from "./lib/utils/positions";

export { sceneHasTweens } from "./lib/utils/sceneHasTweens";
export { sceneRequestRender } from "./lib/utils/sceneRequestRender";

export {
  getDegreesFromCartesian,
  getDegreesFromCartographic,
} from "./lib/utils/units";

// Re-export all the types as workaround
// TODO move to common types
export * from "./index.d";
