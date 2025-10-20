import { SceneMode, CesiumWidget } from "@carma/cesium";
import UAParser from "ua-parser-js";
import type { ColorRgbaArray } from "@carma/types";

export const TRANSITION_DELAY = 1000;
export const CESIUM_TARGET_FRAME_RATE = 120;
const isMobile = new UAParser().getDevice().type === "mobile";

export const DEFAULT_BACKGROUND_COLOR: ColorRgbaArray = [1, 1, 1, 1];

// Create a blank div for credit container to hide Cesium logo
// We're not using any Cesium Ion content, so no credits are needed
const createBlankCreditContainer = () => {
  const div = document.createElement("div");
  div.style.display = "none";
  return div;
};

export const DEFAULT_WIDGET_CONSTRUCTOR_OPTIONS: ConstructorParameters<
  typeof CesiumWidget
>[1] = {
  requestRenderMode: true,
  targetFrameRate: CESIUM_TARGET_FRAME_RATE,
  useBrowserRecommendedResolution: false,
  scene3DOnly: true,
  msaaSamples: 4,
  contextOptions: {
    webgl: {
      alpha: true,
      powerPreference: isMobile ? "default" : "high-performance",
    },
  },
  sceneMode: SceneMode.SCENE3D,
  skyBox: false,
  showRenderLoopErrors: false,
  // Disable default providers - we manage these explicitly
  baseLayer: false,
  // Hide Cesium credits - not using Ion content
  creditContainer: createBlankCreditContainer(),
};
