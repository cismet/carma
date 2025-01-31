import { DEFAULT_VIEWER_CONSTRUCTOR_OPTIONS } from "@carma-mapping/cesium-engine";

export const cesiumConstructorOptions = {
  ...DEFAULT_VIEWER_CONSTRUCTOR_OPTIONS,
  creditContainer: document.createElement("div"),
};
