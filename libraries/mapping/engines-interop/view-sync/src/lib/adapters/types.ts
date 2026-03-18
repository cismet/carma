export type MapLibreAdapterOptions = {
  defaultFovDeg?: number;
  maxPitchDeg?: number;
  minRangeM?: number;
};

export type MapLibreViewValues = {
  lng: number;
  lat: number;
  zoom: number;
  altitude: number;
  bearing?: number;
  pitch?: number;
  roll?: number;
};

export type LeafletViewValues = {
  lng: number;
  lat: number;
  zoom: number;
  rollDeg?: number;
};

export const DEFAULT_FOV_DEG = 45;
export const DEFAULT_MAX_PITCH_DEG = 85;
export const DEFAULT_MIN_RANGE_M = 10;
