import { SceneMode, Viewer } from "cesium";
import { COLORS } from "@carma-commons/utils";
import UAParser from "ua-parser-js";

export const CESIUM_TARGET_FRAME_RATE = 120;
const isMobile = new UAParser().getDevice().type === "mobile";

export const DEFAULT_BACKGROUND_COLOR = COLORS.WHITE;

export const DEFAULT_VIEWER_CONSTRUCTOR_OPTIONS: Viewer.ConstructorOptions = {
  msaaSamples: 4,
  requestRenderMode: true,

  scene3DOnly: true,
  sceneMode: SceneMode.SCENE3D,
  selectionIndicator: false,
  targetFrameRate: CESIUM_TARGET_FRAME_RATE,
  useBrowserRecommendedResolution: false,
  contextOptions: {
    webgl: {
      alpha: true,
      powerPreference: isMobile ? "default" : "high-performance",
    },
  },

  // Disable default providers but keep globe for imageryLayers collection
  baseLayer: false,
  terrainProvider: undefined,

  // Hide UI components
  animation: false,
  baseLayerPicker: false,
  fullscreenButton: false,
  geocoder: false,
  homeButton: false,
  infoBox: false,
  navigationHelpButton: false,
  navigationInstructionsInitiallyVisible: false,
  sceneModePicker: false,
  skyBox: false,
  timeline: false,
};
