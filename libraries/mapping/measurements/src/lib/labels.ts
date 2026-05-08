import area from "@turf/area";
import centroid from "@turf/centroid";
import length from "@turf/length";
import type {
  Feature,
  FeatureCollection,
  Point,
  Polygon,
  Position,
} from "geojson";

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

export function formatAreaSquareMeters(squareMeters: number): string {
  if (squareMeters < 10000) {
    return `${numberFormatInteger.format(Math.round(squareMeters))} m²`;
  }
  return `${numberFormatTwoDecimals.format(squareMeters / 10000)} ha`;
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

// Derive label points for every drawn feature. Three kinds emitted:
//
// - kind: "title"   — per-feature P1/L1 markers for points + lines (anchored
//                     near the geometric middle of a line, on a real vertex).
// - kind: "segment" — segment-midpoint length labels for line segments and
//                     polygon outer-ring edges.
// - kind: "area"    — centroid-anchored area label for each polygon.
//
// Polygons get segment + area labels but no title (matches the playground's
// historical behaviour). MultiPolygon and polygon holes are out of scope —
// no consumer draws them today.
export function buildLabelFeatures(
  drawnFeatures: ReadonlyArray<Feature>
): FeatureCollection<Point> {
  const labelFeatures: Feature<Point>[] = [];

  for (const feature of drawnFeatures) {
    const title =
      typeof feature.properties?.title === "string"
        ? feature.properties.title
        : null;

    if (feature.geometry.type === "Point") {
      if (title) {
        labelFeatures.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: feature.geometry.coordinates,
          },
          properties: { kind: "title", label: title },
        });
      }
      continue;
    }

    if (feature.geometry.type === "Polygon") {
      const polygonFeature = feature as Feature<Polygon>;
      const ring = polygonFeature.geometry.coordinates[0];
      if (ring && ring.length >= 2) {
        for (let i = 0; i < ring.length - 1; i++) {
          const meters = segmentLengthMeters(ring[i], ring[i + 1]);
          if (meters <= 0) continue;
          labelFeatures.push({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: midpoint(ring[i], ring[i + 1]),
            },
            properties: { kind: "segment", label: formatMeters(meters) },
          });
        }
      }
      // A closed ring needs ≥ 4 positions (3 unique vertices + repeat) for
      // the area to be meaningful; below that turf returns 0 anyway but
      // skipping early avoids emitting a stray "0 m²" label.
      if (ring && ring.length >= 4) {
        const polyArea = area(polygonFeature);
        if (polyArea > 0) {
          const c = centroid(polygonFeature);
          labelFeatures.push({
            type: "Feature",
            geometry: c.geometry,
            properties: {
              kind: "area",
              label: formatAreaSquareMeters(polyArea),
            },
          });
        }
      }
      continue;
    }

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
    if (title && coords.length > 0) {
      // Anchor the title at a "middle-ish" vertex: floor(N/2) - 1, clamped
      // to >= 0. For 2 nodes this is index 0, for 4 nodes index 1, for 6
      // nodes index 2 — i.e. just before the geometric middle. This keeps
      // the title on a real vertex (so the label stays attached during
      // edits) while putting it visually near the centre of the line.
      const titleIndex = Math.max(0, Math.floor(coords.length / 2) - 1);
      labelFeatures.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: coords[titleIndex] },
        properties: { kind: "title", label: title },
      });
    }
  }

  return { type: "FeatureCollection", features: labelFeatures };
}
