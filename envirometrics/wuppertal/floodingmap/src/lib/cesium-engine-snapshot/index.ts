// Bring in ambient Window globals for consumers of this package
import "./lib/types/env";

console.warn(
  "⚠️  DEPRECATED: @carma-mapping/cesium-engine-snapshot is deprecated and will be removed in a future version.",
  "please update app to work with new cesium framework @carma/cesium"
);

export * from "./lib/slices/cesium";
export type {
  CesiumState,
  RootState,
  SceneStyle,
  SceneStyles,
  CesiumConfig,
} from "./lib/types/cesium-snapshot-types";

export { type CesiumContextType } from "./lib/CesiumContext";
export { CesiumContextProvider } from "./lib/CesiumContextProvider";

export { MapTypeSwitcher } from "./lib/components/controls/MapTypeSwitcher";
export { PitchingCompass } from "./lib/components/controls/PitchingCompass/PitchingCompass";
export { CustomViewer } from "./lib/CustomViewer";

export { useCesiumContext } from "./lib/hooks/useCesiumContext";
export { useHomeControl } from "./lib/hooks/useHomeControl";
export { useCesiumInitialCameraFromSearchParams } from "./lib/hooks/useCesiumInitialCameraFromSearchParams";
export { useZoomControls } from "./lib/hooks/useZoomControls";

export { VIEWERSTATE_KEYS } from "./lib/constants";

export { toColorRgbaArray } from "./lib/utils/cesiumSerializer";

export { setupCesiumEnvironment } from "./lib/utils/cesiumSetup";

export { getTerrainElevationAsync } from "./lib/utils/elevation";

export {
  getDegreesFromCartesian,
  getDegreesFromCartographic,
} from "./lib/utils/units";

export { addCesiumMarker, removeCesiumMarker } from "./lib/extensions/markers";
export type {
  MarkerPrimitiveData,
  MarkerModelAsset,
} from "./lib/extensions/markers";

export { isValidScene, tryWithValidScene } from "./lib/utils/instanceGates";
export { sceneRequestRender } from "./lib/utils/sceneRequestRender";
export { removeGroundPrimitiveById } from "./lib/utils/cesiumGroundPrimitives";

export type { CesiumOptions } from "./lib/types/options";
export { useSelectionCesium } from "./lib/hooks/useSelectionCesium";

export {
  distanceFromZoomLevel,
  getHeadingPitchRangeFromZoom,
  getHeadingPitchRangeFromHeight,
} from "./lib/utils/positions";
export { getElevationAsync } from "./lib/utils/elevation";
export { pickViewerCanvasCenter } from "./lib/utils/pickers";
export {
  polygonHierarchyFromPolygonCoords,
  invertedPolygonHierarchy,
} from "./lib/utils/cesiumGroundPrimitives";
