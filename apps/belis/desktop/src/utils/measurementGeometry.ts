import length from "@turf/length";
import type { Feature } from "geojson";

const numberFormatInteger = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 0,
});
const numberFormatTwoDecimals = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 2,
});

export const formatMeters = (meters: number): string => {
  if (meters < 1000) {
    return `${numberFormatInteger.format(Math.round(meters))} m`;
  }
  return `${numberFormatTwoDecimals.format(meters / 1000)} km`;
};

// Total LineString / MultiLineString length in meters via @turf/length —
// same algorithm the in-map segment labels use, so the sidebar / InfoBox
// total matches the sum of the on-map segment labels (no off-by-rounding
// surprises). Returns null for non-line geometries and on any error so
// callers can branch on a single null check.
export const featureLengthMeters = (feature: Feature): number | null => {
  const t = feature.geometry?.type;
  if (t !== "LineString" && t !== "MultiLineString") return null;
  try {
    return length(feature, { units: "meters" });
  } catch {
    return null;
  }
};
