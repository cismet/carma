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
 * The ramps' directions are taken from OpenStreetMap instead, read from the
 * Shortbread vector tiles cismet serves (`OSM_TILES`). Every ramp section is
 * laid over the OSM roads, and where the OSM road it lies on is one-way, the
 * section gets `"oneway": true` and its line is turned, `from` and `to`
 * with it, to run the way it is driven. A ramp is a section whose name says
 * so (Auffahrt, Abfahrt, Ausfahrt, Zufahrt, Kreuz) or which lies mostly on OSM
 * links. Other roads stay two-way, even where OSM has them one-way; the
 * report counts those.
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

// --------------------------------------------------------- vector tiles

/**
 * OpenStreetMap roads in the Shortbread schema, the source of
 * `https://tiles.cismet.de/osm_shortbread/osm_shortbread.style.json`. Only the
 * `streets` layer is read, and of it `kind`, `link` (a ramp or slip road),
 * `oneway` (driven only along the line) and `oneway_reverse` (only against it).
 */
const OSM_TILES = "https://test-maphosting-sb.cismet.de/tiles/{z}/{x}/{y}.pbf";
/** the tiles' highest zoom, where the lines are least simplified */
const OSM_ZOOM = 14;

/** the next varint at `cursor.at`, moving the cursor past it */
const readVarint = (bytes, cursor) => {
  let value = 0;
  let shift = 0;
  let byte;
  do {
    byte = bytes[cursor.at++];
    value += (byte & 0x7f) * 2 ** shift;
    shift += 7;
  } while (byte & 0x80);
  return value;
};

/**
 * The fields of a protobuf message, in order: `onField(field, value)` with a
 * number for varints and fixed numbers, a byte slice for everything
 * length-delimited.
 */
const readProto = (bytes, onField) => {
  const cursor = { at: 0 };
  while (cursor.at < bytes.length) {
    const key = readVarint(bytes, cursor);
    const field = Math.floor(key / 8);
    const wireType = key % 8;
    if (wireType === 0) {
      onField(field, readVarint(bytes, cursor));
    } else if (wireType === 2) {
      const length = readVarint(bytes, cursor);
      onField(field, bytes.subarray(cursor.at, cursor.at + length));
      cursor.at += length;
    } else if (wireType === 1) {
      onField(field, bytes.readDoubleLE(cursor.at));
      cursor.at += 8;
    } else if (wireType === 5) {
      onField(field, bytes.readFloatLE(cursor.at));
      cursor.at += 4;
    } else {
      throw new Error(`protobuf wire type ${wireType} in a vector tile`);
    }
  }
};

const packedVarints = (bytes) => {
  const values = [];
  const cursor = { at: 0 };
  while (cursor.at < bytes.length) values.push(readVarint(bytes, cursor));
  return values;
};

/** a tile's attribute value: string, number or boolean */
const readValue = (bytes) => {
  let value = null;
  readProto(bytes, (field, raw) => {
    if (field === 1) value = raw.toString("utf8");
    else if (field === 6) value = raw % 2 === 1 ? -(raw + 1) / 2 : raw / 2;
    else if (field === 7) value = raw !== 0;
    else value = raw;
  });
  return value;
};

const zigzag = (n) => (n >> 1) ^ -(n & 1);

/** the lines of a feature's geometry commands, each point through `toLonLat` */
const decodeLines = (commands, toLonLat) => {
  const lines = [];
  let x = 0;
  let y = 0;
  let line = null;
  for (let i = 0; i < commands.length; ) {
    const command = commands[i] & 7;
    const count = commands[i] >> 3;
    i++;
    // ClosePath, only in polygons, has no parameters
    if (command === 7) continue;
    for (let n = 0; n < count; n++) {
      x += zigzag(commands[i++]);
      y += zigzag(commands[i++]);
      if (command === 1 || !line) {
        line = [];
        lines.push(line);
      }
      line.push(toLonLat(x, y));
    }
  }
  return lines.filter((points) => points.length >= 2);
};

