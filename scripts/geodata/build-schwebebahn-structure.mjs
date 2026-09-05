/**
 * Turns the projection-mapping Schwebebahn wireframes into the one compact
 * structure asset the `vehicleAnimation` addon draws the Gerüst from, flat
 * from above (the "roof" over the cars) and in 3D.
 *
 * Inputs are the city's two wireframes plus the ring the track script made:
 *
 *   - `1596_SchwebTrasse.json`: the two rail girders as 4950 two-point
 *     segments (chords at several heights, verticals, web diagonals). Every
 *     segment lies on the ring in plan, so the model holds no wind bracing
 *     between the rails and no portals: those are synthesised here from the
 *     ring, as X panels between the two rails.
 *   - `1596_SchwebStuetzen.json`: 160 supports, 89 376 segments. They are a
 *     handful of shapes placed many times (A-frames over the Wupper, arch
 *     portals over the street, anchor supports with spread legs), so each
 *     support is matched against the shapes seen so far and stored as a
 *     placement: position, rotation, mirror, shape index. Their heights sit
 *     about 90 m above the trasse's, and not by a constant, so every support
 *     is dropped until its top meets the trasse next to it.
 *   - the ring (`schwebebahn-trasse.json`) from `build-schwebebahn-track.mjs`.
 *
 * Output: one JSON with everything in a local metre frame around `origin`
 * (equirectangular, like the addon's own track math), z as the model has it.
 *
 * Usage:
 *   node scripts/geodata/build-schwebebahn-structure.mjs <trasse.json> <stuetzen.json> <ring.json> <target.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const [, , trassePath, stuetzenPath, ringPath, targetPath] = process.argv;
if (!trassePath || !stuetzenPath || !ringPath || !targetPath) {
  console.error(
    "usage: node build-schwebebahn-structure.mjs <trasse.json> <stuetzen.json> <ring.json> <target.json>"
  );
  process.exit(1);
}

const METERS_PER_LAT = 111320;
/** metres between two X panels of the wind bracing */
const BRACING_PANEL_METERS = 5;
/** the other rail is this close; anything farther is not a partner */
const RAIL_PAIR_MAX_METERS = 8;
/** the partner must be this far along the ring, or it is the same rail */
const RAIL_PAIR_MIN_ARC_METERS = 100;
/** a support this close to the trasse takes its height from it */
const SUPPORT_SNAP_RADIUS_METERS = 12;
/** two supports are the same shape when no point differs by more than this */
const SHAPE_MATCH_METERS = 0.1;

const round2 = (value) => Number(value.toFixed(2));

const collectSegments = (geojson) => {
  const out = [];
  const fromGeometry = (geometry) => {
    if (!geometry) return;
    if (geometry.type === "LineString") out.push(geometry.coordinates);
    if (geometry.type === "MultiLineString") out.push(...geometry.coordinates);
    if (geometry.type === "GeometryCollection") {
      geometry.geometries?.forEach(fromGeometry);
    }
  };
  const features =
    geojson.type === "FeatureCollection" ? geojson.features : [geojson];
  for (const feature of features) fromGeometry(feature.geometry ?? feature);
  return out;
};

/* ------------------------------------------------------------------ *
 *  Local frame
 * ------------------------------------------------------------------ */

const ringFeature = JSON.parse(readFileSync(ringPath, "utf8"));
const ring = ringFeature.geometry.coordinates;
const lons = ring.map((p) => p[0]);
const lats = ring.map((p) => p[1]);
const origin = [
  (Math.min(...lons) + Math.max(...lons)) / 2,
  (Math.min(...lats) + Math.max(...lats)) / 2,
];
const metersPerLon = METERS_PER_LAT * Math.cos((origin[1] * Math.PI) / 180);
const toLocal = (p) => [
  (p[0] - origin[0]) * metersPerLon,
  (p[1] - origin[1]) * METERS_PER_LAT,
  p[2] ?? 0,
];

/* ------------------------------------------------------------------ *
 *  Girders: the trasse wireframe as it is
 * ------------------------------------------------------------------ */

const trasseSegments = collectSegments(
  JSON.parse(readFileSync(trassePath, "utf8"))
)
  .filter((segment) => segment.length === 2)
  .map((segment) => segment.map(toLocal));

const girder = trasseSegments.flatMap(([a, b]) => [...a, ...b].map(round2));
const trassePoints = trasseSegments.flat();

/** highest trasse point within `radius` of (x, y), or null */
const topNear = (x, y, radius) => {
  let top = null;
  for (const p of trassePoints) {
    if (Math.hypot(p[0] - x, p[1] - y) <= radius && (top === null || p[2] > top)) {
      top = p[2];
    }
  }
  return top;
};

