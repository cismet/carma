/**
 * Builds the road graph of the `trafficAnimation` addon from OpenStreetMap:
 * the lines come from OSM, which draws the curves with more points than the
 * city's traffic model, and each road's daily load from the model section it
 * lies on. It sits next to `build-traffic-network.mjs` and reads that
 * script's network (`verkehrsnetz_modell.json`) for the loads, without
 * changing it.
 *
 * Roads: the `streets` layer of cismet's Shortbread vector tiles
 * (`OSM_TILES`, zoom 14, their highest), kinds motorway to living_street.
 * Service roads (driveways, parking aisles, yards) are left out. A tile holds
 * its roads cut at its border and reaching a little into its neighbours;
 * every line is cut back to its own tile's square, so a road crossing two
 * tiles meets itself again at the border. Then everything is cut to the
 * model's rectangle grown by the margin, and the points where a road leaves
 * it become the `exits`.
 *
 * Nodes: the ends of the pieces and the points several pieces share. OSM
 * joins roads at shared points, which in a tile have the very same
 * coordinates; the ends at the tile borders lie within a pixel or so of each
 * other and are merged within MERGE_PIXELS (a pixel is about 0.37 m). Where
 * two junctions come closer than MIN_EDGE_METERS they become one. A node where
 * only two roads meet (a tile border, or where OSM splits a road because a
 * tag changes) is dissolved and the two joined, so the graph has no tiny
 * edges; the addon drops an edge under half a metre, which would cut the
 * network there. OSM `oneway` roads get `"oneway": true`, `oneway_reverse`
 * ones are turned round first.
 *
 * Loads: every edge is sampled every SAMPLE_STEP_METERS, and at each sample
 * the nearest model section running about parallel within
 * MATCH_RADIUS_METERS votes; the section with most votes gives the edge its
 * name, lanes, `bel` and `bus`. The model counts a road's load across both
 * directions. A one-way edge gets half of it where the model drew a divided
 * road as one line down the middle, between OSM's two carriageways. Where the
 * model drew each carriageway as a section of its own (parts of the A 46),
 * that section's load is its carriageway's: 42605 on each where the single
 * line next to them says 84011. There, and on one-way streets and ramps, a
 * one-way edge gets all of it. A road no section
 * lies on gets bel 0, which the addon raises to its invented minimum, and its
 * OSM kind as name.
 *
 * The output has the format `build-traffic-network.mjs` writes, so the addon
 * reads it unchanged; the node ids are numbers of this build.
 *
 * Usage:
 *   node scripts/geodata/build-traffic-network-osm.mjs [model.json] [target.json] [marginMeters]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

import {
  CAR_KINDS,
  OSM_ZOOM,
  fetchOsmStreets,
  lonLatToPixel,
  pixelToLonLat,
} from "./shortbread-tiles.mjs";
import { clipBounds } from "./traffic-model-area.mjs";

const DEFAULT_MODEL =
  "apps/geoportal/public/assets/dz-b-prm/traffic/verkehrsnetz_modell.json";
const DEFAULT_TARGET =
  "apps/geoportal/public/assets/dz-b-prm/traffic/verkehrsnetz_osm.json";
const DEFAULT_MARGIN_METERS = 200;

const [
  ,
  ,
  modelPath = DEFAULT_MODEL,
  targetPath = DEFAULT_TARGET,
  marginArgument,
] = process.argv;
const marginMeters =
  marginArgument !== undefined ? Number(marginArgument) : DEFAULT_MARGIN_METERS;
if (!Number.isFinite(marginMeters) || marginMeters < 0) {
  console.error("marginMeters must be a number >= 0");
  process.exit(1);
}

/** the OSM kinds driven here: the car roads without the service roads */
const ROAD_KINDS = new Set([...CAR_KINDS].filter((kind) => kind !== "service"));
/** piece ends this close to another point are the same node, in tile pixels */
const MERGE_PIXELS = 1.5;
/** junctions closer than this become one */
const MIN_EDGE_METERS = 1;
/** an edge is looked at every this many metres */
const SAMPLE_STEP_METERS = 5;
/** the share of an edge left out at either end, where roads crowd together */
const SAMPLE_END_SHARE = 0.15;
/** how far off a model section may be and still count, in metres */
const MATCH_RADIUS_METERS = 20;
/** how far off parallel, either way round */
const MATCH_MAX_ANGLE_DEGREES = 35;
/** the share of an edge's samples its section needs, or the edge has none */
const MIN_VOTE_SHARE = 0.25;
/** grid cell of the segment indexes, in metres */
const GRID_METERS = 50;

