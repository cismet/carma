import type { ShareableViewState } from "@carma-mapping/engines-interop/view-state";

export const APP_BASE_PATH = import.meta.env.BASE_URL;
export const CESIUM_PATHNAME = "__cesium__";

export const HOME_VIEW: ShareableViewState = {
  lat: 51.2725716,
  lng: 7.1999207,
  zoom: 19,
  altitude: 157,
  pitch: 45,
};
