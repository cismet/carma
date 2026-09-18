#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const dir = new URL("./", import.meta.url);
const raw = JSON.parse(
  await readFile(new URL("./wuppertal-corridors-osm.geojson", dir))
);
const waterRaw = JSON.parse(
  await readFile(new URL("./wuppertal-water-osm.json", dir))
);
const LOCAL_METERS_PER_LONGITUDE = 70000;
const LOCAL_METERS_PER_LATITUDE = 111000;
const MAX_TANGENT_STEP_METERS = 120;
const MAX_WATER_BANK_DISTANCE_METERS = 120;
const STREET_BANK_OFFSET_METERS = 12;
const CROSS_SECTION_SOURCE = {
  WATER: "water",
  ASSUMED_STREET: "assumed-street",
};

const key = (point) => point.map((number) => number.toFixed(7)).join(",");
const toLocal = ([longitude, latitude]) => ({
  x: longitude * LOCAL_METERS_PER_LONGITUDE,
  y: latitude * LOCAL_METERS_PER_LATITUDE,
});
const toCoordinate = ({ x, y }) => [
  x / LOCAL_METERS_PER_LONGITUDE,
  y / LOCAL_METERS_PER_LATITUDE,
];
const distance = (a, b) => {
  const localA = toLocal(a);
  const localB = toLocal(b);
  return Math.hypot(localA.x - localB.x, localA.y - localB.y);
};
const cross = (a, b) => a.x * b.y - a.y * b.x;

function connectedChain(features, predicate) {
  const edges = new Map();
  const add = (a, b, id) => {
    const from = key(a);
    if (!edges.has(from)) edges.set(from, []);
    edges.get(from).push({ to: key(b), a, b, id, w: distance(a, b) });
  };
  for (const feature of features.filter(predicate))
    for (
      let index = 1;
      index < feature.geometry.coordinates.length;
      index += 1
    ) {
      add(
        feature.geometry.coordinates[index - 1],
        feature.geometry.coordinates[index],
        feature.properties.osmWayId
      );
      add(
        feature.geometry.coordinates[index],
        feature.geometry.coordinates[index - 1],
        feature.properties.osmWayId
      );
    }
  const nodes = [...edges.keys()];
  const extremity = (direction) =>
    nodes.reduce(
      (candidate, node) =>
        Number(node.split(",")[0]) * direction <
        Number(candidate.split(",")[0]) * direction
          ? node
          : candidate,
      nodes[0]
    );
  const west = extremity(1),
    east = extremity(-1);
  const distances = new Map([[west, 0]]),
    previous = new Map(),
    queue = new Set(nodes);
  while (queue.size) {
    const current = [...queue].reduce((candidate, node) =>
      (distances.get(node) ?? Infinity) < (distances.get(candidate) ?? Infinity)
        ? node
        : candidate
    );
    queue.delete(current);
    if (current === east) break;
    for (const edge of edges.get(current) ?? [])
      if (
        distances.get(current) + edge.w <
        (distances.get(edge.to) ?? Infinity)
      ) {
        distances.set(edge.to, distances.get(current) + edge.w);
        previous.set(edge.to, [current, edge]);
      }
  }
  if (!previous.has(east))
    throw new Error("No exact-coordinate connected path");
  const chain = [];
  for (let node = east; node !== west; node = previous.get(node)[0])
    chain.push(previous.get(node)[1]);
  chain.reverse();
  const coordinates = [chain[0].a, ...chain.map((edge) => edge.b)];
  return {
    coordinates,
    wayIds: [...new Set(chain.map((edge) => edge.id))],
    connectedWays: new Set(chain.map((edge) => edge.id)).size,
    lengthMeters: distances.get(east),
    maxEdgeMeters: Math.max(...chain.map((edge) => edge.w)),
  };
}

const waterPolygons = waterRaw.payload.elements
  .filter((element) => element.type === "way" && element.geometry?.length >= 3)
  .map((element) => {
    const ring = element.geometry.map(({ lon, lat }) => [lon, lat]);
    if (key(ring[0]) !== key(ring.at(-1))) ring.push(ring[0]);
    return ring;
  });

function containsPoint(ring, point) {
  let contains = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index++
  ) {
    const [longitude, latitude] = ring[index];
    const [previousLongitude, previousLatitude] = ring[previous];
    if (
      latitude > point[1] !== previousLatitude > point[1] &&
      point[0] <
        ((previousLongitude - longitude) * (point[1] - latitude)) /
          (previousLatitude - latitude) +
          longitude
    )
      contains = !contains;
  }
  return contains;
}

function tangentAt(coordinates, index) {
  const current = toLocal(coordinates[index]);
  const previous = index > 0 ? toLocal(coordinates[index - 1]) : null;
  const next =
    index < coordinates.length - 1 ? toLocal(coordinates[index + 1]) : null;
  const canUsePrevious =
    previous &&
    Math.hypot(current.x - previous.x, current.y - previous.y) <=
      MAX_TANGENT_STEP_METERS;
  const canUseNext =
    next &&
    Math.hypot(next.x - current.x, next.y - current.y) <=
      MAX_TANGENT_STEP_METERS;
  const vector =
    canUsePrevious && canUseNext
      ? { x: next.x - previous.x, y: next.y - previous.y }
      : canUseNext
      ? { x: next.x - current.x, y: next.y - current.y }
      : canUsePrevious
      ? { x: current.x - previous.x, y: current.y - previous.y }
      : null;
  if (!vector) return null;
  const length = Math.hypot(vector.x, vector.y);
  return Number.isFinite(length) && length > 0
    ? { x: vector.x / length, y: vector.y / length }
    : null;
}

