import length from "@turf/length";
import type { Feature, FeatureCollection, Point, Position } from "geojson";

export const LABEL_SOURCE_ID = "carma-measurements-labels";
export const LABEL_LAYER_ID = "carma-measurements-labels-symbols";

const numberFormatInteger = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 0,
});
const numberFormatTwoDecimals = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 2,
});

export function formatMeters(meters: number): string {
  if (meters < 1000) {
    return `${numberFormatInteger.format(Math.round(meters))} m`;
  }
  return `${numberFormatTwoDecimals.format(meters / 1000)} km`;
}

function midpoint([ax, ay]: Position, [bx, by]: Position): Position {
  return [(ax + bx) / 2, (ay + by) / 2];
}

function segmentLengthMeters(a: Position, b: Position): number {
  return length(
    {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [a, b] },
      properties: {},
    },
    { units: "meters" }
  );
}

// Derive segment-midpoint length labels for every drawn LineString. Polygons
// are intentionally skipped — the lib's current consumers expose only point
// + line modes; polygon area / perimeter labels are a future addition.
export function buildLabelFeatures(
  drawnFeatures: ReadonlyArray<Feature>
): FeatureCollection<Point> {
  const labelFeatures: Feature<Point>[] = [];

  for (const feature of drawnFeatures) {
    if (feature.geometry.type !== "LineString") continue;
    const coords = feature.geometry.coordinates;
    for (let i = 0; i < coords.length - 1; i++) {
      const meters = segmentLengthMeters(coords[i], coords[i + 1]);
      if (meters <= 0) continue;
      labelFeatures.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: midpoint(coords[i], coords[i + 1]),
        },
        properties: {
          kind: "segment",
          label: formatMeters(meters),
        },
      });
    }
  }

  return { type: "FeatureCollection", features: labelFeatures };
}
