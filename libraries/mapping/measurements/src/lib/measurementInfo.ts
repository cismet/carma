import length from "@turf/length";
import type { Feature, LineString, Polygon } from "geojson";

import {
  buildFeatureTitle,
  buildLineSubtitle,
  buildPolygonSubtitle,
} from "./feature-collection-export";

// Marker used on a host app's selected-feature slot to discriminate measurement
// selections from other selections. Lives on the feature itself so downstream
// code (info renderer, sidebar highlight) can branch without an extra store
// lookup. Sibling field, does not overload existing kind/type props.
export const MEASUREMENT_FEATUREKIND = "measurement" as const;

export type MeasurementSelected<F extends Feature = Feature> = F & {
  featurekind: typeof MEASUREMENT_FEATUREKIND;
  selected: true;
};

/** Wrap a measurement feature for a shared selected-feature slot. */
export const wrapMeasurement = <F extends Feature>(
  feature: F,
): MeasurementSelected<F> => ({
  ...feature,
  featurekind: MEASUREMENT_FEATUREKIND,
  selected: true,
});

// Total LineString / MultiLineString length in meters via @turf/length, the
// same algorithm the in-map segment labels use, so any consumer total matches
// the sum of on-map segment labels. Returns null for non-line geometries and
// on any error so callers can branch on a single null check.
export const featureLengthMeters = (feature: Feature): number | null => {
  const t = feature.geometry?.type;
  if (t !== "LineString" && t !== "MultiLineString") {
    return null;
  }
  try {
    return length(feature, { units: "meters" });
  } catch {
    return null;
  }
};

export interface MeasurementInfo {
  header: string;
  title: string;
  subtitle: string;
}

// Geometry types that participate in the adhoc-collection numbering scheme.
// Matches the filter in `featuresToFeatureCollection`, so a measurement
// surfaced live in the infobox carries the same `#N` it would get once saved.
const ORDERED_GEOM_TYPES = new Set(["Point", "LineString", "Polygon"]);

// Compute 1-based position of `selected` inside `features`, counting only
// Point / LineString / Polygon entries (same filter the adhoc-export uses).
// Returns 0 when the feature isn't found, which the title builder treats as
// an unnumbered fallback.
export const getMeasurementOrder = (
  features: ReadonlyArray<Feature>,
  selected: Feature,
): number => {
  let order = 0;
  for (const f of features) {
    if (!ORDERED_GEOM_TYPES.has(f.geometry?.type ?? "")) {
      continue;
    }
    order += 1;
    if (f === selected || String(f.id) === String(selected.id)) {
      return order;
    }
  }
  return 0;
};

// Build header/title/subtitle for an InfoBox showing a measurement. Matches
// the strings produced by `featuresToFeatureCollection` for saved adhoc
// layers, so the live infobox shown while drawing reads the same as the
// infobox shown after a measurement set has been saved.
export const buildMeasurementInfo = (
  feature: Feature,
  order: number,
): MeasurementInfo => {
  const geomType = feature?.geometry?.type;

  if (geomType === "Point") {
    return {
      header: "Messung",
      title: `Punkt #${order}`,
      subtitle: "",
    };
  }

  if (geomType === "LineString") {
    const coords = (feature as Feature<LineString>).geometry.coordinates;
    return {
      header: "Messung",
      title: buildFeatureTitle(order, false),
      subtitle: buildLineSubtitle(coords),
    };
  }

  if (geomType === "Polygon") {
    return {
      header: "Messung",
      title: buildFeatureTitle(order, true),
      subtitle: buildPolygonSubtitle(feature as Feature<Polygon>),
    };
  }

  // Fallback for unsupported geometry types (MultiLineString etc.) — keep the
  // infobox usable but skip the per-type formatting.
  const id = feature?.id != null ? String(feature.id) : "?";
  return {
    header: "Messung",
    title: order > 0 ? `Messung #${order}` : `Messung ${id}`,
    subtitle: "",
  };
};
