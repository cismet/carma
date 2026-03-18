import { WUPPERTAL } from "@carma-commons/resources";

export const DEFAULT_VIEW_STATE = {
  lng: WUPPERTAL.position.longitude,
  lat: WUPPERTAL.position.latitude,
  zoom: 13,
  altitude: WUPPERTAL.position.altitude,
} as const;

export const DEFAULT_VIEW_ANCHOR = {
  lng: DEFAULT_VIEW_STATE.lng,
  lat: DEFAULT_VIEW_STATE.lat,
  altitude: DEFAULT_VIEW_STATE.altitude,
} as const;

// Keep this in sync with scene-state hash restore defaults.
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
