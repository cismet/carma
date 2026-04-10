import { isFiniteNumber } from "@carma-commons/math";

export const HASH_ZOOM_CONVENTION = {
  MAPLIBRE_512: "maplibre-512",
  LEAFLET_256: "leaflet-256",
} as const;

export type HashZoomConvention =
  (typeof HASH_ZOOM_CONVENTION)[keyof typeof HASH_ZOOM_CONVENTION];

export const readViewStateHashNumber = (value: unknown): number | undefined => {
  if (isFiniteNumber(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return isFiniteNumber(parsed) ? parsed : undefined;
  }

  return undefined;
};