/* ------------------------------------------------------------------ *
 *  Wind bracing: X panels between the two rails, synthesised from the ring
 * ------------------------------------------------------------------ */

const ringLocal = ring.map(toLocal);
const cumulative = [0];
for (let i = 1; i < ringLocal.length; i++) {
  const a = ringLocal[i - 1];
  const b = ringLocal[i];
  cumulative.push(cumulative[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
}
const ringLength = cumulative[cumulative.length - 1];

const ringAt = (s) => {
  let low = 0;
  let high = cumulative.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (cumulative[middle] <= s) low = middle;
    else high = middle;
  }
  const a = ringLocal[low];
  const b = ringLocal[low + 1] ?? a;
  const span = cumulative[low + 1] - cumulative[low];
  const t = span > 0 ? (s - cumulative[low]) / span : 0;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
};

/** the nearest point on the other rail: far along the ring, close by in plan */
const partnerOf = (s, x, y) => {
  let best = null;
  let bestDistance = RAIL_PAIR_MAX_METERS;
  for (let i = 0; i + 1 < ringLocal.length; i++) {
    const a = ringLocal[i];
    const b = ringLocal[i + 1];
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const lengthSquared = abx * abx + aby * aby;
    const t =
      lengthSquared > 0
        ? Math.max(0, Math.min(1, ((x - a[0]) * abx + (y - a[1]) * aby) / lengthSquared))
        : 0;
    const arcAt = cumulative[i] + t * Math.sqrt(lengthSquared);
    const arc = Math.abs(arcAt - s);
    if (Math.min(arc, ringLength - arc) < RAIL_PAIR_MIN_ARC_METERS) continue;
    const px = a[0] + abx * t;
    const py = a[1] + aby * t;
    const d = Math.hypot(px - x, py - y);
    if (d < bestDistance) {
      bestDistance = d;
      best = { x: px, y: py, s: arcAt };
    }
  }
  return best;
};

const samples = [];
for (let s = 0; s < ringLength; s += BRACING_PANEL_METERS) {
  const [x, y] = ringAt(s);
  const partner = partnerOf(s, x, y);
  // each pair of rails is walked from both sides; keep the walk from the
  // lower arc position so every panel is emitted once
  if (partner === null || partner.s < s) {
    samples.push(null);
    continue;
  }
  const z = topNear(x, y, 4) ?? 0;
  samples.push({ a: [x, y, z], b: [partner.x, partner.y, z] });
}

const bracing = [];
const pushSegment = (target, a, b) => target.push(...a.map(round2), ...b.map(round2));
for (let i = 0; i + 1 < samples.length; i++) {
  const here = samples[i];
  const next = samples[i + 1];
  if (!here) continue;
  pushSegment(bracing, here.a, here.b);
  if (!next) continue;
  // the partner must move along its rail too; at a turnaround it does not
  if (Math.hypot(next.b[0] - here.b[0], next.b[1] - here.b[1]) > 2 * BRACING_PANEL_METERS) continue;
  pushSegment(bracing, here.a, next.b);
  pushSegment(bracing, next.a, here.b);
}

/* ------------------------------------------------------------------ *
 *  Supports: shapes and placements
 * ------------------------------------------------------------------ */

const supportFeatures = JSON.parse(readFileSync(stuetzenPath, "utf8")).features;

/** a support in its own frame: centroid at 0, principal axis along u, feet at w=0 */
const localise = (segments) => {
  const points = segments.flat();
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const cz = Math.min(...points.map((p) => p[2]));
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    const dx = p[0] - cx;
    const dy = p[1] - cy;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { cx, cy, cz, angle, segments };
};

/** the support's segments in the frame rotated by `angle`, optionally mirrored across u */
const inFrame = ({ cx, cy, cz, segments }, angle, mirror) => {
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  return segments.map((segment) =>
    segment.map((p) => {
      const dx = p[0] - cx;
      const dy = p[1] - cy;
      const v = dx * s + dy * c;
      return [dx * c - dy * s, mirror ? -v : v, p[2] - cz];
    })
  );
};

/** cell size the midpoints are hashed into when two supports are compared */
const SHAPE_CELL_METERS = 0.25;
const cellKey = (x, y, z) =>
  `${Math.round(x / SHAPE_CELL_METERS)},${Math.round(y / SHAPE_CELL_METERS)},${Math.round(z / SHAPE_CELL_METERS)}`;

/** segment midpoints, as a list and hashed into cells, for comparing two supports */
const signature = (segments) => {
  const midpoints = segments.map(([a, b]) => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    (a[2] + b[2]) / 2,
  ]);
  const cells = new Map();
  for (const p of midpoints) {
    const key = cellKey(p[0], p[1], p[2]);
    cells.set(key, [...(cells.get(key) ?? []), p]);
  }
  return { midpoints, cells };
};