// ------------------------------------------------------------------ clipping

/** the part of the segment a-b inside the box as [t0, t1] along it, or null */
const clipSegment = (a, b, [minX, minY, maxX, maxY]) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const edges = [
    [-dx, a[0] - minX],
    [dx, maxX - a[0]],
    [-dy, a[1] - minY],
    [dy, maxY - a[1]],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return [t0, t1];
};

const pointAt = (a, b, t) =>
  t === 0 ? a : t === 1 ? b : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/**
 * The pieces of `line` inside the box [minX, minY, maxX, maxY], each
 * { points, cutStart, cutEnd }: a cut end is where the box cut the line, not
 * where the line ended.
 */
const clipLine = (line, box) => {
  const pieces = [];
  let piece = null;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    const span = clipSegment(a, b, box);
    // outside, or touching the box in a single point
    if (!span || span[1] <= span[0]) {
      if (piece) {
        piece.cutEnd = true;
        pieces.push(piece);
        piece = null;
      }
      continue;
    }
    const [t0, t1] = span;
    if (!piece) {
      piece = { points: [pointAt(a, b, t0)], cutStart: i > 0 || t0 > 0, cutEnd: false };
    }
    piece.points.push(pointAt(a, b, t1));
    if (t1 < 1) {
      piece.cutEnd = true;
      pieces.push(piece);
      piece = null;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
};

// --------------------------------------------------------------------- graph

const createUnionFind = () => {
  const parent = [];
  return {
    add: () => parent.push(parent.length) - 1,
    find: (i) => {
      let root = i;
      while (parent[root] !== root) root = parent[root];
      for (let at = i; parent[at] !== root; ) {
        const next = parent[at];
        parent[at] = root;
        at = next;
      }
      return root;
    },
    union(a, b) {
      const rootA = this.find(a);
      const rootB = this.find(b);
      if (rootA !== rootB) parent[rootB] = rootA;
      return rootA;
    },
  };
};

/** a grid of points or segments, looked up by the cells a box touches */
const createGrid = (cell) => {
  const cells = new Map();
  const keysOf = (minX, minY, maxX, maxY) => {
    const keys = [];
    for (let gx = Math.floor(minX / cell); gx <= Math.floor(maxX / cell); gx++) {
      for (let gy = Math.floor(minY / cell); gy <= Math.floor(maxY / cell); gy++) {
        keys.push(`${gx},${gy}`);
      }
    }
    return keys;
  };
  return {
    add(item, minX, minY, maxX, maxY) {
      for (const key of keysOf(minX, minY, maxX, maxY)) {
        const list = cells.get(key);
        if (list) list.push(item);
        else cells.set(key, [item]);
      }
    },
    near(x, y, reach) {
      const found = new Set();
      for (const key of keysOf(x - reach, y - reach, x + reach, y + reach)) {
        for (const item of cells.get(key) ?? []) found.add(item);
      }
      return found;
    },
  };
};

/**
 * Distance from (x, y) to the segment a-b, the segment's point nearest to it
 * (px, py) and the segment's unit direction.
 */
const toSegment = (x, y, [ax, ay], [bx, by]) => {
  const sx = bx - ax;
  const sy = by - ay;
  const length = Math.hypot(sx, sy);
  if (length === 0) {
    return { distance: Math.hypot(x - ax, y - ay), px: ax, py: ay, ux: 1, uy: 0 };
  }
  const t = Math.max(0, Math.min(1, ((x - ax) * sx + (y - ay) * sy) / length ** 2));
  const px = ax + t * sx;
  const py = ay + t * sy;
  return {
    distance: Math.hypot(x - px, y - py),
    px,
    py,
    ux: sx / length,
    uy: sy / length,
  };
};

const pixelLength = (points) => {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return sum;
};

/** points every `step` over the middle of `points`, each with its unit direction */
const samplesOf = (points, step) => {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(
      cumulative[i - 1] +
        Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
    );
  }
  const length = cumulative[cumulative.length - 1];
  const first = length * SAMPLE_END_SHARE;
  const last = length * (1 - SAMPLE_END_SHARE);
  // a short edge still gets its middle
  const at = [];
  for (let along = first; along <= last; along += step) at.push(along);
  if (at.length === 0) at.push(length / 2);
  const samples = [];
  let piece = 0;
  for (const along of at) {
    while (piece < points.length - 2 && cumulative[piece + 1] < along) piece++;
    const span = cumulative[piece + 1] - cumulative[piece];
    if (span <= 0) continue;
    const t = (along - cumulative[piece]) / span;
    const [x0, y0] = points[piece];
    const [x1, y1] = points[piece + 1];
    samples.push({
      x: x0 + (x1 - x0) * t,
      y: y0 + (y1 - y0) * t,
      dx: (x1 - x0) / span,
      dy: (y1 - y0) / span,
    });
  }
  return samples;
};

