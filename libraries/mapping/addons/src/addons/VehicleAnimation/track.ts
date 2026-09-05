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

/* ------------------------------------------------------------------ *
 *  Stops and vehicle bodies
 * ------------------------------------------------------------------ */

/** a station as it is configured: a name and where it is on the ground */
export type Station = {
  name: string;
  lon: number;
  lat: number;
};

/** where a station sits on the track, in meters from the start */
export type TrackStop = {
  name: string;
  distance: number;
};

/**
 * Finds every place on the track where a station is served.
 *
 * A station is one point on the ground but usually more than one stop on the
 * track: an out-and-back route passes it once per direction, on two rails a few
 * meters apart. So this keeps every local minimum within `radiusMeters` rather
 * than the single nearest point, and the vehicle stops in both directions
 * without the configuration having to say so.
 *
 * The result is sorted by distance, which is the order a vehicle meets them.
 */
export const projectStops = (
  track: Track,
  stations: readonly Station[],
  radiusMeters: number
): TrackStop[] => {
  const stops: TrackStop[] = [];

  for (const station of stations) {
    /** vertices inside the radius, as (index, distance²) */
    let run: { index: number; squared: number }[] = [];

    const flushRun = (): void => {
      if (run.length === 0) return;
      const best = run.reduce((a, b) => (b.squared < a.squared ? b : a));
      stops.push({ name: station.name, distance: track.cumulative[best.index] });
      run = [];
    };

    track.points.forEach((point, index) => {
      const east = (point[0] - station.lon) * track.metersPerLon;
      const north = (point[1] - station.lat) * METERS_PER_LAT;
      const squared = east * east + north * north;
      if (squared <= radiusMeters * radiusMeters) {
        run.push({ index, squared });
      } else {
        // the vertices inside the radius form one run per pass, so a gap ends
        // the pass and the closest vertex of that pass is the stop
        flushRun();
      }
    });
    flushRun();
  }

  return stops.sort((a, b) => a.distance - b.distance);
};

/** a point on the track in the local meter frame, with its arc position */
type LocalPoint = { x: number; y: number; s: number };

/**
 * The stretch of track between two distances, in meters relative to `origin`,
 * with both ends interpolated onto the polyline.
 *
 * `from` may be greater than `to` on a closed track: the slice then runs over
 * the seam, which is what a vehicle sitting on the start point needs.
 */
const sliceLocal = (
  track: Track,
  from: number,
  to: number,
  origin: TrackPose
): LocalPoint[] => {
  const total = track.length;
  const wrap = (value: number): number =>
    track.closed ? ((value % total) + total) % total : Math.max(0, Math.min(total, value));

  const span = track.closed
    ? ((to - from) % total + total) % total
    : Math.max(0, Math.min(total, to) - Math.max(0, from));

  const toLocal = (lon: number, lat: number, s: number): LocalPoint => ({
    x: (lon - origin.lon) * track.metersPerLon,
    y: (lat - origin.lat) * METERS_PER_LAT,
    s,
  });

  const start = wrap(from);
  const startPose = poseAt(track, start);
  const points: LocalPoint[] = [toLocal(startPose.lon, startPose.lat, 0)];

  // walk the vertices strictly inside the slice, in track order
  const vertexCount = track.cumulative.length;
  for (let step = 1; step <= vertexCount; step++) {
    const index = step % vertexCount;
    const at = track.cumulative[index];
    const offset = track.closed
      ? ((at - start) % total + total) % total
      : at - start;
    if (offset <= 0 || offset >= span) continue;
    const point = track.points[index];
    points.push(toLocal(point[0], point[1], offset));
  }
  points.sort((a, b) => a.s - b.s);

  const endPose = poseAt(track, wrap(from + span));
  points.push(toLocal(endPose.lon, endPose.lat, span));
  return points;
};

/**
 * The piece of a local slice between two arc positions, ends interpolated and
 * the result resampled to at most `maxStep` meters.
 *
 * The resampling is what makes the body's outline follow its width profile. A
 * route's own vertices can be ten meters apart, so a body piece would otherwise
 * consist of its two ends alone and every width in between would be a straight
 * interpolation between them: a rounded cab would come out as a wedge running
 * the whole length of the first section.
 */
const subPolyline = (
  points: LocalPoint[],
  from: number,
  to: number,
  maxStep: number
): LocalPoint[] => {
  const at = (s: number): LocalPoint => {
    if (s <= points[0].s) return points[0];
    const last = points[points.length - 1];
    if (s >= last.s) return last;
    let index = 0;
    while (index < points.length - 2 && points[index + 1].s < s) index++;
    const a = points[index];
    const b = points[index + 1];
    const span = b.s - a.s;
    const t = span > 0 ? (s - a.s) / span : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s };
  };

  const steps = Math.max(1, Math.ceil((to - from) / maxStep));
  const samples: number[] = [];
  for (let index = 0; index <= steps; index++) {
    samples.push(from + ((to - from) * index) / steps);
  }
  // the route's own vertices carry the actual bends, so they stay in
  for (const point of points) {
    if (point.s > from && point.s < to) samples.push(point.s);
  }
  samples.sort((a, b) => a - b);

  return samples.map(at);
};

