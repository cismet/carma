import { WUPPERTAL } from "@carma-commons/resources";
import {
  createViewStateShareableHashCodec,
  HASH_ZOOM_CONVENTION,
  type ViewState,
} from "@carma-mapping/engines-interop/view-state";
import { DEFAULT_CAMERA_FOV_DEG } from "./app.config";

export const DEFAULT_VIEW_STATE = {
  lng: WUPPERTAL.position.longitude,
  lat: WUPPERTAL.position.latitude,
  zoom: 13,
  altitude: WUPPERTAL.position.altitude,
} as const;

export const DEFAULT_HOME_VIEW_HASH_VALUES = {
  lat: 51.2717487,
  lng: 7.20028,
  zoom: 16.444,
  pitch: 45,
  altitude: 154.38,
} as const;

const DEFAULT_HOME_VIEW_CODEC = createViewStateShareableHashCodec({
  defaultFovDeg: DEFAULT_CAMERA_FOV_DEG,
  zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
});

const decodeDefaultHomeViewState = (): ViewState => {
  const state = DEFAULT_HOME_VIEW_CODEC.decode(DEFAULT_HOME_VIEW_HASH_VALUES);
  if (!state) {
    throw new Error("Failed to decode Geoportal default home view state.");
  }
  return state;
};

export const DEFAULT_HOME_VIEW_STATE = decodeDefaultHomeViewState();

export const DEFAULT_HOME_CENTER = {
  lat: DEFAULT_HOME_VIEW_HASH_VALUES.lat,
  lng: DEFAULT_HOME_VIEW_HASH_VALUES.lng,
} as const;

export const DEFAULT_HOME_LEAFLET_ZOOM = DEFAULT_HOME_VIEW_HASH_VALUES.zoom;
export const DEFAULT_HOME_MAPLIBRE_ZOOM =
  DEFAULT_HOME_VIEW_HASH_VALUES.zoom - 1;

// Keep this in sync with view-state hash restore defaults.
export const DEFAULT_SCENE_HASH_RANGE_M = 750;

const parseFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

export const hasCompleteLeafletViewHash = (
  hashParams: Record<string, unknown>
): boolean => {
  return (
    parseFiniteNumber(hashParams.lat) !== undefined &&
    parseFiniteNumber(hashParams.lng) !== undefined &&
    parseFiniteNumber(hashParams.zoom) !== undefined
  );
};

export const buildDefaultLeafletViewHashParams = (): Record<
  string,
  string
> => ({
  lat: String(DEFAULT_VIEW_STATE.lat),
  lng: String(DEFAULT_VIEW_STATE.lng),
  zoom: String(DEFAULT_VIEW_STATE.zoom),
});