// ---------------------------------------------------------------------- run

const model = JSON.parse(readFileSync(modelPath, "utf8"));
const box = clipBounds(marginMeters);
const [west, south, east, north] = box;
const osm = await fetchOsmStreets(box, OSM_ZOOM);
const extent = osm.streets[0]?.tile.extent ?? 4096;
if (osm.streets.some(({ tile }) => tile.extent !== extent)) {
  throw new Error("the OSM tiles do not all have the same extent");
}
const toPixel = (lonLat) => lonLatToPixel(lonLat, OSM_ZOOM, extent);
const [minX, minY] = toPixel([west, north]);
const [maxX, maxY] = toPixel([east, south]);
const latitude = (south + north) / 2;
const metersPerPixel =
  (2 * Math.PI * 6378137 * Math.cos((latitude * Math.PI) / 180)) /
  (2 ** OSM_ZOOM * extent);
const pixels = (meters) => meters / metersPerPixel;

// the roads, cut to their tiles and to the model
const pieces = [];
let roadLines = 0;
for (const { properties, pixels: line, tile } of osm.streets) {
  if (!ROAD_KINDS.has(properties.kind)) continue;
  roadLines++;
  const square = [
    tile.x * extent,
    tile.y * extent,
    (tile.x + 1) * extent,
    (tile.y + 1) * extent,
  ];
  const driven = properties.oneway_reverse ? [...line].reverse() : line;
  for (const inTile of clipLine(driven, square)) {
    for (const { points, cutStart, cutEnd } of clipLine(inTile.points, [
      minX,
      minY,
      maxX,
      maxY,
    ])) {
      const unique = points.filter(
        (point, i) => i === 0 || point[0] !== points[i - 1][0] || point[1] !== points[i - 1][1]
      );
      if (unique.length < 2) continue;
      pieces.push({
        points: unique,
        exitStart: cutStart,
        exitEnd: cutEnd,
        kind: properties.kind,
        oneway: properties.oneway === true || properties.oneway_reverse === true,
        bridge: properties.bridge === true,
        tunnel: properties.tunnel === true,
      });
    }
  }
}

// every point of every piece, and which of them are the same node
const points = [];
const pieceOf = [];
const nodes = createUnionFind();
pieces.forEach((piece, index) => {
  piece.first = points.length;
  for (const point of piece.points) {
    points.push(point);
    pieceOf.push(index);
    nodes.add();
  }
  piece.last = points.length - 1;
});
const samePlace = new Map();
const pointGrid = createGrid(MERGE_PIXELS);
points.forEach(([x, y], id) => {
  const key = `${x},${y}`;
  const known = samePlace.get(key);
  if (known === undefined) samePlace.set(key, id);
  else nodes.union(known, id);
  pointGrid.add(id, x, y, x, y);
});
for (const piece of pieces) {
  for (const end of [piece.first, piece.last]) {
    const [x, y] = points[end];
    for (const other of pointGrid.near(x, y, MERGE_PIXELS)) {
      if (other === end) continue;
      const [ox, oy] = points[other];
      if (Math.hypot(ox - x, oy - y) <= MERGE_PIXELS) nodes.union(end, other);
    }
  }
}

