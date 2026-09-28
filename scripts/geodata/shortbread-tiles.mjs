/**
 * OpenStreetMap roads from vector tiles in the Shortbread schema, read by hand
 * (no decoder library, so it runs wherever node does). Shared by
 * `build-traffic-network.mjs` (driving directions for the city's ramps) and
 * `build-traffic-network-osm.mjs` (the whole road network from OSM).
 */

/** lon/lat of a point in the world tile grid at `zoom`, `extent` per tile */
export const pixelToLonLat = ([x, y], zoom, extent) => {
  const size = 2 ** zoom * extent;
  return [
    (x / size) * 360 - 180,
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / size))) * 180) / Math.PI,
  ];
};

/** a point of the world tile grid at `zoom` from lon/lat, `extent` per tile */
export const lonLatToPixel = ([lon, lat], zoom, extent) => {
  const size = 2 ** zoom * extent;
  const phi = (lat * Math.PI) / 180;
  return [
    ((lon + 180) / 360) * size,
    ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * size,
  ];
};

/**
 * OpenStreetMap roads in the Shortbread schema, the source of
 * `https://tiles.cismet.de/osm_shortbread/osm_shortbread.style.json`. Only the
 * `streets` layer is read, and of it `kind`, `link` (a ramp or slip road),
 * `oneway` (driven only along the line) and `oneway_reverse` (only against it).
 */
export const OSM_TILES = "https://test-maphosting-sb.cismet.de/tiles/{z}/{x}/{y}.pbf";
/** the tiles' highest zoom, where the lines are least simplified */
export const OSM_ZOOM = 14;

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

/** the lines of a feature's geometry commands, in tile coordinates */
const decodeLines = (commands) => {
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
      line.push([x, y]);
    }
  }
  return lines.filter((points) => points.length >= 2);
};

/**
 * The lines of one tile's `streets` layer as { properties, line, pixels,
 * tile }: `line` in lon/lat, `pixels` in the tile grid of the whole world at
 * the tile's zoom (x east, y south, `tile.extent` per tile), where points of
 * neighbouring tiles line up exactly. A road crossing tiles is cut at their
 * borders, each piece reaching a little beyond its tile.
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
    const tile = { x: tileX, y: tileY, zoom, extent };
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
      for (const local of decodeLines(geometry)) {
        const pixels = local.map(([x, y]) => [tileX * extent + x, tileY * extent + y]);
        const line = pixels.map((pixel) => pixelToLonLat(pixel, zoom, extent));
        streets.push({ properties, line, pixels, tile });
      }
    }
  });
  return streets;
};

/** the `streets` of every OSM tile at `zoom` that covers [west, south, east, north] */
export const fetchOsmStreets = async ([west, south, east, north], zoom) => {
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

/** OSM road kinds cars drive on */
export const CAR_KINDS = new Set([
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
