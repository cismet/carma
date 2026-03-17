import {
  DEFAULT_MAPLIBRE_FOV_DEG,
  DEFAULT_MAPLIBRE_PITCH_MAX_DEG,
  DEFAULT_MAPLIBRE_PITCH_MIN_DEG,
} from "../../../../../mapping/engines/maplibre/src/constants/cameraDefaults";

export const DEFAULT_SCENE_STATE_ALTITUDE_HASH_KEY = "altitude";

export {
  DEFAULT_MAPLIBRE_FOV_DEG,
  DEFAULT_MAPLIBRE_PITCH_MAX_DEG,
  DEFAULT_MAPLIBRE_PITCH_MIN_DEG,
};

export type SceneStateHashAnchor = {
  lngDeg: number;
  latDeg: number;
  heightM: number;
};

export type SceneStateHashOrientation = {
  bearingRad?: number;
  pitchRad?: number;
  rollRad?: number;
  fovVerticalRad?: number;
  rangeM?: number;
};

export type SceneStateHashSnapshot = {
  anchor: SceneStateHashAnchor;
  orientation: SceneStateHashOrientation;
};

export type SceneStateHashCodec = {
  decode: (value: string | undefined) => SceneStateHashSnapshot | undefined;
  encode: (value: unknown) => string | undefined;
};

export type MapLibreCompatHashParams = {
  lng: number;
  lat: number;
  zoom?: number;
  bearing?: number;
  pitch?: number;
  altitude?: number;
  fov?: number;
};

export type MapLibrePlusElevationHashValues = {
  lng: number;
  lat: number;
  zoom: number;
  altitude: number;
  bearing?: number;
  pitch?: number;
  fov?: number;
};
