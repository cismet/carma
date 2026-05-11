import { CARMA_ZOOM_DEFAULTS } from "./zoom.config";

export interface CarmaLayerZoomDefaults {
  leafletMaxZoom: number;
  tileMaxNativeZoom: number;
  esriMaxNativeZoom: number;
  cartoMaxNativeZoom: number;
}

export const CARMA_LAYER_ZOOM_DEFAULTS = {
  leafletMaxZoom: CARMA_ZOOM_DEFAULTS.zoomMax,
  tileMaxNativeZoom: CARMA_ZOOM_DEFAULTS.defaultMaxNativeZoom,
  esriMaxNativeZoom: 18,
  cartoMaxNativeZoom: 19,
} as const satisfies CarmaLayerZoomDefaults;
