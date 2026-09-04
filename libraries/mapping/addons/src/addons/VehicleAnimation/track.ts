/**
 * The route a vehicle runs on: an ordered polyline with its arc length, plus
 * the two things the animation asks of it every frame, a position and a
 * heading at a given distance from the start.
 *
 * Framework-agnostic on purpose. It knows nothing about MapLibre or React, so
 * the same track can later drive a Cesium entity or a test.
 *
 * Distances are meters in a local equirectangular frame around the track. Over
 * a city-sized route that is well below the model's own precision, and it keeps
 * the per-frame math to a multiplication.
 */

/** lon, lat, and the height the source carried, if any */
export type TrackPoint = [number, number] | [number, number, number];

export type Track = {
  points: TrackPoint[];
  /** cumulative meters, one entry per point, starting at 0 */
  cumulative: number[];
  /** total length in meters */
  length: number;
  /** whether the last point coincides with the first */
  closed: boolean;
  /** meters per degree of longitude at the track's mean latitude */
  metersPerLon: number;
};

export type TrackPose = {
  lon: number;
  lat: number;
  /** heading in radians, counter-clockwise from east, in the local frame */
  heading: number;
};

const METERS_PER_LAT = 111320;

const metersPerLon = (lat: number): number =>
  METERS_PER_LAT * Math.cos((lat * Math.PI) / 180);

type Ring = [number, number][];

const isPosition = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === "number" &&
  typeof value[1] === "number";

const isLineString = (value: unknown): value is number[][] =>
  Array.isArray(value) && value.length > 1 && value.every(isPosition);

/** Every LineString in whatever the fetch returned, in document order. */
const collectLines = (geojson: unknown): number[][][] => {
  const lines: number[][][] = [];
  const fromGeometry = (geometry: unknown): void => {
    if (!geometry || typeof geometry !== "object") return;
    const { type, coordinates, geometries } = geometry as {
      type?: string;
      coordinates?: unknown;
      geometries?: unknown[];
    };
    if (type === "LineString" && isLineString(coordinates)) {
      lines.push(coordinates);
    }
    if (type === "MultiLineString" && Array.isArray(coordinates)) {
      for (const line of coordinates) {
        if (isLineString(line)) lines.push(line);
      }
    }
    if (type === "GeometryCollection" && Array.isArray(geometries)) {
      geometries.forEach(fromGeometry);
    }
  };

  if (!geojson || typeof geojson !== "object") return lines;
  const root = geojson as {
    type?: string;
    features?: { geometry?: unknown }[];
    geometry?: unknown;
  };
  if (root.type === "FeatureCollection" && Array.isArray(root.features)) {
    root.features.forEach((feature) => fromGeometry(feature?.geometry));
  } else if (root.type === "Feature") {
    fromGeometry(root.geometry);
  } else {
    fromGeometry(root);
  }
  return lines;
};

const pointKey = (point: number[]): string =>
  `${point[0].toFixed(8)},${point[1].toFixed(8)}`;

/**
 * Joins loose segments end-to-start and returns the longest resulting chain.
 *
 * A route exported from a CAD or GIS model usually arrives as an unordered pile
 * of two-point segments, so a naive concatenation would make the vehicle jump.
 * Chains are compared by point count rather than by length, which is enough to
 * pick the route out of a handful of stubs and needs no distance math before
 * the frame has been chosen.
 */
const stitch = (lines: number[][][]): number[][] => {
  if (lines.length === 0) return [];
  if (lines.length === 1) return lines[0];

  const endpoints = new Map<string, number[]>();
  lines.forEach((line, index) => {
    for (const point of [line[0], line[line.length - 1]]) {
      const key = pointKey(point);
      endpoints.set(key, [...(endpoints.get(key) ?? []), index]);
    }
  });

  const used = new Array<boolean>(lines.length).fill(false);
  let best: number[][] = [];

  for (let index = 0; index < lines.length; index++) {
    if (used[index]) continue;
    used[index] = true;
    let chain = [...lines[index]];

    const extend = (atEnd: boolean): void => {
      for (;;) {
        const anchor = pointKey(atEnd ? chain[chain.length - 1] : chain[0]);
        const next = (endpoints.get(anchor) ?? []).find((i) => !used[i]);
        if (next === undefined) return;
        const line = lines[next];
        used[next] = true;
        const forward = pointKey(line[0]) === anchor;
        const tail = forward
          ? line.slice(1)
          : [...line].reverse().slice(1);
        chain = atEnd
          ? [...chain, ...tail]
          : [...[...tail].reverse(), ...chain];
      }
    };
    extend(true);
    extend(false);

    if (chain.length > best.length) best = chain;
  }

  return best;
};

