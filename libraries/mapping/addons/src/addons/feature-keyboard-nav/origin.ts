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

/**
 * Which point inside a feature the navigation measures from.
 *
 * Configurable rather than decided here, because which one reads as "the
 * middle" depends on the shape and there is no winner across all of them. No
 * automatic choice yet: pick one, look at real parcels, then decide.
 *
 * - `pole`: furthest from any edge. The only one with a clearance guarantee,
 *   and meaningless on a corridor, where every point is equally far from the
 *   two long sides and the widest spot is wherever a junction happens to bulge.
 * - `spine`: the middle *along* the shape. On a street that is the point half
 *   way down it, which is what a reader expects and what the pole is not.
 * - `centroid`: the plain area centroid. Right for compact shapes, outside the
 *   feature for anything bent, which is why it falls back.
 */
export type OriginStrategy = "pole" | "spine" | "centroid";

/** A single polygon: ring 0 is the outer ring, the rest are holes. */
type PolygonRings = Position[][];

/** The pole of one polygon and how far it sits from the nearest edge. */
type PartPole = { point: [number, number]; clearance: number };

const extentOfRing = (ring: Position[]) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

const poleOfPart = (rings: PolygonRings): PartPole | undefined => {
  const outer = rings[0];
  if (!outer || outer.length < 4) return undefined;

  try {
    const { width, height } = extentOfRing(outer);
    // polylabel's precision is in coordinate units and defaults to 1.0, which
    // is ~111 km in EPSG:4326 and stops the search instantly. Deriving it from
    // the polygon keeps this correct in degrees and in metres alike.
    if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined;
    if (width <= 0 || height <= 0) return undefined;

    /**
     * Scaled by the narrow side, not by the extent.
     *
     * polylabel starts from cells of `min(width, height)` and quarters them
     * until one falls below the precision, so the work grows with the square of
     * that ratio: a fixed ratio is a fixed number of refinement rounds no matter
     * how long or bent the polygon is. Scaling by the extent instead ties the
     * two together, and on a long thin parcel the precision then exceeds the
     * clearance the polygon can offer at all — polylabel returns a distance near
     * zero, the guard below rejects it, and the origin falls back to a boundary
     * vertex, which is the very thing this function exists to avoid.
     *
     * A fiftieth of the narrow side leaves the point visually centred (the dot
     * is a few pixels wide) while bounding the search at about six rounds. The
     * measured pathological case, a 40 m parcel with five holes whose queue
     * prunes nothing, went from 1461 ms to under 20 ms.
     */
    const result = polylabel(rings, Math.min(width, height) / 50);
    const [lng, lat] = result;
    const clearance = result.distance;

    // `distance` is the signed distance to the nearest edge, so > 0 is
    // polylabel's own proof that the point lies strictly inside. Rejects the
    // degenerate early-exits too.
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return undefined;
    if (!(clearance > 0)) return undefined;
    return { point: [lng, lat], clearance };
  } catch {
    // degenerate geometry (empty rings, NaN coordinates) from a broken tile
    return undefined;
  }
};

/**
 * Even-odd test against every ring, holes included.
 *
 * The two strategies that are not the pole have no containment guarantee of
 * their own, so each has to be checked before it is used.
 */
const isInsideRings = (rings: PolygonRings, [x, y]: [number, number]) => {
  let inside = false;
  for (const ring of rings) {
    for (let index = 1; index < ring.length; index++) {
      const [x1, y1] = ring[index - 1];
      const [x2, y2] = ring[index];
      if (y1 > y === y2 > y) continue;
      if (x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) inside = !inside;
    }
  }
  return inside;
};

/** Area centroid of the outer ring, holes ignored. */
const centroidOfPart = (rings: PolygonRings): [number, number] | undefined => {
  const ring = rings[0];
  if (!ring || ring.length < 4) return undefined;

  let twiceArea = 0;
  let x = 0;
  let y = 0;
  for (let index = 1; index < ring.length; index++) {
    const [x1, y1] = ring[index - 1];
    const [x2, y2] = ring[index];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    x += (x1 + x2) * cross;
    y += (y1 + y2) * cross;
  }
  if (twiceArea === 0) return undefined;
  return [x / (3 * twiceArea), y / (3 * twiceArea)];
};

/**
 * The middle *along* the shape, rather than the widest point in it.
 *
 * The two ends are found by walking away from the shape twice: the vertex
 * furthest from the centroid is one end, the vertex furthest from that one is
 * the other. They cut the outer ring into two chains, one per long side of a
 * corridor, and the arc-length midpoint of each chain is the point half way
 * down that side. Their average is the middle of the street.
 *
 * O(n) and without a containment guarantee: on a shape that folds back past
 * its own middle the average can land outside, which the caller checks for.
 */
