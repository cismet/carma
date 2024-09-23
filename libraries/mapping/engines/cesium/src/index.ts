import { CustomViewer } from "./lib/CustomViewer";

export { CustomCesiumWidget } from "./lib/CustomCesiumWidget";
export * from "./lib/CustomViewer";
export * from "./lib/CustomViewerContextProvider";

export { MapTypeSwitcher } from './lib/CustomViewer/components/controls/MapTypeSwitcher';
export { SceneStyleToggle } from './lib/CustomViewer/components/controls/SceneStyleToggle';
export { Compass } from './lib/CustomViewer/components/controls/Compass';
export { HomeControl } from './lib/CustomViewer/components/controls/HomeControl';

export { ByGeojsonClassifier } from "./lib/components/ByGeojsonClassifier";
export { ByTilesetClassifier } from "./lib/components/ByTilesetClassifier";
export { MarkerContainer } from "./lib/components/MarkerContainer";

// Re-export all the types as workaround
export * from "./index.d";

export default CustomViewer;