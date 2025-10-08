// Bring in ambient Window globals for consumers of this package
import "./lib/types/env";

export * from "./lib/slices/cesium";

export { type CesiumContextType } from "./lib/CesiumContext";
export { CesiumContextProvider } from "./lib/CesiumContextProvider";

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
export { MarkerContainer } from "./lib/components/MarkerContainer";
export { MapTypeSwitcher } from "./lib/components/controls/MapTypeSwitcher";
export { PitchingCompass } from "./lib/components/controls/PitchingCompass";
export { SceneStyleToggle } from "./lib/components/controls/SceneStyleToggle";

export {
  useCesiumContext,
  useCesiumContextOptional,
} from "./lib/hooks/useCesiumContext";
export { CtxEvent } from "./lib/cesiumContextEventMap";
export { useCesiumCameraForceOblique } from "./lib/hooks/useCameraForceOblique";
export { useHomeControl } from "./lib/hooks/useHomeControl";
export { useCesiumInitialCameraFromSearchParams } from "./lib/hooks/useCesiumInitialCameraFromSearchParams";
export { useFovWheelZoom } from "./lib/hooks/useFovWheelZoom";
export {
  addMapTransitionLifecycleHandler,
  MapTransitionState,
  type MapTransitionLifecycle,
  useMapTransition,
} from "./lib/hooks/useMapTransition";
export { useSceneStyles } from "./lib/hooks/useSceneStyles";
export { useZoomControls } from "./lib/hooks/useZoomControls";

export {
  type SubscribeCesiumCtxFn,
  type EmitCesiumCtxFn,
} from "./lib/cesiumContextEventMap";
export { VIEWERSTATE_KEYS } from "./lib/constants";
export { CUSTOM_SHADERS_DEFINITIONS } from "./lib/shaders";

// TODO: all the utils used elsewhere with no cesium dependency should be moved to common helper utils lib

export { addCesiumMarker, removeCesiumMarker } from "./lib/extensions/markers";

export {
  type AnimationMap,
  cancelAnimation,
  initAnimationMap,
} from "./lib/utils/animationMap";

export { getOrbitPoint } from "./lib/utils/cesiumAnimateOrbits";
export { getHeadingPitchForMouseEvent } from "./lib/utils/cesiumAnimateOrbits";
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
export { type WithElevationProvidersAsyncCallback } from "./lib/hooks/useValidInstances";
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
