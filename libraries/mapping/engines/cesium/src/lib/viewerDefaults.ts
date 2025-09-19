import { SceneMode, Viewer } from "cesium";
import UAParser from "ua-parser-js";
import type { ColorRgbaArray } from '@carma/types';

export const TRANSITION_DELAY = 1000;
export const CESIUM_TARGET_FRAME_RATE = 120;
const isMobile = new UAParser().getDevice().type === "mobile";

export const DEFAULT_BACKGROUND_COLOR: ColorRgbaArray = [1, 1, 1, 1];

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

  // Hide UI components
  animation: false,
  baseLayer: false,
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
