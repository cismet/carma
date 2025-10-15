// Bring in ambient Window globals for consumers of this package
import "./lib/types/env";

// @deprecated - Redux slice removed. Use CesiumContext instead.
// export * from "./lib/slices/cesium";

export {
  type CesiumContextType,
  CesiumContextProvider,
} from "./lib/providers/cesiumContext";

export {
  CesiumErrorHandler as CesiumErrorHandling,
  type ForwardedCesiumError,
} from "./lib/CesiumErrorHandler";

export {
  CesiumSceneComponent,
  type InitialCameraView,
  type CameraLimiterOptions,
  type CesiumSceneComponentProps,
} from "./lib/CesiumSceneComponent";
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
export { VIEWERSTATE_KEYS } from "./lib/constants";
export { CUSTOM_SHADERS_DEFINITIONS } from "./lib/shaders";

// TODO: all the utils used elsewhere with no cesium dependency should be moved to common helper utils lib

export {
  addCesiumMarker,
  removeCesiumMarker,
  MARKER_KEYS,
  type MarkerKey,
} from "./lib/extensions/markers";
export type {
  MarkerPrimitiveData,
  MarkerModelAsset,
} from "./lib/extensions/markers/types";

// Hooks for app integration
export { useCesiumDevConsoleTrigger } from "./lib/hooks/useCesiumDevConsoleTrigger";
export { useReloadOnCesiumRenderError } from "./lib/hooks/useReloadOnCesiumRenderError";

export {
  type AnimationMap,
  cancelAnimation,
  initAnimationMap,
} from "./lib/utils/animationMap";

export * from "./lib/utils/cartesian2";
export * from "./lib/utils/cartesian3";

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

// Transition utilities (used by map-transition-2d-3d)
export { animateInterpolateHeadingPitchRange } from "./lib/utils/cesiumAnimations";

export {
  applyRollToHeadingForCameraNearNadir,
  getCesiumFrustumPixelDimensionsForDistance,
} from "./lib/utils/cesiumCamera";

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

export {
  invertedPolygonHierarchy,
  polygonHierarchyFromPolygonCoords,
  removeGroundPrimitiveById,
} from "./lib/utils/cesiumGroundPrimitives";

export {
  getCesiumVersion,
  checkWindowEnv,
  assertWindowCesiumEnv,
} from "./lib/utils/cesiumEnv";

// TODO deprecate
export {
  encodeCesiumCamera,
  decodeCesiumCamera,
  cesiumCameraParamKeys,
  cesiumClearParamKeys,
} from "./lib/utils/cesiumHashParamsCodec";

// TODO split to topical utils
export {
  getCameraHeightAboveGround,
  getTopDownCameraDeviationAngle,
  cameraToCartographicDegrees,
} from "./lib/utils/cesiumHelpers";

export {
  fromColorRgbaArray,
  isColorRgbaArray,
  toColorRgbaArray,
} from "./lib/utils/cesiumSerializer";

export { setupCesiumEnvironment } from "./lib/utils/cesiumSetup";

export * from "./lib/utils/color";

export { getElevationAsync, type ElevationResult } from "./lib/utils/elevation";
export { isValidFov } from "./lib/utils/fov";
export {
  isPerspectiveTypeFrustum,
  isPerspectiveFrustum,
  isPerspectiveOffCenterFrustum,
} from "./lib/utils/frustum";
export { guardSampleTerrainMostDetailedAsync } from "./lib/utils/guardSampleTerrainMostDetailedAsync";

export * from "./lib/utils/headingPitchRange";
export * from "./lib/utils/instanceGates";

export { pickSceneCenter } from "./lib/utils/pickers";

export {
  cesiumCenterPixelSizeToLeafletZoom,
  getScenePixelSize,
} from "./lib/utils/pixels";
export {
  distanceFromZoomLevel,
  getHeadingPitchRangeFromHeight,
  getHeadingPitchRangeFromZoom,
} from "./lib/utils/positions";

export { sceneHasTweens } from "./lib/utils/sceneHasTweens";
export { sceneRequestRender } from "./lib/utils/sceneRequestRender";
export * from "./lib/utils/screenSpaceEventHandler";

export {
  getDegreesFromCartesian,
  getDegreesFromCartographic,
} from "./lib/utils/units";
