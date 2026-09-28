/**
 * Turns the city's traffic load network ("Verkehrsbelastung Wuppertal 2020")
 * into the road graph the `trafficAnimation` addon drives its vehicles on.
 *
 * The source is an Esri shapefile of 16,821 polylines in EPSG:25832, one per
 * road section between two nodes of the city's traffic model, with the daily
 * load of the section as attributes:
 *
 *   STR_NAME   street name
 *   QUERS_BEL  vehicles per day across the whole cross-section, both directions
 *   QUERS_BUS  buses per day across the cross-section, both directions
 *   STR_SPUR   lanes
 *   KNO_VON    node the section starts at
 *   KNO_NACH   node it ends at
 *
 * Only the printed zoo model is wanted, so the script keeps every section that
 * touches the model's rectangle grown by a margin (200 m by default), whole:
 * nothing is cut, a section reaching out of the rectangle keeps its far end.
 * The margin gives a vehicle leaving the model somewhere to go before it
 * disappears, instead of vanishing at the model's edge.
 *
 * A node where the clipped network ends although the full one goes on is
 * listed in the output's `exits`: a vehicle reaching it drives off the model
 * and is gone. Every other node with a single section is a real dead end,
 * where the addon lets a vehicle turn round.
 *
 * The traffic model does not say which way a section may be driven: KNO_VON
 * and KNO_NACH are not the driving direction, not even on the motorway ramps.
 * The directions are taken from OpenStreetMap instead, read from the
 * Shortbread vector tiles cismet serves (`OSM_TILES`). Every section is laid
 * over the OSM roads, and where the OSM road it lies on is one-way, the
 * section gets `"oneway": true` and its line is turned, `from` and `to`
 * with it, to run the way it is driven. Its load stays whole, the addon
 * sends all of it one way: where the model draws a divided road as two
 * sections, each carries its own carriageway's load (Gustav-Freitag-Platz:
 * 449 and 759, together the 1208 of Flieth at their end), not the
 * cross-section's twice. A section leading into a dead end stays two-way, so
 * vehicles turn round there instead of vanishing mid-street. A one-way
 * section with no lane count (STR_SPUR 0) takes that of the same road where
 * it joins it. The
 * report lists the ramps apart, a ramp being a section whose name says so
 * (Auffahrt, Abfahrt, Ausfahrt, Zufahrt, Kreuz) or which lies mostly on OSM
 * links.
 *
 * There is no GDAL on every machine this runs on, so the shapefile is read by
 * hand (PolyLine, PolyLineZ and PolyLineM records, dBase III attributes in the
 * encoding the .cpg names) and reprojected with proj4, and the vector tiles
 * are decoded by hand too. The output is GeoJSON in WGS84 with 6 decimals
 * (about 10 cm), one feature per line:
 *
 *   { "type": "FeatureCollection", "exits": [...node ids],
 *     "features": [{ "type": "Feature",
 *       "properties": { "name", "bel", "bus", "lanes", "from", "to", "oneway"? },
 *       "geometry": { "type": "LineString", "coordinates": [...] } }] }
 *
 * The loads are the 2020 model values and are not changed here; what the
 * addon makes of them over the day is its own (invented) profile.
 *
 * Usage:
 *   node scripts/geodata/build-traffic-network.mjs [source.shp] [target.json] [marginMeters]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import proj4 from "proj4";

import { CAR_KINDS, OSM_ZOOM, fetchOsmStreets } from "./shortbread-tiles.mjs";
import { clipBounds } from "./traffic-model-area.mjs";

const DEFAULT_SOURCE =
  "/Users/thorsten/dev/maintenance/wupp-tiling-pipeline/_in/verkehrsbelastung_2020/shp/Verkehrsbelastung_Wuppertal_2020.shp";
const DEFAULT_TARGET =
  "apps/geoportal/public/assets/dz-b-prm/traffic/verkehrsnetz_modell.json";
const DEFAULT_MARGIN_METERS = 200;

const [
  ,
  ,
  sourcePath = DEFAULT_SOURCE,
  targetPath = DEFAULT_TARGET,
  marginArgument,
] = process.argv;
const marginMeters =
  marginArgument !== undefined ? Number(marginArgument) : DEFAULT_MARGIN_METERS;
if (!Number.isFinite(marginMeters) || marginMeters < 0) {
  console.error("marginMeters must be a number >= 0");
  process.exit(1);
}

proj4.defs(
  "EPSG:25832",
  "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
);
const toWgs84 = proj4("EPSG:25832", "EPSG:4326");

// ---------------------------------------------------------------- shapefile

/** shape types whose records start like a PolyLine's: box, parts, points */
const POLYLINE_TYPES = new Set([3, 13, 23]);

