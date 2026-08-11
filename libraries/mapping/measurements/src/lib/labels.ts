import area from "@turf/area";
import centroid from "@turf/centroid";
import length from "@turf/length";
import type {
  Feature,
  FeatureCollection,
  LineString,
  Point,
  Polygon,
  Position,
} from "geojson";

export const LABEL_SOURCE_ID = "carma-measurements-labels";
export const LABEL_LAYER_ID = "carma-measurements-labels-symbols";
export const LABEL_ROTATED_LAYER_ID =
  "carma-measurements-labels-rotated-symbols";

const numberFormatInteger = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 0,
});
const numberFormatOneDecimal = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 1,
});
const numberFormatTwoDecimals = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 2,
});

export function formatMeters(meters: number): string {
  if (meters < 100) {
    return `${numberFormatOneDecimal.format(meters)} m`;
  }
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

const DEG_TO_RAD = Math.PI / 180;
const MERCATOR_MAX_LAT = 85.051129;

function mercatorY(lat: number): number {
  const clamped = Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat));
  return Math.log(Math.tan(Math.PI / 4 + (clamped * DEG_TO_RAD) / 2));
}

function segmentRotationDegrees(a: Position, b: Position): number {
  const dx = (b[0] - a[0]) * DEG_TO_RAD;
  const dy = mercatorY(b[1]) - mercatorY(a[1]);
  if (dx === 0 && dy === 0) {
    return 0;
  }
  // atan2 is counter-clockwise from east and mercator y grows northwards,
  // while text-rotate turns clockwise on screen — hence the sign flip.
  let degrees = -Math.atan2(dy, dx) / DEG_TO_RAD;
  while (degrees > 90) {
    degrees -= 180;
  }
  while (degrees <= -90) {
    degrees += 180;
  }
  return Math.round(degrees * 10) / 10;
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
// - kind: "title"   — per-feature P1/L1/F1 markers (anchored near the
//                     geometric middle of a line and on the first vertex of a
//                     polygon's outer ring, always on a real vertex).
// - kind: "segment" — segment-midpoint length labels for line segments and
//                     polygon outer-ring edges.
// - kind: "total"   — total line length, anchored on the last vertex. Same
//                     number the InfoBox shows as "Strecke".
// - kind: "area"    — centroid-anchored area label for each polygon.
//
// MultiPolygon and polygon holes are out of scope — no consumer draws them
// today.
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
            properties: {
              kind: "segment",
              label: formatMeters(meters),
              rotation: segmentRotationDegrees(ring[i], ring[i + 1]),
            },
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
      // Anchor the title on the ring's FIRST vertex (the one the user clicked
      // first), not on the centroid: the centroid already carries the area
      // label, and with `text-allow-overlap: false` the two would compete for
      // the same spot and one would silently drop out. A real vertex also
      // keeps the label attached while the polygon is edited.
      if (title && ring && ring.length > 0) {
        labelFeatures.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: ring[0] },
          properties: { kind: "title", label: title },
        });
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
          rotation: segmentRotationDegrees(coords[i], coords[i + 1]),
        },
      });
    }

    if (coords.length >= 3 && feature.properties?.currentlyDrawing !== true) {
      const totalMeters = length(feature as Feature<LineString>, {
        units: "meters",
      });
      if (totalMeters > 0) {
        labelFeatures.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: coords[coords.length - 1],
          },
          properties: {
            kind: "total",
            label: formatMeters(totalMeters),
            // Aligned with the LAST segment: the total sits on the line's
            // end vertex, so that is the edge it visually belongs to.
            rotation: segmentRotationDegrees(
              coords[coords.length - 2],
              coords[coords.length - 1]
            ),
          },
        });
      }
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
