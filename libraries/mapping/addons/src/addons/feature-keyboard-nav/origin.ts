import { pointOnFeature } from "@turf/turf";
import type { Feature, Geometry, Position } from "geojson";
import polylabel from "polylabel";

/**
 * The point navigation measures from.
 *
 * It has to lie *inside* the selected feature. A centroid does not: a C-shaped
 * or ring-shaped parcel has its centroid outside its own geometry, and every
 * direction around it is then inverted — the neighbour to the left is measured
 * as lying to the right.
 *
 * For areas that is polylabel, the pole of inaccessibility: the point furthest
 * from any edge. `pointOnFeature` only guarantees *on* the feature, and falls
 * back to a boundary vertex whenever the bbox centre misses — which happens on
 * every concave parcel and on every shape a vector tile clipped. A boundary
 * origin sits on the border it is supposed to step across, so a ray leaves the
 * feature at 0 px and the first neighbour it meets is arbitrary. The deepest
 * interior point is the stable one.
 */

/** Points and lines have no interior; `pointOnFeature` is right for them. */
const onFeaturePointOf = (geometry: Geometry): [number, number] | undefined => {
  try {
    const feature: Feature = { type: "Feature", properties: {}, geometry };
    const [lng, lat] = pointOnFeature(feature).geometry.coordinates;
    return Number.isFinite(lng) && Number.isFinite(lat)
      ? [lng, lat]
      : undefined;
  } catch {
    // degenerate geometry (empty rings, NaN coordinates) from a broken tile
    return undefined;
  }
};

export const interiorPointOf = (
  geometry: Geometry | null | undefined
): [number, number] | undefined => {
  if (!geometry) return undefined;

  const parts: Position[][][] =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
      ? geometry.coordinates
      : [];

  let best: [number, number] | undefined;
  let bestClearance = 0;

  for (const rings of parts) {
    const outer = rings[0];
    if (!outer || outer.length < 4) continue;

    try {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const [x, y] of outer) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      const width = maxX - minX;
      const height = maxY - minY;
      // polylabel's precision is in coordinate units and defaults to 1.0, which
      // is ~111 km in EPSG:4326 and stops the search instantly. Deriving it from
      // the polygon keeps this correct in degrees and in metres alike.
      if (!Number.isFinite(width) || !Number.isFinite(height)) continue;
      if (width <= 0 || height <= 0) continue;

      /**
       * Scaled by the narrow side, not by the extent.
       *
       * polylabel starts from cells of `min(width, height)` and quarters them
       * until one falls below the precision, so the work grows with the square
       * of that ratio: a fixed ratio is a fixed number of refinement rounds no
       * matter how long or bent the polygon is. Scaling by the extent instead
       * ties the two together, and on a long thin parcel the precision then
       * exceeds the clearance the polygon can offer at all — polylabel returns
       * a distance near zero, the guard below rejects it, and the origin falls
       * back to a boundary vertex, which is the very thing this function
       * exists to avoid.
       *
       * A fiftieth of the narrow side leaves the point visually centred (the
       * dot is a few pixels wide) while bounding the search at about six
       * rounds. The measured pathological case, a 40 m parcel with five holes
       * whose queue prunes nothing, went from 1461 ms to under 20 ms.
       */
      const result = polylabel(rings, Math.min(width, height) / 50);
      const [lng, lat] = result;
      const clearance = result.distance;

      // `distance` is the signed distance to the nearest edge, so > 0 is
      // polylabel's own proof that the point lies strictly inside. Rejects the
      // degenerate early-exits too. On a MultiPolygon the roomiest part wins, so
      // an island never steals the origin from the mainland.
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      if (clearance > bestClearance) {
        bestClearance = clearance;
        best = [lng, lat];
      }
    } catch {
      // degenerate geometry (empty rings, NaN coordinates) from a broken tile
    }
  }

  // points, lines, and areas polylabel could not place: better on the feature
  // than nowhere, since without an origin the arrow keys have nothing to do
  return best ?? onFeaturePointOf(geometry);
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
