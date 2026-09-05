/**
 * The structure a suspended railway hangs from, as `build-schwebebahn-structure.mjs`
 * writes it: the rail girders as a wireframe, the wind bracing between the
 * two rails, and the supports as a few shapes placed many times. Everything
 * is in a local metre frame around `origin`, z as the source model has it.
 *
 * Framework-agnostic like `track.ts`: this file turns the asset into line
 * segments, and the two renderers decide what to make of them. Seen from
 * above the same segments are the "roof" over the vehicles; in 3D they are
 * the girders and legs themselves.
 */

export type StructureAsset = {
  origin: [number, number];
  metersPerLon: number;
  /** x, y, z, x, y, z, ... one segment per six numbers */
  girder: number[];
  bracing: number[];
  /** u, v, w, ... in the support's own frame, feet at w = 0 */
  supportShapes: number[][];
  /** x, y, zBase, angle, shape index, mirror */
  supports: number[][];
};

/** one straight member, both ends in local metres with absolute z */
export type Segment3 = [x1: number, y1: number, z1: number, x2: number, y2: number, z2: number];

export type StructureSegments = {
  girder: Segment3[];
  bracing: Segment3[];
  supports: Segment3[];
};

const METERS_PER_LAT = 111320;

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "number");

/** the asset as parsed JSON, or null when it is not one */
export const parseStructureAsset = (value: unknown): StructureAsset | null => {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.type !== "SchwebebahnGeruest") return null;
  const { origin, metersPerLon, girder, bracing, supportShapes, supports } = record;
  if (
    !isNumberArray(origin) ||
    origin.length !== 2 ||
    typeof metersPerLon !== "number" ||
    !isNumberArray(girder) ||
    !isNumberArray(bracing) ||
    !Array.isArray(supportShapes) ||
    !supportShapes.every(isNumberArray) ||
    !Array.isArray(supports) ||
    !supports.every(isNumberArray)
  ) {
    return null;
  }
  return {
    origin: [origin[0], origin[1]],
    metersPerLon,
    girder,
    bracing,
    supportShapes,
    supports,
  };
};

const toSegments = (flat: number[]): Segment3[] => {
  const out: Segment3[] = [];
  for (let i = 0; i + 5 < flat.length; i += 6) {
    out.push([flat[i], flat[i + 1], flat[i + 2], flat[i + 3], flat[i + 4], flat[i + 5]]);
  }
  return out;
};

/**
 * Every member of the structure in the local frame. Supports are unfolded
 * from their shapes: each placement rotates its shape by `angle`, mirrors it
 * across the axis when the flag says so, and lifts it onto `zBase`.
 */
export const structureSegments = (asset: StructureAsset): StructureSegments => {
  const supports: Segment3[] = [];
  for (const [x, y, zBase, angle, shapeIndex, mirror] of asset.supports) {
    const shape = asset.supportShapes[shapeIndex];
    if (!shape) continue;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const sign = mirror ? -1 : 1;
    for (let i = 0; i + 5 < shape.length; i += 6) {
      const v1 = shape[i + 1] * sign;
      const v2 = shape[i + 4] * sign;
      supports.push([
        x + shape[i] * c - v1 * s,
        y + shape[i] * s + v1 * c,
        zBase + shape[i + 2],
        x + shape[i + 3] * c - v2 * s,
        y + shape[i + 3] * s + v2 * c,
        zBase + shape[i + 5],
      ]);
    }
  }
  return {
    girder: toSegments(asset.girder),
    bracing: toSegments(asset.bracing),
    supports,
  };
};

/** local metres back to lon/lat */
export const structureToLonLat = (
  asset: StructureAsset,
  x: number,
  y: number
): [number, number] => [
  asset.origin[0] + x / asset.metersPerLon,
  asset.origin[1] + y / METERS_PER_LAT,
];

/** a member shorter than this in plan is a vertical, and invisible from above */
const PLAN_MIN_METERS = 0.3;

const planLines = (
  asset: StructureAsset,
  segments: Segment3[]
): [number, number][][] => {
  const seen = new Set<string>();
  const lines: [number, number][][] = [];
  for (const [x1, y1, , x2, y2] of segments) {
    if (Math.hypot(x2 - x1, y2 - y1) < PLAN_MIN_METERS) continue;
    // chords at several heights share one plan line; draw it once
    const a = `${x1.toFixed(1)},${y1.toFixed(1)}`;
    const b = `${x2.toFixed(1)},${y2.toFixed(1)}`;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push([structureToLonLat(asset, x1, y1), structureToLonLat(asset, x2, y2)]);
  }
  return lines;
};

/**
 * What the structure looks like from above, as GeoJSON for a line layer. The
 * girders themselves are left out: in plan they collapse onto the route, and
 * the route is already on the map as the rail.
 */
export const structurePlanFeatures = (
  asset: StructureAsset
): GeoJSON.FeatureCollection => {
  const { bracing, supports } = structureSegments(asset);
  const feature = (part: string, lines: [number, number][][]): GeoJSON.Feature => ({
    type: "Feature",
    properties: { part },
    geometry: { type: "MultiLineString", coordinates: lines },
  });
  return {
    type: "FeatureCollection",
    features: [
      feature("bracing", planLines(asset, bracing)),
      feature("support", planLines(asset, supports)),
    ],
  };
};
