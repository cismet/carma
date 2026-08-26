import { WUPPERTAL } from "@carma-commons/resources";
import type { ShareableViewState } from "@carma-mapping/engines-interop/view-state";

export const DEFAULT_INITIAL_2D_VIEW_REF = {
  lngDeg: WUPPERTAL.position.longitude,
  latDeg: WUPPERTAL.position.latitude,
  zoomLeaflet256: 13,
} as const;

export const DEFAULT_HOME_VIEW_REF = {
  lat: 51.2725716,
  lng: 7.1999207,
  zoom: 18,
  altitude: 157,
  pitch: 45,
} satisfies ShareableViewState;

export const DEFAULT_HOME_VIEW_2D = {
  pitch: 0,
  bearing: 0,
} as const;
