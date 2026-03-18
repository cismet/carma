import type { SceneViewState } from "@carma-mapping/engines-interop";

export const APP_BASE_PATH = import.meta.env.BASE_URL;
export const CESIUM_PATHNAME = "__cesium__";

export const ANNOTATIONS_DEMO_HOME_VIEW_STATE: SceneViewState = {
  anchor: {
    lngDeg: 7.1960888,
    latDeg: 51.2696499,
    heightM: 149.95,
  },
  orientation: {
    bearingRad: 0.0563659,
    pitchRad: 1.0250815,
  },
};
