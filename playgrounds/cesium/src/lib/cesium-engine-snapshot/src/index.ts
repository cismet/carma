console.warn(
  "⚠️  DEPRECATED: cesium-engine-snapshot is deprecated and will be removed in a future version.",
  "please update app to work with new cesium framework @carma/cesium"
);


export * from "./lib/slices/cesium";

export { CesiumContextProvider } from "./lib/CesiumContextProvider";
export { type CesiumContextType } from "./lib/CesiumContext";

export { CustomViewer } from "./lib/CustomViewer";
export { CustomViewerPlayground } from "./lib/CustomViewerPlayground";

export { ByGeojsonClassifier } from "./lib/components/ByGeojsonClassifier";
export { Compass } from "./lib/components/controls/Compass";
export { MarkerContainer } from "./lib/components/MarkerContainer";

export { useCesiumContext } from "./lib/hooks/useCesiumContext";
export { useHomeControl } from "./lib/hooks/useHomeControl";
export { useZoomControls } from "./lib/hooks/useZoomControls";

export { CUSTOM_SHADERS_DEFINITIONS } from "./lib/shaders";

// Re-export all the types as workaround
export * from "./index.d";