/** whether every midpoint of A has one of B within the tolerance */
const sameShape = (sigA, sigB) => {
  if (sigA.midpoints.length !== sigB.midpoints.length) return false;
  for (const p of sigA.midpoints) {
    let found = false;
    const cx = Math.round(p[0] / SHAPE_CELL_METERS);
    const cy = Math.round(p[1] / SHAPE_CELL_METERS);
    const cz = Math.round(p[2] / SHAPE_CELL_METERS);
    for (let dx = -1; dx <= 1 && !found; dx++) {
      for (let dy = -1; dy <= 1 && !found; dy++) {
        for (let dz = -1; dz <= 1 && !found; dz++) {
          for (const q of sigB.cells.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
            if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= SHAPE_MATCH_METERS) {
              found = true;
              break;
            }
          }
        }
      }
    }
    if (!found) return false;
  }
  return true;
};

const shapes = [];
const supports = [];
const offsets = [];
let unsnapped = 0;

for (const feature of supportFeatures) {
  const segments = collectSegments(feature)
    .filter((segment) => segment.length === 2)
    .map((segment) => segment.map(toLocal));
  const local = localise(segments);

  let placed = null;
  for (const angle of [local.angle, local.angle + Math.PI]) {
    for (const mirror of [false, true]) {
      const framed = inFrame(local, angle, mirror);
      const sig = signature(framed);
      const index = shapes.findIndex((shape) => sameShape(shape.signature, sig));
      if (index !== -1) {
        placed = { angle, mirror, shape: index };
        break;
      }
    }
    if (placed) break;
  }
  if (!placed) {
    const framed = inFrame(local, local.angle, false);
    shapes.push({
      signature: signature(framed),
      height: Math.max(...framed.flat().map((p) => p[2])),
      segments: framed,
    });
    placed = { angle: local.angle, mirror: false, shape: shapes.length - 1 };
  }

  // the model's supports stand ~90 m above its trasse, and not by a constant
  // amount, so each one is lowered until its top meets the trasse beside it
  const shape = shapes[placed.shape];
  const top = topNear(local.cx, local.cy, SUPPORT_SNAP_RADIUS_METERS);
  let zBase;
  if (top !== null) {
    zBase = top - shape.height;
    offsets.push(local.cz - zBase);
  } else {
    unsnapped++;
    zBase = null;
  }
  supports.push({ x: local.cx, y: local.cy, zBase, angle: placed.angle, mirror: placed.mirror, shape: placed.shape });
}

offsets.sort((a, b) => a - b);
const medianOffset = offsets[Math.floor(offsets.length / 2)] ?? 0;
// a support with no trasse beside it gets the typical drop
for (const support of supports) {
  if (support.zBase === null || Number.isNaN(support.zBase)) {
    const feature = supportFeatures[supports.indexOf(support)];
    const cz = Math.min(...collectSegments(feature).flat().map((p) => p[2]));
    support.zBase = cz - medianOffset;
  }
}

/* ------------------------------------------------------------------ *
 *  Write
 * ------------------------------------------------------------------ */

const asset = {
  type: "SchwebebahnGeruest",
  version: 1,
  source: {
    trasse: basename(trassePath),
    supports: basename(stuetzenPath),
    ring: basename(ringPath),
  },
  origin: [Number(origin[0].toFixed(7)), Number(origin[1].toFixed(7))],
  metersPerLon: round2(metersPerLon),
  /** trasse wireframe segments: x, y, z, x, y, z, ... */
  girder,
  /** wind bracing between the rails, same layout */
  bracing,
  /** each shape: u, v, w, u, v, w, ... in the support's own frame, feet at w = 0 */
  supportShapes: shapes.map((shape) => shape.segments.flatMap(([a, b]) => [...a, ...b].map(round2))),
  /** placements: x, y, zBase, angle (radians, ccw from east), shape index, mirror (0/1) */
  supports: supports.map((s) => [round2(s.x), round2(s.y), round2(s.zBase), Number(s.angle.toFixed(5)), s.shape, s.mirror ? 1 : 0]),
};

writeFileSync(targetPath, `${JSON.stringify(asset)}\n`);
console.log(
  `girder ${trasseSegments.length} segments, bracing ${bracing.length / 6} segments, ` +
    `${supports.length} supports as ${shapes.length} shapes (${shapes
      .map((shape) => shape.segments.length)
      .join("/")} segments), ${unsnapped} without trasse nearby (median drop ${medianOffset.toFixed(2)} m) -> ${targetPath}`
);