/**
 * Builds a track from parsed GeoJSON, or `null` when it holds no usable line.
 *
 * Consecutive duplicate points are dropped: they carry no direction, and a
 * zero-length step would make the heading undefined at exactly that point.
 */
export const buildTrack = (geojson: unknown): Track | null => {
  const stitched = stitch(collectLines(geojson));
  if (stitched.length < 2) return null;

  const points: TrackPoint[] = [];
  for (const point of stitched) {
    const previous = points[points.length - 1];
    if (previous && previous[0] === point[0] && previous[1] === point[1]) {
      continue;
    }
    points.push(
      point.length > 2
        ? [point[0], point[1], point[2]]
        : [point[0], point[1]]
    );
  }
  if (points.length < 2) return null;

  const meanLat =
    points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const scaleLon = metersPerLon(meanLat);

  const cumulative = [0];
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    const step = Math.hypot(
      (to[0] - from[0]) * scaleLon,
      (to[1] - from[1]) * METERS_PER_LAT
    );
    cumulative.push(cumulative[index - 1] + step);
  }

  const first = points[0];
  const last = points[points.length - 1];

  return {
    points,
    cumulative,
    length: cumulative[cumulative.length - 1],
    closed: first[0] === last[0] && first[1] === last[1],
    metersPerLon: scaleLon,
  };
};

/** index of the segment containing `distance`, by binary search */
const segmentAt = (cumulative: number[], distance: number): number => {
  let low = 0;
  let high = cumulative.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (cumulative[middle] <= distance) low = middle;
    else high = middle;
  }
  return low;
};

/**
 * Where the vehicle is, and which way it points, at `distance` meters along
 * the track. Distances outside the track are clamped; the caller decides what
 * happens at the ends, since looping and turning around need different answers.
 */
export const poseAt = (track: Track, distance: number): TrackPose => {
  const clamped = Math.max(0, Math.min(track.length, distance));
  const index = segmentAt(track.cumulative, clamped);
  const from = track.points[index];
  const to = track.points[index + 1] ?? from;
  const span = track.cumulative[index + 1] - track.cumulative[index];
  const t = span > 0 ? (clamped - track.cumulative[index]) / span : 0;

  const lon = from[0] + (to[0] - from[0]) * t;
  const lat = from[1] + (to[1] - from[1]) * t;
  const east = (to[0] - from[0]) * track.metersPerLon;
  const north = (to[1] - from[1]) * METERS_PER_LAT;

  return { lon, lat, heading: Math.atan2(north, east) };
};

/**
 * The vehicle body: a rectangle of `length` by `width` meters, centred on the
 * pose and turned into its heading, as a closed GeoJSON ring.
 *
 * Straight rather than bent along the track. Over 24 m the Schwebebahn's
 * tightest curve deviates by well under a car width, and a straight box keeps
 * the per-frame work at four corner transforms.
 */
export const vehicleRing = (
  pose: TrackPose,
  lengthMeters: number,
  widthMeters: number,
  metersPerLonScale: number
): Ring => {
  const cos = Math.cos(pose.heading);
  const sin = Math.sin(pose.heading);
  const halfLength = lengthMeters / 2;
  const halfWidth = widthMeters / 2;

  const corner = (along: number, across: number): [number, number] => {
    const east = along * cos - across * sin;
    const north = along * sin + across * cos;
    return [
      pose.lon + east / metersPerLonScale,
      pose.lat + north / METERS_PER_LAT,
    ];
  };

  const a = corner(halfLength, halfWidth);
  const b = corner(halfLength, -halfWidth);
  const c = corner(-halfLength, -halfWidth);
  const d = corner(-halfLength, halfWidth);
  return [a, b, c, d, a];
};