/**
 * Per group of points: whether a piece ends there, whether several pieces
 * (or one piece twice) pass, whether it is an exit, and the points' sum for
 * the node's position.
 */
const groups = new Map();
points.forEach(([x, y], id) => {
  const root = nodes.find(id);
  const group = groups.get(root);
  if (!group) {
    groups.set(root, { piece: pieceOf[id], id, shared: false, end: false, exit: false, sx: x, sy: y, n: 1 });
    return;
  }
  if (group.piece !== pieceOf[id] || Math.abs(group.id - id) > 1) group.shared = true;
  group.sx += x;
  group.sy += y;
  group.n++;
});
let crossingsAcrossLevels = 0;
for (const piece of pieces) {
  const first = groups.get(nodes.find(piece.first));
  const last = groups.get(nodes.find(piece.last));
  first.end = true;
  last.end = true;
  if (piece.exitStart) first.exit = true;
  if (piece.exitEnd) last.exit = true;
}
const isNode = (root) => {
  const group = groups.get(root);
  return group.end || group.shared;
};
const positionOf = (root) => {
  const { sx, sy, n } = groups.get(root);
  return [sx / n, sy / n];
};

// shared points in the middle of a bridge or tunnel and a road at another level
for (const [root, group] of groups) {
  if (group.end || !group.shared) continue;
  const levels = new Set();
  for (const other of pointGrid.near(...positionOf(root), MERGE_PIXELS)) {
    if (nodes.find(other) !== root) continue;
    const { bridge, tunnel } = pieces[pieceOf[other]];
    levels.add(bridge ? "bridge" : tunnel ? "tunnel" : "ground");
  }
  if (levels.size > 1) crossingsAcrossLevels++;
}

// the pieces cut at their nodes into edges
let edges = [];
for (const piece of pieces) {
  const { kind, oneway } = piece;
  let from = nodes.find(piece.first);
  let line = [positionOf(from)];
  for (let id = piece.first + 1; id <= piece.last; id++) {
    const root = nodes.find(id);
    if (!isNode(root)) {
      line.push(points[id]);
      continue;
    }
    // still at the node the edge started from
    if (root === from && line.length === 1) continue;
    line.push(positionOf(root));
    edges.push({ from, to: root, points: line, kind, oneway });
    from = root;
    line = [positionOf(root)];
  }
}

// junctions closer than MIN_EDGE_METERS become one
const positions = new Map();
for (const edge of edges) {
  positions.set(edge.from, edge.points[0]);
  positions.set(edge.to, edge.points[edge.points.length - 1]);
}
const exitNodes = new Set([...groups].filter(([, group]) => group.exit).map(([root]) => root));
let contracted = 0;
for (let round = 0; round < 10; round++) {
  let changed = false;
  const kept = [];
  for (const edge of edges) {
    edge.from = nodes.find(edge.from);
    edge.to = nodes.find(edge.to);
    if (pixelLength(edge.points) * metersPerPixel >= MIN_EDGE_METERS) {
      kept.push(edge);
      continue;
    }
    if (edge.from !== edge.to) {
      const root = nodes.union(edge.from, edge.to);
      const other = root === edge.from ? edge.to : edge.from;
      if (exitNodes.has(other)) exitNodes.add(root);
    }
    contracted++;
    changed = true;
  }
  edges = kept;
  for (const edge of edges) {
    edge.from = nodes.find(edge.from);
    edge.to = nodes.find(edge.to);
    edge.points[0] = positions.get(edge.from);
    edge.points[edge.points.length - 1] = positions.get(edge.to);
  }
  if (!changed) break;
}
for (const node of [...exitNodes]) exitNodes.add(nodes.find(node));

