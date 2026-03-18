import type { ViewState } from "@carma-mapping/engines-interop/view-sync";
import type { Meters, Radians } from "@carma/units/types";

export const APP_BASE_PATH = import.meta.env.BASE_URL;
export const CESIUM_PATHNAME = "__cesium__";

export const ANNOTATIONS_DEMO_HOME_VIEW_STATE: ViewState = {
  longitude: 0.12559507296885875 as Radians,
  latitude: 0.8948259892205007 as Radians,
  altitude: 149.95 as Meters,
  bearing: 0.0563659 as Radians,
  pitch: 1.0250815 as Radians,
  range: 750 as Meters,
};
