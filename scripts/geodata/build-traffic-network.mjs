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
 * There is no GDAL on every machine this runs on, so the shapefile is read by
 * hand (PolyLine, PolyLineZ and PolyLineM records, dBase III attributes in the
 * encoding the .cpg names) and reprojected with proj4. The output is GeoJSON
 * in WGS84 with 6 decimals (about 10 cm), one feature per line:
 *
 *   { "type": "FeatureCollection", "exits": [...node ids],
 *     "features": [{ "type": "Feature",
 *       "properties": { "name", "bel", "bus", "lanes", "from", "to" },
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

const DEFAULT_SOURCE =
  "/Users/thorsten/dev/maintenance/wupp-tiling-pipeline/_in/verkehrsbelastung_2020/shp/Verkehrsbelastung_Wuppertal_2020.shp";
const DEFAULT_TARGET =
  "apps/geoportal/public/assets/dz-b-prm/traffic/verkehrsnetz_modell.json";
const DEFAULT_MARGIN_METERS = 200;

/**
 * The printed zoo model in EPSG:3857, the `bounds3857` of the outlet route
 * (`apps/geoportal/src/app/constants/fachzwillinge/outlet.ts`).
 */
const MODEL_BOUNDS_3857 = [788836.855, 6663227.421, 794575.246, 6666423.835];

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
const fromWebMercator = proj4("EPSG:3857", "EPSG:4326");

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

/** west, south, east, north in degrees: the model grown by `margin` metres */
const clipBounds = (margin) => {
  const [minX, minY, maxX, maxY] = MODEL_BOUNDS_3857;
  const [west, south] = fromWebMercator.forward([minX, minY]);
  const [east, north] = fromWebMercator.forward([maxX, maxY]);
  const latitude = ((south + north) / 2) * (Math.PI / 180);
  const marginLat = margin / 111320;
  const marginLon = margin / (111320 * Math.cos(latitude));
  return [west - marginLon, south - marginLat, east + marginLon, north + marginLat];
};

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
