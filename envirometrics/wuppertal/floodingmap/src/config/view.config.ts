import {
  createViewStateShareableHashCodec,
  HASH_ZOOM_CONVENTION,
  type ViewState,
} from "@carma-mapping/engines-interop/view-state";

const DEFAULT_HOME_FOV_DEG = 60;

export const DEFAULT_HOME_VIEW_HASH_VALUES = {
  lat: 51.2677,
  lng: 7.19163,
  altitude: 200,
  pitch: 45,
  range: 1500,
  fov: DEFAULT_HOME_FOV_DEG,
} as const;

const DEFAULT_HOME_VIEW_CODEC = createViewStateShareableHashCodec({
  defaultFovDeg: DEFAULT_HOME_FOV_DEG,
  zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
});

const decodeDefaultHomeViewState = (): ViewState => {
  const state = DEFAULT_HOME_VIEW_CODEC.decode(DEFAULT_HOME_VIEW_HASH_VALUES);
  if (!state) {
    throw new Error("Failed to decode floodingmap default home view state.");
  }
  return state;
};

export const DEFAULT_HOME_VIEW_STATE = decodeDefaultHomeViewState();

export const DEFAULT_HOME_CENTER = {
  lat: DEFAULT_HOME_VIEW_HASH_VALUES.lat,
  lng: DEFAULT_HOME_VIEW_HASH_VALUES.lng,
} as const;
