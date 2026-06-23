import { CesiumWidget, SceneMode } from "@carma-cesium";
import UAParser from "ua-parser-js";

import { COLORS } from "@carma-commons/utils";
export const CESIUM_TARGET_FRAME_RATE = 120;
const isMobile = new UAParser().getDevice().type === "mobile";

export const DEFAULT_BACKGROUND_COLOR = COLORS.WHITE;

export type CesiumWidgetConstructorOptions = ConstructorParameters<
  typeof CesiumWidget
>[1];

export const DEFAULT_WIDGET_CONSTRUCTOR_OPTIONS: CesiumWidgetConstructorOptions =
  {
    msaaSamples: 4,
    requestRenderMode: true,

    scene3DOnly: true,
    sceneMode: SceneMode.SCENE3D,
    targetFrameRate: CESIUM_TARGET_FRAME_RATE,
    useBrowserRecommendedResolution: false,
    contextOptions: {
      webgl: {
        alpha: true,
        powerPreference: isMobile ? "default" : "high-performance",
      },
    },

    // Disable default providers but keep globe for imageryLayers collection.
    baseLayer: false,
    terrainProvider: undefined,

    skyBox: false,
  };
