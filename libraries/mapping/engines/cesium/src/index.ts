import { setupCesiumEnvironment } from "./lib/utils/cesiumSetup";
export * from "./lib/slices/cesium";

export { CesiumContextProvider } from "./lib/CesiumContextProvider";
export { type CesiumContextType } from "./lib/CesiumContext";

export { CustomCesiumWidget } from "./lib/CustomCesiumWidget";
export { CustomViewer, DEFAULT_VIEWER_CONSTRUCTOR_OPTIONS } from "./lib/CustomViewer";
export { CustomViewerPlayground } from "./lib/CustomViewerPlayground";

export { ByGeojsonClassifier } from "./lib/components/ByGeojsonClassifier";
export { ByTilesetClassifier } from "./lib/components/ByTilesetClassifier";

export { Compass } from "./lib/components/controls/Compass";
export { HomeControl } from "./lib/components/controls/HomeControl";
export { MarkerContainer } from "./lib/components/MarkerContainer";
export { MapTypeSwitcher } from "./lib/components/controls/MapTypeSwitcher";
export { SceneStyleToggle } from "./lib/components/controls/SceneStyleToggle";

export { useCesiumContext } from "./lib/hooks/useCesiumContext";
export { useHomeControl } from "./lib/hooks/useHomeControl";
export { useSceneStyles } from "./lib/hooks/useSceneStyles";
export { useZoomControls } from "./lib/hooks/useZoomControls";

export { CUSTOM_SHADERS_DEFINITIONS } from "./lib/shaders";

// TODO: all the utils used elsewhere with no cesium dedependency should be moved to common helper utils lib

export {
  pickViewerCanvasCenter,
  getDegreesFromCartesian,
  getDegreesFromCartographic,
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
export { setupCesiumEnvironment } from "./lib/utils/cesiumSetup";
export {
  distanceFromZoomLevel,
  getHeadingPitchRangeFromZoom,
} from "./lib/utils/positions";

// Re-export all the types as workaround
export * from "./index.d";