const spineOfPart = (rings: PolygonRings): [number, number] | undefined => {
  const ring = rings[0];
  if (!ring || ring.length < 4) return undefined;
  // the ring is closed, so the repeated last vertex is dropped
  const vertices = ring.slice(0, -1);
  if (vertices.length < 3) return undefined;

  const centroid = centroidOfPart(rings);
  if (!centroid) return undefined;

  const squaredDistance = (a: Position, b: Position | [number, number]) =>
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

  const furthestFrom = (from: Position | [number, number]) => {
    let bestIndex = 0;
    let bestDistance = -Infinity;
    vertices.forEach((vertex, index) => {
      const distance = squaredDistance(vertex, from);
      if (distance > bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  };

  const startIndex = furthestFrom(centroid);
  const endIndex = furthestFrom(vertices[startIndex]);
  if (startIndex === endIndex) return undefined;

  /** the point half way along a chain of vertices, by arc length */
  const midpointOfChain = (indices: number[]): [number, number] | undefined => {
    if (indices.length < 2) return undefined;
    let total = 0;
    for (let step = 1; step < indices.length; step++) {
      total += Math.sqrt(
        squaredDistance(vertices[indices[step - 1]], vertices[indices[step]])
      );
    }
    if (total === 0) return undefined;

    let walked = 0;
    for (let step = 1; step < indices.length; step++) {
      const a = vertices[indices[step - 1]];
      const b = vertices[indices[step]];
      const segment = Math.sqrt(squaredDistance(a, b));
      if (walked + segment >= total / 2) {
        const share = segment === 0 ? 0 : (total / 2 - walked) / segment;
        return [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share];
      }
      walked += segment;
    }
    return undefined;
  };

  const forward: number[] = [];
  for (
    let index = startIndex;
    index !== endIndex;
    index = (index + 1) % vertices.length
  ) {
    forward.push(index);
  }
  forward.push(endIndex);

  const backward: number[] = [];
  for (
    let index = startIndex;
    index !== endIndex;
    index = (index - 1 + vertices.length) % vertices.length
  ) {
    backward.push(index);
  }
  backward.push(endIndex);

  const first = midpointOfChain(forward);
  const second = midpointOfChain(backward);
  if (!first || !second) return undefined;
  return [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2];
};

/**
 * The roomiest polygon of a geometry, with its pole.
 *
 * The roomiest one carries the origin, so an island never steals it from the
 * mainland, and it is the polygon every strategy then works on.
 */
const bestPartOf = (geometry: Geometry) => {
  const parts: PolygonRings[] =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
      ? geometry.coordinates
      : [];

  let rings: PolygonRings | undefined;
  let pole: PartPole | undefined;
  for (const candidate of parts) {
    const candidatePole = poleOfPart(candidate);
    if (!candidatePole) continue;
    if (!pole || candidatePole.clearance > pole.clearance) {
      pole = candidatePole;
      rings = candidate;
    }
  }
  return { rings, pole };
};

/** A strategy's point, and whether it may be used as it stands. */
export type OriginCandidate = { point: [number, number]; inside: boolean };

/**
 * Every strategy's point for one geometry, for drawing them side by side.
 *
 * Points that fall outside are kept rather than dropped, marked `inside:
 * false`: seeing where a strategy went wrong is the reason to look at all of
 * them at once, and it is what explains the fallback to the pole.
 */
export const originCandidatesOf = (
  geometry: Geometry | null | undefined
): Partial<Record<OriginStrategy, OriginCandidate>> => {
  if (!geometry) return {};
  const { rings, pole } = bestPartOf(geometry);
  if (!rings || !pole) return {};

  const candidates: Partial<Record<OriginStrategy, OriginCandidate>> = {
    // polylabel proves this one by its own distance, so it is inside by
    // construction
    pole: { point: pole.point, inside: true },
  };

  const spine = spineOfPart(rings);
  if (spine) candidates.spine = { point: spine, inside: isInsideRings(rings, spine) };

  const centroid = centroidOfPart(rings);
  if (centroid) {
    candidates.centroid = {
      point: centroid,
      inside: isInsideRings(rings, centroid),
    };
  }

  return candidates;
};

export const interiorPointOf = (
  geometry: Geometry | null | undefined,
  strategy: OriginStrategy = "pole"
): [number, number] | undefined => {
  if (!geometry) return undefined;

  const { rings, pole } = bestPartOf(geometry);

  if (rings && pole && strategy !== "pole") {
    const candidate =
      strategy === "centroid" ? centroidOfPart(rings) : spineOfPart(rings);
    // both can land outside a bent shape, and an origin on or beyond the border
    // is exactly what the pole is here to prevent
    if (candidate && isInsideRings(rings, candidate)) return candidate;
  }

  // points, lines, and areas polylabel could not place: better on the feature
  // than nowhere, since without an origin the arrow keys have nothing to do
  return pole?.point ?? onFeaturePointOf(geometry);
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