// a node where only two roads meet is dissolved and the two joined
const incident = new Map();
const attach = (node, edge) => {
  const set = incident.get(node);
  if (set) set.add(edge);
  else incident.set(node, new Set([edge]));
};
for (const edge of edges) {
  attach(edge.from, edge);
  attach(edge.to, edge);
}
const reverse = (edge) => {
  edge.points.reverse();
  [edge.from, edge.to] = [edge.to, edge.from];
};
let joined = 0;
const queue = [...incident.keys()];
while (queue.length > 0) {
  const node = queue.pop();
  if (exitNodes.has(node)) continue;
  const around = incident.get(node);
  if (!around || around.size !== 2) continue;
  const [a, b] = around;
  if (a.from === a.to || b.from === b.to) continue;
  let first = a;
  let second = b;
  if (a.oneway || b.oneway) {
    if (!a.oneway || !b.oneway) continue;
    if (b.to === node && a.from === node) [first, second] = [b, a];
    else if (!(a.to === node && b.from === node)) continue;
  } else {
    if (a.to !== node) reverse(a);
    if (b.from !== node) reverse(b);
  }
  const longer =
    pixelLength(first.points) >= pixelLength(second.points) ? first : second;
  const merged = {
    from: first.from,
    to: second.to,
    points: [...first.points, ...second.points.slice(1)],
    kind: longer.kind,
    oneway: first.oneway,
  };
  for (const end of [first.from, first.to, second.from, second.to]) {
    incident.get(end).delete(first);
    incident.get(end).delete(second);
  }
  incident.delete(node);
  attach(merged.from, merged);
  attach(merged.to, merged);
  queue.push(merged.from, merged.to);
  joined++;
}
edges = [...new Set([...incident.values()].flatMap((set) => [...set]))];

// dead ends, and how close each is to another road
const segmentGrid = createGrid(pixels(GRID_METERS));
edges.forEach((edge, index) => {
  for (let i = 0; i + 1 < edge.points.length; i++) {
    const [ax, ay] = edge.points[i];
    const [bx, by] = edge.points[i + 1];
    segmentGrid.add(
      { edge: index, i },
      Math.min(ax, bx),
      Math.min(ay, by),
      Math.max(ax, bx),
      Math.max(ay, by)
    );
  }
});
const deadEnds = [];
for (const [node, around] of incident) {
  if (around.size !== 1 || exitNodes.has(node)) continue;
  const [edge] = around;
  if (edge.from === edge.to) continue;
  const [x, y] = positions.get(node);
  const own = edges.indexOf(edge);
  let nearest = Infinity;
  for (const { edge: index, i } of segmentGrid.near(x, y, pixels(10))) {
    if (index === own) continue;
    const { distance } = toSegment(x, y, edges[index].points[i], edges[index].points[i + 1]);
    nearest = Math.min(nearest, distance * metersPerPixel);
  }
  deadEnds.push({ node, kind: edge.kind, nearest, at: pixelToLonLat([x, y], OSM_ZOOM, extent) });
}

// ------------------------------------------------------------------- loads

const sections = model.features.map(({ properties, geometry }) => ({
  properties,
  points: geometry.coordinates.map(toPixel),
}));
const sectionGrid = createGrid(pixels(GRID_METERS));
sections.forEach(({ points: line }, index) => {
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, ay] = line[i];
    const [bx, by] = line[i + 1];
    sectionGrid.add(
      { section: index, i },
      Math.min(ax, bx),
      Math.min(ay, by),
      Math.max(ax, bx),
      Math.max(ay, by)
    );
  }
});
const minCos = Math.cos((MATCH_MAX_ANGLE_DEGREES * Math.PI) / 180);

/** the model section nearest to (x, y) running about parallel to (dx, dy), or null */
const nearestSection = (x, y, dx, dy) => {
  let best = null;
  for (const { section, i } of sectionGrid.near(x, y, pixels(MATCH_RADIUS_METERS))) {
    const line = sections[section].points;
    const { distance, ux, uy } = toSegment(x, y, line[i], line[i + 1]);
    if (distance > pixels(MATCH_RADIUS_METERS)) continue;
    const cos = ux * dx + uy * dy;
    if (Math.abs(cos) < minCos) continue;
    if (!best || distance < best.distance) best = { distance, section, sign: cos > 0 ? 1 : -1 };
  }
  return best;
};