/**
 * The lines of one tile's `streets` layer as { properties, line }, `line` in
 * lon/lat. A road crossing tiles is cut at their borders, with some overlap.
 */
const readStreets = (bytes, tileX, tileY, zoom) => {
  const streets = [];
  readProto(bytes, (field, layerBytes) => {
    if (field !== 3) return;
    let name = "";
    let extent = 4096;
    const keys = [];
    const values = [];
    const features = [];
    readProto(layerBytes, (layerField, value) => {
      if (layerField === 1) name = value.toString("utf8");
      else if (layerField === 2) features.push(value);
      else if (layerField === 3) keys.push(value.toString("utf8"));
      else if (layerField === 4) values.push(readValue(value));
      else if (layerField === 5) extent = value;
    });
    if (name !== "streets") return;
    const tiles = 2 ** zoom;
    const toLonLat = (x, y) => [
      ((tileX + x / extent) / tiles) * 360 - 180,
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * (tileY + y / extent)) / tiles))) *
        180) /
        Math.PI,
    ];
    for (const featureBytes of features) {
      let tags = [];
      let type = 0;
      let geometry = [];
      readProto(featureBytes, (featureField, value) => {
        if (featureField === 2) tags = packedVarints(value);
        else if (featureField === 3) type = value;
        else if (featureField === 4) geometry = packedVarints(value);
      });
      // 2 is LineString
      if (type !== 2) continue;
      const properties = {};
      for (let i = 0; i + 1 < tags.length; i += 2) {
        properties[keys[tags[i]]] = values[tags[i + 1]];
      }
      for (const line of decodeLines(geometry, toLonLat)) {
        streets.push({ properties, line });
      }
    }
  });
  return streets;
};

/** the `streets` of every OSM tile at `zoom` that covers [west, south, east, north] */
const fetchOsmStreets = async ([west, south, east, north], zoom) => {
  const tiles = 2 ** zoom;
  const tileX = (lon) => Math.floor(((lon + 180) / 360) * tiles);
  const tileY = (lat) => {
    const phi = (lat * Math.PI) / 180;
    return Math.floor(
      ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * tiles
    );
  };
  const requests = [];
  for (let x = tileX(west); x <= tileX(east); x++) {
    for (let y = tileY(north); y <= tileY(south); y++) {
      const url = OSM_TILES.replace("{z}", zoom).replace("{x}", x).replace("{y}", y);
      requests.push(
        fetch(url).then(async (response) => {
          if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
          return readStreets(Buffer.from(await response.arrayBuffer()), x, y, zoom);
        })
      );
    }
  }
  return { tiles: requests.length, streets: (await Promise.all(requests)).flat() };
};

// ---------------------------------------------------- driving direction

/** OSM road kinds cars drive on */
const CAR_KINDS = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "living_street",
  "service",
]);
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

// ramps one way, the way OSM drives them
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
const rampsTwoWay = [];
let rampCount = 0;
let reversedCount = 0;
let otherOnewayCount = 0;
for (const feature of features) {
  const { properties, geometry } = feature;
  const { direction, onLinks } = directionOf(geometry.coordinates);
  const isRamp = RAMP_NAME.test(properties.name) || onLinks;
  if (!isRamp) {
    if (direction !== 0) otherOnewayCount++;
    continue;
  }
  rampCount++;
  if (direction === 0) {
    rampsTwoWay.push(`${properties.name} (${properties.from} - ${properties.to})`);
    continue;
  }
  if (direction < 0) {
    geometry.coordinates.reverse();
    [properties.from, properties.to] = [properties.to, properties.from];
    reversedCount++;
  }
  properties.oneway = true;
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
  `ramps: ${rampCount}, one-way ${rampCount - rampsTwoWay.length} (turned round: ${reversedCount}), two-way ${rampsTwoWay.length}`
);
for (const ramp of rampsTwoWay) console.log(`  two-way ramp: ${ramp}`);
console.log(`other sections OSM drives one way, kept two-way: ${otherOnewayCount}`);
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
