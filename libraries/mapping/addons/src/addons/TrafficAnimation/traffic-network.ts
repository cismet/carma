/**
 * The road network the traffic drives on, read from the GeoJSON that
 * `scripts/geodata/build-traffic-network.mjs` writes: one LineString per road
 * section between two nodes, with the section's daily load.
 *
 * The sections become the edges of a graph and their end points its nodes. A
 * node is named by the id the traffic model gives it (`from`, `to`); a section
 * without ids gets its nodes from its end coordinates, rounded to about 10 cm,
 * so two sections meeting there still meet in the graph.
 *
 * Every edge is driven in both directions. The loads are counts across the
 * whole cross-section, so each direction gets half of them (`traffic-profile`).
 * Which side of the road a vehicle is drawn on is the renderer's business: the
 * graph only knows the centre line.
 *
 * Positions are kept in scene metres: Web Mercator relative to an origin in the
 * middle of the network, scaled so that one unit is one metre on the ground
 * there. That is what the renderer draws in (`traffic-layer.ts`), and over the
 * few kilometres of the model the Mercator scale changes by well under a
 * thousandth, so lengths and speeds measured in it are true enough. x runs
 * east, y north.
 */

/**
 * Where to fetch a network from. A URL with a scheme is taken as it is; a
 * path starting with "/" is on this origin; anything else is relative to the
 * app's base (`import.meta.env.BASE_URL`), the folder its `public/` is served
 * from.
 *
 * The last form is what a style shipped with the app writes. A style is plain
 * JSON and cannot know where the app is deployed: `/` on the dev server,
 * `/geoportal/` behind the deployed one. Relative to the base, the same style
 * finds its network in both, the same way the shadows find their draco decoder
 * (`ShadowTexture/shadow-texture-assets.ts`).
 */
export const resolveNetworkUrl = (
  url: string,
  base: string = import.meta.env.BASE_URL,
  origin: string = globalThis.location.origin
): string => {
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith("//")) return url;
  if (url.startsWith("/")) return new URL(url, origin).href;
  return new URL(url, new URL(base, origin)).href;
};

/** the Earth's radius MapLibre uses, so scene metres match its Mercator */
const EARTH_RADIUS = 6371008.8;

/** Web Mercator in MapLibre's units: 0..1 across the world, y downwards */
export const mercatorOf = (lon: number, lat: number): [number, number] => {
  const x = (180 + lon) / 360;
  const y =
    (180 -
      (180 / Math.PI) *
        Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) /
    360;
  return [x, y];
};

/** how many Mercator units one metre on the ground is at `lat` */
export const mercatorUnitsPerMeter = (lat: number): number =>
  1 / (2 * Math.PI * EARTH_RADIUS * Math.cos((lat * Math.PI) / 180));

export type TrafficNode = {
  index: number;
  /** the id from the data, or the rounded coordinates when it has none */
  key: string;
  /** scene metres */
  x: number;
  y: number;
  /** the edges that meet here, as indices; a loop is listed twice */
  edges: number[];
  /**
   * The network is cut off here: the road goes on beyond the clip, so a
   * vehicle arriving drives off the model and is gone.
   */
  exit: boolean;
};

export type TrafficEdge = {
  index: number;
  name: string;
  /** vehicles per day across both directions, as measured (2020 model) */
  bel: number;
  /** buses per day across both directions */
  bus: number;
  /** lanes per direction, at least 1 */
  lanes: number;
  /** node indices at the first and at the last point */
  from: number;
  to: number;
  /** x, y pairs in scene metres, in the order of the data */
  points: Float64Array;
  /** distance from the first point at every point, in metres */
  cumulative: Float64Array;
  length: number;
};

/** west, south, east, north in degrees */
export type LonLatBounds = [number, number, number, number];

export type TrafficNetwork = {
  edges: TrafficEdge[];
  nodes: TrafficNode[];
  /** lon/lat of the scene's origin */
  origin: [number, number];
  /** Mercator units per scene metre, the scale at the origin */
  unitsPerMeter: number;
  bounds: LonLatBounds;
  /** road length of all edges, in metres, one direction */
  totalLength: number;
};

type Position = [number, number];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toNumber = (value: unknown, fallback: number): number => {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number)
    ? number
    : fallback;
};

const isPosition = (value: unknown): value is Position =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === "number" &&
  typeof value[1] === "number" &&
  Number.isFinite(value[0]) &&
  Number.isFinite(value[1]);

/** a node id as the key it is found by; blank ids are none */
const idKey = (value: unknown): string | null =>
  (typeof value === "number" && Number.isFinite(value)) ||
  (typeof value === "string" && value.trim() !== "")
    ? `id:${String(value).trim()}`
    : null;

const coordinateKey = ([lon, lat]: Position): string =>
  `xy:${lon.toFixed(6)},${lat.toFixed(6)}`;

type RawSection = {
  name: string;
  bel: number;
  bus: number;
  lanes: number;
  fromKey: string;
  toKey: string;
  coordinates: Position[];
};