/** the model section `edge` lies on, and whether it runs along it (1) or against (-1) */
const sectionOf = (edge) => {
  const samples = samplesOf(edge.points, pixels(SAMPLE_STEP_METERS));
  const votes = new Map();
  for (const { x, y, dx, dy } of samples) {
    const best = nearestSection(x, y, dx, dy);
    if (!best) continue;
    const vote = votes.get(best.section) ?? { count: 0, sign: 0 };
    vote.count++;
    vote.sign += best.sign;
    votes.set(best.section, vote);
  }
  let winner = null;
  for (const [section, vote] of votes) {
    if (!winner || vote.count > winner.count) winner = { section, ...vote };
  }
  if (!winner || winner.count < MIN_VOTE_SHARE * samples.length) return null;
  return { section: winner.section, sign: winner.sign >= 0 ? 1 : -1 };
};

for (const edge of edges) edge.match = sectionOf(edge);

/**
 * Whether the model drew `section` as one line for both carriageways of a
 * road OSM draws as two one-way ones. Along the section, the nearest one-way
 * OSM road in either direction is found; the nearer of the two is the one the
 * section lies on, and from the other the nearest model section is looked
 * up: when that is `section` itself, it carries both. Where the model drew each carriageway as a section
 * of its own (parts of the A 46), the other carriageway is nearer to its own
 * section; on a one-way street there is no other carriageway at all.
 */
const isCentreLine = (section) => {
  let both = 0;
  let apart = 0;
  for (const { x, y, dx, dy } of samplesOf(
    sections[section].points,
    pixels(SAMPLE_STEP_METERS)
  )) {
    let along = null;
    let against = null;
    for (const { edge: index, i } of segmentGrid.near(x, y, pixels(MATCH_RADIUS_METERS))) {
      const { points: line, oneway } = edges[index];
      if (!oneway) continue;
      const hit = toSegment(x, y, line[i], line[i + 1]);
      if (hit.distance > pixels(MATCH_RADIUS_METERS)) continue;
      const cos = hit.ux * dx + hit.uy * dy;
      if (Math.abs(cos) < minCos) continue;
      if (cos > 0 && (!along || hit.distance < along.distance)) along = hit;
      if (cos < 0 && (!against || hit.distance < against.distance)) against = hit;
    }
    if (!along || !against) continue;
    // the carriageway the section lies on is the nearer one
    const other = along.distance < against.distance ? against : along;
    const owner = nearestSection(other.px, other.py, dx, dy);
    if (owner?.section === section) both++;
    else apart++;
  }
  return both > 0 && both >= apart;
};

const centreLines = new Set();
for (const section of new Set(
  edges.filter(({ oneway, match }) => oneway && match).map(({ match }) => match.section)
)) {
  if (isCentreLine(section)) centreLines.add(section);
}

let halved = 0;
const features = [];
const nodeIds = new Map();
const idOf = (node) => {
  if (!nodeIds.has(node)) nodeIds.set(node, nodeIds.size + 1);
  return nodeIds.get(node);
};
const round6 = (value) => Math.round(value * 1e6) / 1e6;
for (const edge of edges) {
  const section = edge.match ? sections[edge.match.section].properties : null;
  let bel = section?.bel ?? 0;
  let bus = section?.bus ?? 0;
  if (edge.oneway && edge.match && centreLines.has(edge.match.section)) {
    bel = Math.round(bel / 2);
    bus = Math.round(bus / 2);
    halved++;
  }
  const coordinates = [];
  for (const point of edge.points) {
    const [lon, lat] = pixelToLonLat(point, OSM_ZOOM, extent);
    const next = [round6(lon), round6(lat)];
    const last = coordinates[coordinates.length - 1];
    if (!last || last[0] !== next[0] || last[1] !== next[1]) coordinates.push(next);
  }
  features.push({
    type: "Feature",
    properties: {
      name: section?.name || edge.kind,
      bel,
      bus,
      lanes: Math.max(1, section?.lanes ?? 1),
      from: idOf(edge.from),
      to: idOf(edge.to),
      ...(edge.oneway ? { oneway: true } : {}),
    },
    geometry: { type: "LineString", coordinates },
  });
}
const exits = [...exitNodes]
  .filter((node) => nodeIds.has(node))
  .map(idOf)
  .sort((a, b) => a - b);

