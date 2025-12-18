// Bring in ambient Window globals for consumers of this package
import "./types/env";

export * from "./index.d";

export * from "./slices/cesium";

export { type CesiumContextType } from "./CesiumContext";
export { CesiumContextProvider } from "./CesiumContextProvider";
export { CustomCesiumWidget } from "./CustomCesiumWidget";
export {
  CesiumErrorHandler as CesiumErrorHandling,
  type ForwardedCesiumError,
} from "./CesiumErrorHandler";

export {
  CustomViewer,
  type InitialCameraView,
  type CameraLimiterOptions,
} from "./CustomViewer";
export { DEFAULT_VIEWER_CONSTRUCTOR_OPTIONS } from "./viewerDefaults";

export { ByGeojsonClassifier } from "./components/ByGeojsonClassifier";
export { ByTilesetClassifier } from "./components/ByTilesetClassifier";

export { Compass } from "./components/controls/Compass";
export { HomeControl } from "./components/controls/HomeControl";
export { MarkerContainer } from "./components/MarkerContainer";
export { PitchingCompass } from "./components/controls/PitchingCompass";
export { SceneStyleToggle } from "./components/controls/SceneStyleToggle";

export {
  useCesiumContext,
  useCesiumContextOptional,
} from "./hooks/useCesiumContext";
export { useCesiumCameraForceOblique } from "./hooks/useCameraForceOblique";
export { useHomeControl } from "./hooks/useHomeControl";
export { useCesiumInitialCameraFromSearchParams } from "./hooks/useCesiumInitialCameraFromSearchParams";
export { useFovWheelZoom } from "./hooks/useFovWheelZoom";
export { useSceneStyles } from "./hooks/useSceneStyles";
export { useZoomControls } from "./hooks/useZoomControls";

export { VIEWERSTATE_KEYS } from "./constants";
export { CUSTOM_SHADERS_DEFINITIONS } from "./shaders";

// Hooks for app integration
export { useCesiumDevConsoleTrigger } from "./hooks/useCesiumDevConsoleTrigger";
export { useReloadOnCesiumRenderError } from "./hooks/useReloadOnCesiumRenderError";

// Marker utilities
export { addCesiumMarker, removeCesiumMarker } from "./extensions/markers";

// Utils - flat and namespaced exports
export * from "./utils";
export * as utils from "./utils";

// Re-export all the types as workaround
// TODO move to common types
