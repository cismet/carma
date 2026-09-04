/**
 * Turns the projection-mapping Schwebebahn wireframe into one ordered polyline
 * the `vehicleAnimation` addon can drive along.
 *
 * The source (`1596_SchwebTrasse.json`) is a 3D wireframe of the track
 * structure: 4950 two-point segments, in arbitrary order, containing every
 * edge several times at different heights plus ~825 vertical struts that
 * collapse to a point once the z is dropped. What is wanted from it is the
 * horizontal centre line, so the script
 *
 *   1. drops the z and de-duplicates segments by their xy signature,
 *   2. throws away the zero-length ones (the struts),
 *   3. stitches the rest end-to-start into chains,
 *   4. keeps the longest chain, which is the closed out-and-back ring of the
 *      trasse (~9 km: roughly 4.5 km on each of the two rails).
 *
 * Usage:
 *   node scripts/geodata/build-schwebebahn-track.mjs <source.json> <target.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const [, , sourcePath, targetPath] = process.argv;
if (!sourcePath || !targetPath) {
  console.error(
    "usage: node build-schwebebahn-track.mjs <source.json> <target.json>"
  );
  process.exit(1);
}

/** meters per degree, equirectangular around the given latitude */
const metersPerDegree = (lat) => ({
  lon: 111320 * Math.cos((lat * Math.PI) / 180),
  lat: 111320,
});

const distance = (a, b) => {
  const scale = metersPerDegree(a[1]);
  return Math.hypot((b[0] - a[0]) * scale.lon, (b[1] - a[1]) * scale.lat);
};

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
  if (geojson.type === "FeatureCollection") {
    geojson.features.forEach((feature) => fromGeometry(feature.geometry));
  } else if (geojson.type === "Feature") {
    fromGeometry(geojson.geometry);
  } else {
    fromGeometry(geojson);
  }
  return out;
};

const pointKey = (point) => `${point[0].toFixed(8)},${point[1].toFixed(8)}`;
const lineKey = (line) => line.map(pointKey).join("|");

const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const rawSegments = collectSegments(source);

const seen = new Set();
const segments = [];
for (const segment of rawSegments) {
  const forward = lineKey(segment);
  const backward = lineKey([...segment].reverse());
  if (seen.has(forward) || seen.has(backward)) continue;
  seen.add(forward);
  // a strut is vertical, so in xy it is a single point and carries no route
  if (forward === backward || pointKey(segment[0]) === pointKey(segment.at(-1)))
    continue;
  segments.push(segment);
}

const endpoints = new Map();
segments.forEach((segment, index) => {
  for (const point of [segment[0], segment.at(-1)]) {
    const key = pointKey(point);
    endpoints.set(key, [...(endpoints.get(key) ?? []), index]);
  }
});

const used = new Array(segments.length).fill(false);
const chains = [];
for (let index = 0; index < segments.length; index++) {
  if (used[index]) continue;
  used[index] = true;
  let chain = [...segments[index]];

  const extend = (atEnd) => {
    for (;;) {
      const anchor = pointKey(atEnd ? chain.at(-1) : chain[0]);
      const next = (endpoints.get(anchor) ?? []).find((i) => !used[i]);
      if (next === undefined) return;
      const segment = segments[next];
      used[next] = true;
      const forward = pointKey(segment[0]) === anchor;
      const tail = forward ? segment.slice(1) : [...segment].reverse().slice(1);
      chain = atEnd ? [...chain, ...tail] : [...[...tail].reverse(), ...chain];
    }
  };
  extend(true);
  extend(false);

  let length = 0;
  for (let i = 1; i < chain.length; i++) length += distance(chain[i - 1], chain[i]);
  chains.push({ chain, length });
}

chains.sort((a, b) => b.length - a.length);
const [longest] = chains;
if (!longest) {
  console.error("no line geometry in", sourcePath);
  process.exit(1);
}

// ~1 cm horizontally, 10 cm vertically; anything finer is noise from the model
const round = (point) => [
  Number(point[0].toFixed(7)),
  Number(point[1].toFixed(7)),
  ...(point.length > 2 ? [Number(point[2].toFixed(1))] : []),
];

const track = {
  type: "Feature",
  properties: {
    name: "Schwebebahn Trasse",
    source: basename(sourcePath),
    lengthMeters: Math.round(longest.length),
  },
  geometry: { type: "LineString", coordinates: longest.chain.map(round) },
};

writeFileSync(targetPath, `${JSON.stringify(track)}\n`);
console.log(
  `${segments.length} segments -> ${chains.length} chains; kept ${
    longest.chain.length
  } points, ${Math.round(longest.length)} m -> ${targetPath}`
);