function waterBanks(point, tangent, polygon) {
  const origin = toLocal(point),
    normal = { x: -tangent.y, y: tangent.x },
    intersections = [];
  for (let index = 1; index < polygon.length; index += 1) {
    const start = toLocal(polygon[index - 1]),
      end = toLocal(polygon[index]);
    const segment = { x: end.x - start.x, y: end.y - start.y },
      denominator = cross(normal, segment);
    if (Math.abs(denominator) < 1e-9) continue;
    const fromOrigin = { x: start.x - origin.x, y: start.y - origin.y };
    const rayDistance = cross(fromOrigin, segment) / denominator;
    const segmentPosition = cross(fromOrigin, normal) / denominator;
    if (segmentPosition < 0 || segmentPosition > 1) continue;
    intersections.push({
      distance: rayDistance,
      coordinate: [
        polygon[index - 1][0] +
          (polygon[index][0] - polygon[index - 1][0]) * segmentPosition,
        polygon[index - 1][1] +
          (polygon[index][1] - polygon[index - 1][1]) * segmentPosition,
      ],
    });
  }
  const nearBank = intersections
    .filter(({ distance: rayDistance }) => rayDistance > 0)
    .sort((a, b) => a.distance - b.distance)[0];
  const farBank = intersections
    .filter(({ distance: rayDistance }) => rayDistance < 0)
    .sort((a, b) => b.distance - a.distance)[0];
  if (
    !nearBank ||
    !farBank ||
    nearBank.distance >= MAX_WATER_BANK_DISTANCE_METERS ||
    -farBank.distance >= MAX_WATER_BANK_DISTANCE_METERS
  )
    return null;
  return { nearBank: nearBank.coordinate, farBank: farBank.coordinate };
}

function crossSectionAt(coordinates, index) {
  const point = coordinates[index],
    tangent = tangentAt(coordinates, index);
  const polygon = waterPolygons.find((candidate) =>
    containsPoint(candidate, point)
  );
  if (tangent && polygon) {
    const banks = waterBanks(point, tangent, polygon);
    if (banks) return { ...banks, source: CROSS_SECTION_SOURCE.WATER };
  }
  const fallbackTangent = tangent ?? { x: 1, y: 0 },
    normal = { x: -fallbackTangent.y, y: fallbackTangent.x },
    origin = toLocal(point);
  return {
    nearBank: toCoordinate({
      x: origin.x + normal.x * STREET_BANK_OFFSET_METERS,
      y: origin.y + normal.y * STREET_BANK_OFFSET_METERS,
    }),
    farBank: toCoordinate({
      x: origin.x - normal.x * STREET_BANK_OFFSET_METERS,
      y: origin.y - normal.y * STREET_BANK_OFFSET_METERS,
    }),
    source: CROSS_SECTION_SOURCE.ASSUMED_STREET,
  };
}

const schwebebahn = connectedChain(
  raw.features,
  (feature) =>
    feature.properties.name === "Schwebebahn" &&
    !["yard", "siding", "spur"].includes(feature.properties.service)
);
schwebebahn.crossSections = schwebebahn.coordinates.map((_, index) =>
  crossSectionAt(schwebebahn.coordinates, index)
);
const street = connectedChain(
  raw.features,
  (feature) =>
    feature.properties.ref === "B 7" &&
    feature.geometry.coordinates.some(
      ([longitude]) => longitude >= 7.158 && longitude <= 7.195
    ) &&
    !["parking_aisle", "service"].includes(feature.properties.highway)
);
const output = {
  source: raw.properties,
  schwebebahn: {
    ...schwebebahn,
    sourceTag: "name=Schwebebahn; railway=monorail",
    completeness:
      "OSM-connected Vohwinkel-Oberbarmen main-course candidate; verify endpoints before measurement",
  },
  street: {
    ...street,
    sourceTag: "name=Friedrich-Engels-Allee; ref=B 7",
    completeness:
      "longest connected B7/Friedrich-Engels-Allee carriageway chain; not a traffic-volume claim",
  },
};
await writeFile(
  new URL("./wuppertal-camera-corridors.json", dir),
  `${JSON.stringify(output, null, 2)}\n`
);
const waterSections = schwebebahn.crossSections.filter(
  ({ source }) => source === CROSS_SECTION_SOURCE.WATER
).length;
console.log(
  `Derived Schwebebahn ${schwebebahn.connectedWays} ways / ${
    schwebebahn.coordinates.length
  } points; street ${street.connectedWays} ways / ${
    street.coordinates.length
  } points; water cross-sections ${waterSections}, assumed-street ${
    schwebebahn.crossSections.length - waterSections
  }`
);