/** the sections of a feature: one per line, multi-lines split */
const sectionsOf = (feature: unknown): RawSection[] => {
  if (!isRecord(feature) || !isRecord(feature["geometry"])) return [];
  const geometry = feature["geometry"];
  const properties = isRecord(feature["properties"])
    ? feature["properties"]
    : {};
  const lines: unknown[] =
    geometry["type"] === "LineString"
      ? [geometry["coordinates"]]
      : geometry["type"] === "MultiLineString" &&
        Array.isArray(geometry["coordinates"])
      ? geometry["coordinates"]
      : [];
  const single = lines.length === 1;
  const sections: RawSection[] = [];
  for (const line of lines) {
    if (!Array.isArray(line)) continue;
    const coordinates = line.filter(isPosition).map(
      ([lon, lat]): Position => [lon, lat]
    );
    if (coordinates.length < 2) continue;
    // the ids name the ends of the whole section, which only a single line is
    const fromKey =
      (single ? idKey(properties["from"]) : null) ??
      coordinateKey(coordinates[0]);
    const toKey =
      (single ? idKey(properties["to"]) : null) ??
      coordinateKey(coordinates[coordinates.length - 1]);
    sections.push({
      name: typeof properties["name"] === "string" ? properties["name"] : "",
      bel: Math.max(0, toNumber(properties["bel"], 0)),
      bus: Math.max(0, toNumber(properties["bus"], 0)),
      lanes: Math.max(1, Math.round(toNumber(properties["lanes"], 1))),
      fromKey,
      toKey,
      coordinates,
    });
  }
  return sections;
};

/**
 * The graph of a network GeoJSON, or null when it holds no line.
 *
 * `exits` on the collection lists the node ids where the build cut the
 * network off. Without that list, every node with a single edge counts as one,
 * so a vehicle reaching the end of a road leaves rather than turning round.
 */
export const parseTrafficNetwork = (geojson: unknown): TrafficNetwork | null => {
  if (!isRecord(geojson)) return null;
  const features: unknown[] =
    geojson["type"] === "FeatureCollection" && Array.isArray(geojson["features"])
      ? geojson["features"]
      : geojson["type"] === "Feature"
      ? [geojson]
      : [];
  const sections = features.flatMap(sectionsOf);
  if (sections.length === 0) return null;

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const { coordinates } of sections) {
    for (const [lon, lat] of coordinates) {
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  const origin: [number, number] = [(west + east) / 2, (south + north) / 2];
  const [originX, originY] = mercatorOf(origin[0], origin[1]);
  const unitsPerMeter = mercatorUnitsPerMeter(origin[1]);
  const toScene = ([lon, lat]: Position): Position => {
    const [x, y] = mercatorOf(lon, lat);
    return [(x - originX) / unitsPerMeter, (originY - y) / unitsPerMeter];
  };

  const nodes: TrafficNode[] = [];
  const nodeIndex = new Map<string, number>();
  const nodeAt = (key: string, at: Position): number => {
    const known = nodeIndex.get(key);
    if (known !== undefined) return known;
    const [x, y] = toScene(at);
    const index = nodes.length;
    nodes.push({ index, key, x, y, edges: [], exit: false });
    nodeIndex.set(key, index);
    return index;
  };

  const edges: TrafficEdge[] = [];
  let totalLength = 0;
  for (const section of sections) {
    const { coordinates } = section;
    const points = new Float64Array(coordinates.length * 2);
    const cumulative = new Float64Array(coordinates.length);
    let length = 0;
    coordinates.forEach((coordinate, i) => {
      const [x, y] = toScene(coordinate);
      points[2 * i] = x;
      points[2 * i + 1] = y;
      if (i > 0) {
        length += Math.hypot(x - points[2 * i - 2], y - points[2 * i - 1]);
      }
      cumulative[i] = length;
    });
    // a section that rounds to a point has nowhere to drive
    if (length < 0.5) continue;
    const from = nodeAt(section.fromKey, coordinates[0]);
    const to = nodeAt(section.toKey, coordinates[coordinates.length - 1]);
    const index = edges.length;
    edges.push({
      index,
      name: section.name,
      bel: section.bel,
      bus: section.bus,
      lanes: section.lanes,
      from,
      to,
      points,
      cumulative,
      length,
    });
    nodes[from].edges.push(index);
    nodes[to].edges.push(index);
    totalLength += length;
  }
  if (edges.length === 0) return null;

  const listed = Array.isArray(geojson["exits"])
    ? new Set(
        (geojson["exits"] as unknown[])
          .map(idKey)
          .filter((key): key is string => key !== null)
      )
    : null;
  for (const node of nodes) {
    node.exit = listed ? listed.has(node.key) : node.edges.length === 1;
  }

  return {
    edges,
    nodes,
    origin,
    unitsPerMeter,
    bounds: [west, south, east, north],
    totalLength,
  };
};

/** where on the edge `along` metres from its first point is, and which way it runs */
export type EdgePose = {
  x: number;
  y: number;
  /** unit vector along the edge's point order */
  dx: number;
  dy: number;
};

/**
 * The point `along` metres from the edge's first point, with the direction of
 * the piece it lies on. Found by bisection over the cumulative lengths.
 */
export const edgePoseAt = (
  edge: TrafficEdge,
  along: number,
  out: EdgePose
): EdgePose => {
  const { points, cumulative } = edge;
  const last = cumulative.length - 1;
  const at = Math.max(0, Math.min(along, edge.length));
  let low = 0;
  let high = last;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (cumulative[middle] <= at) low = middle;
    else high = middle;
  }
  const x0 = points[2 * low];
  const y0 = points[2 * low + 1];
  const x1 = points[2 * high];
  const y1 = points[2 * high + 1];
  const piece = cumulative[high] - cumulative[low];
  const t = piece > 0 ? (at - cumulative[low]) / piece : 0;
  out.x = x0 + (x1 - x0) * t;
  out.y = y0 + (y1 - y0) * t;
  out.dx = piece > 0 ? (x1 - x0) / piece : 1;
  out.dy = piece > 0 ? (y1 - y0) / piece : 0;
  return out;
};
