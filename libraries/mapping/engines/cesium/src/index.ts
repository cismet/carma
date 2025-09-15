export * from "./lib/slices/cesium";

export { type CesiumContextType } from "./lib/CesiumContext";
export { CesiumContextProvider } from "./lib/CesiumContextProvider";

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

export { sceneHasTweens } from "./lib/utils/sceneHasTweens";
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

export {
  CesiumErrorToErrorBoundaryForwarder,
  type ForwardedCesiumError,
} from "./lib/utils/CesiumErrorToErrorBoundaryForwarder";

export {
  encodeCesiumCamera,
  decodeCesiumCamera,
  cesiumCameraParamKeys,
  cesiumClearParamKeys,
} from "./lib/utils/cesiumHashParamsCodec";

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

export {
  isValidCesiumTerrainProvider,
  isValidEllipsoidTerrainProvider,
  isValidEntity,
  isValidEntityCollection,
  isValidImageryLayer,
  isValidImageryProvider,
  isValidScene,
  isValidTileset,
  isValidViewer,
  withValidViewer,
} from "./lib/utils/instanceGates";

export { pickViewerCanvasCenter } from "./lib/utils/pickers";

// Safe guard wrappers
export { guardEntityCollection } from "./lib/utils/guardEntityCollection";
export { guardViewer } from "./lib/utils/guardViewer";
export { guardScene } from "./lib/utils/guardScene";
export { guardCamera } from "./lib/utils/guardCamera";
export { guardScreenSpaceCameraController } from "./lib/utils/guardScreenSpaceCameraController";

export {
  distanceFromZoomLevel,
  getHeadingPitchRangeFromHeight,
  getHeadingPitchRangeFromZoom,
} from "./lib/utils/positions";

export {
  type ViewerAnimationMap,
  cancelViewerAnimation,
  initViewerAnimationMap,
} from "./lib/utils/viewerAnimationMap";

export {
  getDegreesFromCartesian,
  getDegreesFromCartographic,
} from "./lib/utils/units";

// Re-export all the types as workaround
// TODO move to common types
export * from "./index.d";
