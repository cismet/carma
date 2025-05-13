export * from "./lib/slices/cesium";

export { CesiumContextProvider } from "./lib/CesiumContextProvider";
export { type CesiumContextType } from "./lib/CesiumContext";

export { CustomCesiumWidget } from "./lib/CustomCesiumWidget";
export {
  CustomViewer,
  DEFAULT_VIEWER_CONSTRUCTOR_OPTIONS,
  type InitialCameraView,
  type CameraLimiterOptions,
} from "./lib/CustomViewer";
export { CustomViewerPlayground } from "./lib/CustomViewerPlayground";

export { ByGeojsonClassifier } from "./lib/components/ByGeojsonClassifier";
export { ByTilesetClassifier } from "./lib/components/ByTilesetClassifier";

export { Compass } from "./lib/components/controls/Compass";
export { HomeControl } from "./lib/components/controls/HomeControl";
export { MarkerContainer } from "./lib/components/MarkerContainer";
export { MapTypeSwitcher } from "./lib/components/controls/MapTypeSwitcher";
export { PitchingCompass } from "./lib/components/controls/PitchingCompass";
export { SceneStyleToggle } from "./lib/components/controls/SceneStyleToggle";

export { useCesiumContext } from "./lib/hooks/useCesiumContext";
export { useCesiumCameraForceOblique } from "./lib/hooks/useCameraForceOblique";
export { useHomeControl } from "./lib/hooks/useHomeControl";
export { useCesiumInitialCameraFromSearchParams } from "./lib/hooks/useCesiumInitialCameraFromSearchParams";
export { useFovWheelZoom } from "./lib/hooks/useFovWheelZoom";
export { useSceneStyles } from "./lib/hooks/useSceneStyles";
export { useZoomControls } from "./lib/hooks/useZoomControls";

export { VIEWERSTATE_KEYS } from "./lib/constants";
export { CUSTOM_SHADERS_DEFINITIONS } from "./lib/shaders";

// TODO: all the utils used elsewhere with no cesium dedependency should be moved to common helper utils lib

export { cesiumSceneHasTweens } from "./lib/utils/cesiumAnimations";
export { getOrbitPoint } from "./lib/utils/cesiumAnimateOrbits";
export {
  cesiumAnimateFov,
  type CesiumAnimateFovOptions,
} from "./lib/utils/cesiumAnimateFov";

export {
  CesiumErrorToErrorBoundaryForwarder,
  type ForwardedCesiumError,
} from "./lib/utils/CesiumErrorToErrorBoundaryForwarder";

export { applyRollToHeadingForCameraNearNadir } from "./lib/utils/cesiumCamera";

export {
  encodeCesiumCamera,
  decodeCesiumCamera,
  cesiumCameraParamKeys,
  cesiumClearParamKeys,
} from "./lib/utils/cesiumHashParamsCodec";

export {
  pickViewerCanvasCenter,
  getDegreesFromCartesian,
  getDegreesFromCartographic,
  cesiumSafeRequestRender,
} from "./lib/utils/cesiumHelpers";
export {
  fromColorRgbaArray,
  toColorRgbaArray,
} from "./lib/utils/cesiumSerializer";

export {
  invertedPolygonHierarchy,
  polygonHierarchyFromPolygonCoords,
  removeGroundPrimitiveById,
} from "./lib/utils/cesiumGroundPrimitives";
export { addCesiumMarker, removeCesiumMarker } from "./lib/utils/cesiumMarkers";
export {
  getIsViewerReadyAsync,
  setupCesiumEnvironment,
} from "./lib/utils/cesiumSetup";

export { isValidViewerInstance } from "./lib/utils/cesiumTypeGuards";

export {
  distanceFromZoomLevel,
  getHeadingPitchRangeFromHeight,
  getHeadingPitchRangeFromZoom,
} from "./lib/utils/positions";

export {
  type ViewerAnimationMap,
  initViewerAnimationMap,
} from "./lib/utils/viewerAnimationMap";

// Re-export all the types as workaround
export * from "./index.d";