/**
 * The polylines of a .shp, one array of parts per record, each part an array
 * of [x, y]. A null shape (type 0) gives an empty array, so the record index
 * stays aligned with the .dbf. Z and M values are skipped.
 */
const readShp = (buffer) => {
  const fileLength = buffer.readInt32BE(24) * 2;
  const shapeType = buffer.readInt32LE(32);
  if (!POLYLINE_TYPES.has(shapeType)) {
    throw new Error(`not a polyline shapefile (shape type ${shapeType})`);
  }
  const records = [];
  let offset = 100;
  while (offset + 8 <= fileLength) {
    const contentLength = buffer.readInt32BE(offset + 4) * 2;
    const content = offset + 8;
    const type = buffer.readInt32LE(content);
    if (type === 0) {
      records.push([]);
    } else if (POLYLINE_TYPES.has(type)) {
      const numParts = buffer.readInt32LE(content + 36);
      const numPoints = buffer.readInt32LE(content + 40);
      const partStarts = [];
      for (let i = 0; i < numParts; i++) {
        partStarts.push(buffer.readInt32LE(content + 44 + 4 * i));
      }
      const pointsAt = content + 44 + 4 * numParts;
      const parts = partStarts.map((start, i) => {
        const end = i + 1 < numParts ? partStarts[i + 1] : numPoints;
        const part = [];
        for (let p = start; p < end; p++) {
          part.push([
            buffer.readDoubleLE(pointsAt + 16 * p),
            buffer.readDoubleLE(pointsAt + 16 * p + 8),
          ]);
        }
        return part;
      });
      records.push(parts);
    } else {
      throw new Error(`unexpected shape type ${type} at byte ${offset}`);
    }
    offset = content + contentLength;
  }
  return records;
};

/**
 * The rows of a dBase III table as plain objects. Numeric fields become
 * numbers (null when blank), everything else trimmed strings. Deleted rows
 * are kept as null so the index still matches the .shp.
 */
const readDbf = (buffer, encoding) => {
  const recordCount = buffer.readUInt32LE(4);
  const headerLength = buffer.readUInt16LE(8);
  const recordLength = buffer.readUInt16LE(10);
  const decoder = new TextDecoder(encoding);
  const fields = [];
  let fieldOffset = 1;
  for (let at = 32; at < headerLength - 1 && buffer[at] !== 0x0d; at += 32) {
    const nameBytes = buffer.subarray(at, at + 11);
    const nameEnd = nameBytes.indexOf(0);
    const name = decoder.decode(
      nameEnd >= 0 ? nameBytes.subarray(0, nameEnd) : nameBytes
    );
    const type = String.fromCharCode(buffer[at + 11]);
    const length = buffer[at + 16];
    fields.push({ name, type, offset: fieldOffset, length });
    fieldOffset += length;
  }
  const rows = [];
  for (let index = 0; index < recordCount; index++) {
    const start = headerLength + index * recordLength;
    if (buffer[start] === 0x2a) {
      rows.push(null);
      continue;
    }
    const row = {};
    for (const field of fields) {
      const raw = decoder
        .decode(
          buffer.subarray(
            start + field.offset,
            start + field.offset + field.length
          )
        )
        .trim();
      if (field.type === "N" || field.type === "F") {
        const value = raw === "" ? null : Number(raw);
        row[field.name] = Number.isFinite(value) ? value : null;
      } else {
        row[field.name] = raw;
      }
    }
    rows.push(row);
  }
  return { fields, rows };
};

