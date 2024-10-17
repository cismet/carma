import { colorToArray } from './lib/utils/cesiumHelpers';
export * from "./lib/slices/cesium";

export {
  type CesiumContextType,
  CesiumContextProvider,
  useCesiumContext,
} from "./lib/CesiumContextProvider";

export { CustomCesiumWidget } from "./lib/CustomCesiumWidget";
export { CustomViewer } from "./lib/CustomViewer";
export { CustomViewerPlayground } from "./lib/CustomViewerPlayground";

export { ByGeojsonClassifier } from "./lib/components/ByGeojsonClassifier";
export { ByTilesetClassifier } from "./lib/components/ByTilesetClassifier";

export { Compass } from "./lib/components/controls/Compass";
export { HomeControl } from "./lib/components/controls/HomeControl";
export { MarkerContainer } from "./lib/components/MarkerContainer";
export { MapTypeSwitcher } from "./lib/components/controls/MapTypeSwitcher";
export { SceneStyleToggle } from "./lib/components/controls/SceneStyleToggle";

export { useHomeControl } from "./lib/hooks/useHomeControl";
export { useSceneStyleToggle } from "./lib/hooks/useSceneStyleToggle";
export { useZoomControls } from "./lib/hooks/useZoomControls";

export { CUSTOM_SHADERS_DEFINITIONS } from "./lib/shaders";

// TODO: all the utils used elsewhere with no cesium dedependency should be moved to common helper utils lib

export {
  colorToArray,
  pickViewerCanvasCenter } from "./lib/utils/cesiumHelpers";
export {
  invertedPolygonHierarchy,
  polygonHierarchyFromPolygonCoords,
  removeGroundPrimitiveById,
} from "./lib/utils/cesiumGroundPrimitives";
export { addCesiumMarker, removeCesiumMarker } from "./lib/utils/cesiumMarkers";
export {
  distanceFromZoomLevel,
  getHeadingPitchRangeFromZoom,
} from "./lib/utils/positions";

// Re-export all the types as workaround
export * from "./index.d";