/**
 * A closed ring around a local polyline, `halfWidth(s)` meters to either side.
 *
 * The normal at a vertex is taken from its two neighbours together, so the band
 * stays the same width through a curve instead of pinching on the inside of it.
 */
const ribbon = (
  points: LocalPoint[],
  halfWidth: (s: number) => number,
  origin: TrackPose,
  metersPerLonScale: number
): [number, number][] => {
  const left: [number, number][] = [];
  const right: [number, number][] = [];

  const toLonLat = (x: number, y: number): [number, number] => [
    origin.lon + x / metersPerLonScale,
    origin.lat + y / METERS_PER_LAT,
  ];

  for (let index = 0; index < points.length; index++) {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    let tx = next.x - previous.x;
    let ty = next.y - previous.y;
    const length = Math.hypot(tx, ty);
    if (length === 0) {
      // a repeated vertex carries no direction; the neighbours already do
      continue;
    }
    tx /= length;
    ty /= length;
    const width = halfWidth(points[index].s);
    const point = points[index];
    left.push(toLonLat(point.x - ty * width, point.y + tx * width));
    right.push(toLonLat(point.x + ty * width, point.y - tx * width));
  }

  if (left.length < 2) return [];
  return [...left, ...right.reverse(), left[0]];
};

/**
 * What a vehicle looks like from above.
 *
 * The Schwebebahn's GTW 15 is 24.06 m long, 2.2 m wide and made of three
 * sections joined by two rubber articulations, so the default is three sections
 * with two gaps rather than one box. The cab ends are blunt: the front face is
 * nearly the full width and only its corners are rounded, so from above the nose
 * is a short rounded corner, not a taper.
 */
export type CarShape = {
  lengthMeters: number;
  widthMeters: number;
  /**
   * The body sections, given as relative lengths; the gaps between them are the
   * articulations. Relative rather than absolute so the whole car keeps its
   * `lengthMeters`, and a list rather than a count because the sections are
   * rarely equal: the GTW 15 is two long end cars around a short middle module.
   */
  sectionShares: readonly number[];
  /** length of one articulation gap, in meters */
  jointMeters: number;
  /** how wide the very tip of the cab is, as a fraction of the full width */
  noseWidth: number;
  /** over how many meters the cab narrows to that */
  noseMeters: number;
};

/** how finely a body outline is sampled along its length */
const OUTLINE_STEP_METERS = 0.25;

export const CAR_SHAPE_GTW15: CarShape = {
  lengthMeters: 24.06,
  widthMeters: 2.2,
  // the middle module is a short one slung between the two driving sections
  sectionShares: [1, 0.38, 1],
  jointMeters: 0.9,
  noseWidth: 0.7,
  noseMeters: 0.8,
};

/** one drawable piece of a vehicle: a body section or an articulation */
export type CarPart = {
  kind: "section" | "joint";
  ring: [number, number][];
};

/**
 * The pieces of one vehicle centred at `distance` along the track, as rings in
 * lon/lat.
 *
 * The body follows the track rather than sitting on it as a straight box, so a
 * vehicle in a curve bends the way the real one does. That is the whole reason
 * the shape is built from a slice of the polyline instead of from four corners.
 */
export const carParts = (
  track: Track,
  distance: number,
  shape: CarShape
): CarPart[] => {
  const { lengthMeters, widthMeters, jointMeters } = shape;
  const shares =
    shape.sectionShares.length > 0 ? shape.sectionShares : ([1] as const);
  const origin = poseAt(track, distance);
  const points = sliceLocal(
    track,
    distance - lengthMeters / 2,
    distance + lengthMeters / 2,
    origin
  );
  if (points.length < 2) return [];

  const half = widthMeters / 2;
  const nose = Math.max(0.01, shape.noseMeters);
  /** a quarter ellipse, so the corner is round and meets the side tangentially */
  const halfWidth = (s: number): number => {
    const fromEnd = Math.min(s, lengthMeters - s);
    if (fromEnd >= nose) return half;
    const t = Math.max(0, fromEnd) / nose;
    const eased = Math.sqrt(1 - (1 - t) ** 2);
    return half * (shape.noseWidth + (1 - shape.noseWidth) * eased);
  };

  const jointCount = shares.length - 1;
  const bodyLength = Math.max(0, lengthMeters - jointCount * jointMeters);
  const shareSum = shares.reduce((sum, share) => sum + share, 0) || 1;

  const parts: CarPart[] = [];
  let cursor = 0;
  for (let index = 0; index < shares.length; index++) {
    const kinds: { kind: CarPart["kind"]; length: number }[] = [
      { kind: "section", length: (bodyLength * shares[index]) / shareSum },
      ...(index < jointCount
        ? [{ kind: "joint" as const, length: jointMeters }]
        : []),
    ];
    for (const { kind, length } of kinds) {
      const ring = ribbon(
        subPolyline(points, cursor, cursor + length, OUTLINE_STEP_METERS),
        halfWidth,
        origin,
        track.metersPerLon
      );
      if (ring.length > 3) parts.push({ kind, ring });
      cursor += length;
    }
  }
  return parts;
};