const head = `{"type":"FeatureCollection","name":"${basename(
  targetPath,
  ".json"
)}","source":"OpenStreetMap (Shortbread tiles z${OSM_ZOOM}), loads from ${basename(
  modelPath
)}","marginMeters":${marginMeters},"exits":${JSON.stringify(exits)},"features":[\n`;
const body = features.map((feature) => JSON.stringify(feature)).join(",\n");
const output = `${head}${body}\n]}\n`;
writeFileSync(targetPath, output);

// ------------------------------------------------------------------- report

const metersOf = (coordinates) => {
  let sum = 0;
  for (let i = 0; i + 1 < coordinates.length; i++) {
    const [lon0, lat0] = coordinates[i];
    const [lon1, lat1] = coordinates[i + 1];
    const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
    sum += Math.hypot((lon1 - lon0) * kx, (lat1 - lat0) * 111320);
  }
  return sum;
};
const summary = (list) => {
  const km = list.reduce((sum, f) => sum + metersOf(f.geometry.coordinates), 0) / 1000;
  const vertices = list.reduce((sum, f) => sum + f.geometry.coordinates.length, 0);
  return { count: list.length, km, perKm: vertices / km };
};
const ours = summary(features);
const theirs = summary(model.features);
const matched = features.filter((_, index) => edges[index].match);
const matchedKm = summary(matched).km;
const oneways = features.filter((f) => f.properties.oneway);
const deadEndsWithin = (meters) => deadEnds.filter(({ nearest }) => nearest <= meters).length;

console.log(`OSM tiles read: ${osm.tiles} (${osm.streets.length} street lines, ${roadLines} car roads)`);
console.log(`clip box (lon/lat): ${box.map((v) => v.toFixed(6)).join(", ")}`);
console.log(`pieces after cutting to tiles and model: ${pieces.length}`);
console.log(`shared points between a bridge or tunnel and another level: ${crossingsAcrossLevels}`);
console.log(`edges under ${MIN_EDGE_METERS} m contracted: ${contracted}, two-road nodes dissolved: ${joined}`);
console.log(`edges: ${ours.count}, nodes: ${nodeIds.size}, exits: ${exits.length}`);
console.log(`road length: ${ours.km.toFixed(1)} km, ${ours.perKm.toFixed(0)} points per km`);
console.log(`model network: ${theirs.count} sections, ${theirs.km.toFixed(1)} km, ${theirs.perKm.toFixed(0)} points per km`);
console.log(
  `one-way edges: ${oneways.length}, halved on a divided road: ${halved} (model sections drawn down the middle: ${centreLines.size})`
);
console.log(
  `edges with a model load: ${matched.length} of ${features.length} (${((100 * matchedKm) / ours.km).toFixed(0)} % of the length)`
);
const unmatchedByKind = new Map();
features.forEach((feature, index) => {
  if (edges[index].match) return;
  const km = metersOf(feature.geometry.coordinates) / 1000;
  unmatchedByKind.set(edges[index].kind, (unmatchedByKind.get(edges[index].kind) ?? 0) + km);
});
console.log(
  `without a load, km by kind: ${[...unmatchedByKind]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, km]) => `${kind} ${km.toFixed(1)}`)
    .join(", ")}`
);
console.log(
  `dead ends: ${deadEnds.length}, another road within 2 m: ${deadEndsWithin(2)}, 5 m: ${deadEndsWithin(5)}, 10 m: ${deadEndsWithin(10)}`
);
for (const { kind, nearest, at } of deadEnds.filter(({ nearest }) => nearest <= 5)) {
  console.log(`  dead end ${kind} at ${at.map((v) => v.toFixed(6)).join(",")}, ${nearest.toFixed(1)} m from a road`);
}
console.log(`wrote ${targetPath} (${(output.length / 1024).toFixed(1)} KiB)`);
