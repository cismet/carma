import { pointOnFeature } from "@turf/turf";
import type { Feature, Geometry, Position } from "geojson";

/**
 * The point navigation measures from.
 *
 * It has to lie *inside* the selected feature. A centroid does not: a C-shaped
 * or ring-shaped parcel has its centroid outside its own geometry, and every
 * direction around it is then inverted — the neighbour to the left is measured
 * as lying to the right. `pointOnFeature` is a guaranteed-inside operation
 * rather than an average of coordinates, which is exactly the difference.
 */
export const interiorPointOf = (
  geometry: Geometry | null | undefined
): Position | undefined => {
  if (!geometry) return undefined;
  try {
    const feature: Feature = { type: "Feature", properties: {}, geometry };
    const point = pointOnFeature(feature);
    const [lng, lat] = point.geometry.coordinates;
    return Number.isFinite(lng) && Number.isFinite(lat)
      ? [lng, lat]
      : undefined;
  } catch {
    // degenerate geometry (empty rings, NaN coordinates) from a broken tile
    return undefined;
  }
};

/** Areas cast rays, everything else uses the cone. */
export const isAreaGeometry = (type: string | undefined): boolean =>
  type === "Polygon" || type === "MultiPolygon";

/**
 * Every ring, line or coordinate of a geometry as a flat list of parts, in the
 * geometry's own coordinates. Rings stay closed, so ray casting sees a boundary
 * rather than an open polyline.
 */
export const partsOfGeometry = (
  geometry: Geometry | null | undefined
): Position[][] => {
  if (!geometry) return [];
  switch (geometry.type) {
    case "Point":
      return [[geometry.coordinates]];
    case "MultiPoint":
      return geometry.coordinates.map((position) => [position]);
    case "LineString":
      return [geometry.coordinates];
    case "MultiLineString":
    case "Polygon":
      return geometry.coordinates;
    case "MultiPolygon":
      return geometry.coordinates.flat();
    case "GeometryCollection":
      return geometry.geometries.flatMap(partsOfGeometry);
    default:
      return [];
  }
};

/** Geographic bounding box `[west, south, east, north]` of a list of parts. */
export const bboxOfParts = (
  parts: Position[][]
): [number, number, number, number] | undefined => {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const part of parts) {
    for (const [lng, lat] of part) {
      if (lng < west) west = lng;
      if (lat < south) south = lat;
      if (lng > east) east = lng;
      if (lat > north) north = lat;
    }
  }
  return west === Infinity ? undefined : [west, south, east, north];
};