// ------------------------------------------------------------------ clipping

const inside = ([x, y], [west, south, east, north]) =>
  x >= west && x <= east && y >= south && y <= north;

/** whether the segment a-b crosses the box, Liang-Barsky style */
const segmentHitsBox = (a, b, box) => {
  if (inside(a, box) || inside(b, box)) return true;
  const [west, south, east, north] = box;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const edges = [
    [-dx, a[0] - west],
    [dx, east - a[0]],
    [-dy, a[1] - south],
    [dy, north - a[1]],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return true;
};

const lineHitsBox = (line, box) => {
  if (line.length === 1) return inside(line[0], box);
  for (let i = 0; i + 1 < line.length; i++) {
    if (segmentHitsBox(line[i], line[i + 1], box)) return true;
  }
  return false;
};

// ---------------------------------------------------- driving direction

/** a section named like this is a ramp; so is one lying mostly on OSM links */
const RAMP_NAME = /(auf|ab|aus|zu)fahrt|kreuz/i;
/** a section is looked at every this many metres */
const SAMPLE_STEP_METERS = 5;
/** the share of a section left out at either end, where roads crowd together */
const SAMPLE_END_SHARE = 0.15;
/** how far off an OSM road may be and still count, in metres */
const MATCH_RADIUS_METERS = 30;
/** how far off parallel, either way round */
const MATCH_MAX_ANGLE_DEGREES = 35;
/** the share of a section's samples that must agree on one direction */
const ONEWAY_AGREEMENT = 0.75;
/** a shorter section, with fewer samples, stays two-way */
const MIN_SAMPLES = 3;
/** grid cell of the segment index, in metres */
const GRID_METERS = 50;

/**
 * Which way OSM drives a section: 1 along its line, -1 against it, 0 both or
 * unknown; and whether it is a ramp.
 *
 * The section is sampled along its middle. At each sample the nearest OSM car
 * road running about parallel decides: two-way, or one-way along or against
 * the section. Ramps of opposite direction often run side by side a few
 * metres apart, and where OSM splits a road into two carriageways and the
 * city drew one line, that line lies between them; so a one-way sample only
 * counts when no road going another way is nearly as close. The section is
 * one-way when most of its samples say the same direction.
 */
const createDirectionMatcher = (streets, latitude) => {
  const kx = 111320 * Math.cos((latitude * Math.PI) / 180);
  const ky = 111320;
  const toLocal = ([lon, lat]) => [lon * kx, lat * ky];

  const segments = [];
  const grid = new Map();
  const cellsOf = (ax, ay, bx, by, reach) => {
    const cells = [];
    for (
      let gx = Math.floor((Math.min(ax, bx) - reach) / GRID_METERS);
      gx <= Math.floor((Math.max(ax, bx) + reach) / GRID_METERS);
      gx++
    ) {
      for (
        let gy = Math.floor((Math.min(ay, by) - reach) / GRID_METERS);
        gy <= Math.floor((Math.max(ay, by) + reach) / GRID_METERS);
        gy++
      ) {
        cells.push(`${gx},${gy}`);
      }
    }
    return cells;
  };
  for (const { properties, line } of streets) {
    if (!CAR_KINDS.has(properties.kind)) continue;
    const oneway = properties.oneway_reverse ? -1 : properties.oneway ? 1 : 0;
    const link = properties.link === true;
    const points = line.map(toLocal);
    for (let i = 0; i + 1 < points.length; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[i + 1];
      if (ax === bx && ay === by) continue;
      const index = segments.length;
      segments.push({ ax, ay, bx, by, oneway, link });
      for (const cell of cellsOf(ax, ay, bx, by, 0)) {
        const list = grid.get(cell);
        if (list) list.push(index);
        else grid.set(cell, [index]);
      }
    }
  }

  const nearby = (x, y) => {
    const found = new Set();
    for (const cell of cellsOf(x, y, x, y, MATCH_RADIUS_METERS)) {
      for (const index of grid.get(cell) ?? []) found.add(index);
    }
    return found;
  };

  /** points every SAMPLE_STEP_METERS over the middle, each with its unit direction */
  const samplesOf = (coordinates) => {
    const points = coordinates.map(toLocal);
    const cumulative = [0];
    for (let i = 1; i < points.length; i++) {
      cumulative.push(
        cumulative[i - 1] +
          Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
      );
    }
    const length = cumulative[cumulative.length - 1];
    const samples = [];
    let piece = 0;
    for (
      let at = length * SAMPLE_END_SHARE;
      at <= length * (1 - SAMPLE_END_SHARE);
      at += SAMPLE_STEP_METERS
    ) {
      while (piece < points.length - 2 && cumulative[piece + 1] < at) piece++;
      const span = cumulative[piece + 1] - cumulative[piece];
      if (span <= 0) continue;
      const t = (at - cumulative[piece]) / span;
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

  const minCos = Math.cos((MATCH_MAX_ANGLE_DEGREES * Math.PI) / 180);

  return (coordinates) => {
    const samples = samplesOf(coordinates);
    let along = 0;
    let against = 0;
    let onLinks = 0;
    for (const { x, y, dx, dy } of samples) {
      const candidates = [];
      for (const index of nearby(x, y)) {
        const { ax, ay, bx, by, oneway, link } = segments[index];
        const sx = bx - ax;
        const sy = by - ay;
        const length2 = sx * sx + sy * sy;
        const t = Math.max(0, Math.min(1, ((x - ax) * sx + (y - ay) * sy) / length2));
        const distance = Math.hypot(x - ax - t * sx, y - ay - t * sy);
        if (distance > MATCH_RADIUS_METERS) continue;
        const cos = (sx * dx + sy * dy) / Math.sqrt(length2);
        if (Math.abs(cos) < minCos) continue;
        const sign = oneway === 0 ? 0 : cos * oneway > 0 ? 1 : -1;
        candidates.push({ distance, sign, link });
      }
      if (candidates.length === 0) continue;
      candidates.sort((a, b) => a.distance - b.distance);
      const [nearest] = candidates;
      if (nearest.link) onLinks++;
      if (nearest.sign === 0) continue;
      const rivalled = candidates.some(
        ({ distance, sign }) =>
          sign !== nearest.sign && distance < 1.5 * nearest.distance + 1
      );
      if (rivalled) continue;
      if (nearest.sign > 0) along++;
      else against++;
    }
    const count = samples.length;
    const direction =
      count < MIN_SAMPLES
        ? 0
        : along >= ONEWAY_AGREEMENT * count
        ? 1
        : against >= ONEWAY_AGREEMENT * count
        ? -1
        : 0;
    return { direction, onLinks: count > 0 && onLinks >= count / 2 };
  };
};

// ---------------------------------------------------------------------- run

const round6 = (value) => Math.round(value * 1e6) / 1e6;

/** a part in WGS84 at 6 decimals, without the repeats the rounding makes */
const toLonLat = (part) => {
  const out = [];
  for (const point of part) {
    const [lon, lat] = toWgs84.forward(point);
    const next = [round6(lon), round6(lat)];
    const last = out[out.length - 1];
    if (!last || last[0] !== next[0] || last[1] !== next[1]) out.push(next);
  }
  return out;
};

/** a node id as the output carries it: the number, or null when blank */
const nodeId = (value) =>
  value === null || value === undefined || value === "" ? null : value;

const shpBuffer = readFileSync(sourcePath);
const dbfPath = sourcePath.replace(/\.shp$/i, ".dbf");
const cpgPath = sourcePath.replace(/\.shp$/i, ".cpg");
const encoding = existsSync(cpgPath)
  ? readFileSync(cpgPath, "utf8").trim().toLowerCase() || "utf-8"
  : "latin1";
const shapes = readShp(shpBuffer);
const { fields, rows } = readDbf(readFileSync(dbfPath), encoding);
if (shapes.length !== rows.length) {
  throw new Error(
    `.shp has ${shapes.length} records, .dbf ${rows.length}; they do not belong together`
  );
}

const box = clipBounds(marginMeters);

/** how many sections meet at a node, in the whole network and in the clip */
const fullDegree = new Map();
const clipDegree = new Map();
const countNode = (degrees, id) => {
  if (id === null) return;
  degrees.set(id, (degrees.get(id) ?? 0) + 1);
};

const features = [];
let multipartCount = 0;
let skippedEmpty = 0;
for (let index = 0; index < shapes.length; index++) {
  const row = rows[index];
  const parts = shapes[index];
  if (!row || parts.length === 0) {
    skippedEmpty++;
    continue;
  }
  const from = nodeId(row.KNO_VON);
  const to = nodeId(row.KNO_NACH);
  countNode(fullDegree, from);
  countNode(fullDegree, to);

  const lines = parts.map(toLonLat).filter((line) => line.length >= 2);
  if (lines.length === 0) continue;
  if (!lines.some((line) => lineHitsBox(line, box))) continue;
  if (lines.length > 1) multipartCount++;

  // a multipart section is rare and its parts do not say which end is which
  // node, so only a single part keeps the node ids; the addon falls back to
  // the coordinates for the others
  const single = lines.length === 1;
  countNode(clipDegree, single ? from : null);
  countNode(clipDegree, single ? to : null);
  for (const coordinates of lines) {
    features.push({
      type: "Feature",
      properties: {
        name: row.STR_NAME ?? "",
        bel: row.QUERS_BEL ?? 0,
        bus: row.QUERS_BUS ?? 0,
        lanes: row.STR_SPUR ?? 0,
        from: single ? from : null,
        to: single ? to : null,
      },
      geometry: { type: "LineString", coordinates },
    });
  }
}

/** nodes the clip cut off from sections that go on outside it */
const exits = [...clipDegree.keys()]
  .filter((id) => (fullDegree.get(id) ?? 0) > clipDegree.get(id))
  .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

// one way, the way OSM drives them
let keptWest = Infinity;
let keptSouth = Infinity;
let keptEast = -Infinity;
let keptNorth = -Infinity;
for (const { geometry } of features) {
  for (const [lon, lat] of geometry.coordinates) {
    keptWest = Math.min(keptWest, lon);
    keptSouth = Math.min(keptSouth, lat);
    keptEast = Math.max(keptEast, lon);
    keptNorth = Math.max(keptNorth, lat);
  }
}
const osm = await fetchOsmStreets([keptWest, keptSouth, keptEast, keptNorth], OSM_ZOOM);
const directionOf = createDirectionMatcher(osm.streets, (keptSouth + keptNorth) / 2);
/**
 * a node only one section reaches, in the full network too: a vehicle turns
 * round there, so a section ending in it stays two-way instead of letting
 * vehicles vanish mid-street
 */
const isDeadEnd = (id) =>
  id !== null && clipDegree.get(id) === 1 && (fullDegree.get(id) ?? 0) === 1;
const rampsTwoWay = [];
const deadEndsTwoWay = [];
let rampCount = 0;
let reversedCount = 0;
let otherOnewayCount = 0;
for (const feature of features) {
  const { properties, geometry } = feature;
  const { direction, onLinks } = directionOf(geometry.coordinates);
  const isRamp = RAMP_NAME.test(properties.name) || onLinks;
  if (isRamp) {
    rampCount++;
    if (direction === 0) {
      rampsTwoWay.push(`${properties.name} (${properties.from} - ${properties.to})`);
    }
  }
  if (direction === 0) continue;
  if (isDeadEnd(properties.from) || isDeadEnd(properties.to)) {
    deadEndsTwoWay.push(`${properties.name} (${properties.from} - ${properties.to})`);
    continue;
  }
  if (!isRamp) otherOnewayCount++;
  if (direction < 0) {
    geometry.coordinates.reverse();
    [properties.from, properties.to] = [properties.to, properties.from];
    reversedCount++;
  }
  properties.oneway = true;
}

// a one-way section whose lanes the model leaves at 0 (unknown) takes those
// of the same road where it joins it: its whole load now runs in it, and on
// one lane the A 46 carriageways jam at the evening peak
const sectionsAt = new Map();
for (const { properties } of features) {
  for (const id of [properties.from, properties.to]) {
    const list = sectionsAt.get(id);
    if (list) list.push(properties);
    else sectionsAt.set(id, [properties]);
  }
}
const lanesTaken = [];
for (const { properties } of features) {
  if (!properties.oneway || properties.lanes > 0) continue;
  let known = 0;
  for (const id of [properties.from, properties.to]) {
    for (const other of sectionsAt.get(id) ?? []) {
      if (other !== properties && other.name === properties.name) {
        known = Math.max(known, other.lanes);
      }
    }
  }
  if (known > 1) {
    properties.lanes = known;
    lanesTaken.push(`${properties.name} (${properties.from} - ${properties.to}): ${known}`);
  }
}

/** one-way sections at whose end no road goes on: vehicles would be stuck there */
const exitSet = new Set(exits);
const stuckEnds = features.filter((feature) => {
  const { oneway, to } = feature.properties;
  if (!oneway || to === null || exitSet.has(to)) return false;
  return !features.some(
    (other) =>
      other !== feature &&
      (other.properties.from === to ||
        (!other.properties.oneway && other.properties.to === to))
  );
});

const head = `{"type":"FeatureCollection","name":"${basename(
  targetPath,
  ".json"
)}","source":"${basename(sourcePath)}","marginMeters":${marginMeters},"exits":${JSON.stringify(
  exits
)},"features":[\n`;
const body = features.map((feature) => JSON.stringify(feature)).join(",\n");
const output = `${head}${body}\n]}\n`;
writeFileSync(targetPath, output);

// ------------------------------------------------------------------- report

const bels = features.map((f) => f.properties.bel).sort((a, b) => a - b);
const quantile = (q) => bels[Math.min(bels.length - 1, Math.floor(q * bels.length))];
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
const totalKm =
  features.reduce((sum, f) => sum + metersOf(f.geometry.coordinates), 0) / 1000;

console.log(`fields: ${fields.map((f) => `${f.name}(${f.type}${f.length})`).join(", ")}`);
console.log(`records read: ${shapes.length} (empty or deleted: ${skippedEmpty})`);
console.log(`clip box (lon/lat): ${box.map((v) => v.toFixed(6)).join(", ")}`);
console.log(`features kept: ${features.length} (multipart sections: ${multipartCount})`);
console.log(`road length kept: ${totalKm.toFixed(1)} km`);
console.log(`exit nodes: ${exits.length}`);
console.log(`OSM tiles read: ${osm.tiles} (${osm.streets.length} street lines)`);
console.log(
  `ramps: ${rampCount}, one-way ${rampCount - rampsTwoWay.length}, two-way ${rampsTwoWay.length}`
);
for (const ramp of rampsTwoWay) console.log(`  two-way ramp: ${ramp}`);
console.log(`other one-way sections: ${otherOnewayCount}`);
console.log(`one-way in OSM, two-way at a dead end: ${deadEndsTwoWay.length}`);
for (const section of deadEndsTwoWay) console.log(`  dead end: ${section}`);
console.log(`one-way sections turned round: ${reversedCount}`);
console.log(`one-way sections taking the lanes of their road: ${lanesTaken.length}`);
for (const section of lanesTaken) console.log(`  lanes: ${section}`);
console.log(`one-way sections with no road on at their end: ${stuckEnds.length}`);
for (const { properties } of stuckEnds) {
  console.log(`  dead end: ${properties.name} (${properties.from} - ${properties.to})`);
}
console.log(
  `bel quantiles: min ${bels[0]}, 25% ${quantile(0.25)}, 50% ${quantile(
    0.5
  )}, 75% ${quantile(0.75)}, 95% ${quantile(0.95)}, max ${bels[bels.length - 1]}`
);
console.log(
  `sections with bel = 0: ${bels.filter((v) => v === 0).length}, with buses: ${
    features.filter((f) => f.properties.bus > 0).length
  }`
);
console.log(`wrote ${targetPath} (${(output.length / 1024).toFixed(1)} KiB)`);
