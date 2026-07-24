#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
//  COPC → 3D Tiles 1.1 point tileset (wupp#4064)
//
//  Emits glTF-based tile content (POINTS primitives), the tile
//  format 3D Tiles 1.1 standardized and the 2.0 candidate keeps.
//  Legacy .pnts is deliberately not produced.
//
//  The COPC octree maps 1:1 onto the 3D Tiles octree: each COPC
//  node becomes one tile whose geometric error is the node's
//  sampling spacing. COPC octrees are additive (a parent's points
//  are not repeated in its children), which is exactly the
//  semantics of refine "ADD".
//
//  Frames: points are written in a local ENU meter frame around
//  the dataset origin; the root tile transform maps that frame to
//  ECEF. Tile content is Y-up per the glTF convention (renderers
//  rotate it into the Z-up tile frame), while bounding volumes
//  stay in the Z-up ENU tile frame.
// ─────────────────────────────────────────────────────────────

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { Copc, Getter } from "copc";
import proj4 from "proj4";

const UTM32 = "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs";
const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";
const WGS84_SEMI_MAJOR_AXIS = 6378137;
const WGS84_FIRST_ECCENTRICITY_SQUARED = 6.69437999014e-3;

const parseArguments = (argv) => {
  const options = {
    maxDepth: Infinity,
    geoidUndulationMeters: 0,
    pointLimit: Infinity,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    switch (key) {
      case "--source": options.source = value; break;
      case "--out": options.out = value; break;
      case "--max-depth": options.maxDepth = Number(value); break;
      case "--geoid-undulation": options.geoidUndulationMeters = Number(value); break;
      case "--point-limit": options.pointLimit = Number(value); break;
      case "--name": options.name = value; break;
      default: throw new Error(`Unknown option ${key}`);
    }
  }
  if (!options.source || !options.out) {
    throw new Error(
      "Usage: copc-to-3dtiles.mjs --source <path|url> --out <dir> " +
        "[--max-depth N] [--geoid-undulation METERS] [--point-limit N]"
    );
  }
  return options;
};

/** ECEF position of a geodetic coordinate (WGS84). */
const geodeticToEcef = (longitudeDegrees, latitudeDegrees, heightMeters) => {
  const longitude = (longitudeDegrees * Math.PI) / 180;
  const latitude = (latitudeDegrees * Math.PI) / 180;
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const primeVerticalRadius =
    WGS84_SEMI_MAJOR_AXIS /
    Math.sqrt(1 - WGS84_FIRST_ECCENTRICITY_SQUARED * sinLatitude * sinLatitude);
  return [
    (primeVerticalRadius + heightMeters) * cosLatitude * Math.cos(longitude),
    (primeVerticalRadius + heightMeters) * cosLatitude * Math.sin(longitude),
    (primeVerticalRadius * (1 - WGS84_FIRST_ECCENTRICITY_SQUARED) + heightMeters) *
      sinLatitude,
  ];
};

/**
 * Column-major ENU→ECEF transform at the origin: the columns are the east,
 * north and up axes expressed in ECEF, and the translation is the origin.
 */
const enuToEcefMatrix = (longitudeDegrees, latitudeDegrees, heightMeters) => {
  const longitude = (longitudeDegrees * Math.PI) / 180;
  const latitude = (latitudeDegrees * Math.PI) / 180;
  const sinLongitude = Math.sin(longitude);
  const cosLongitude = Math.cos(longitude);
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const origin = geodeticToEcef(longitudeDegrees, latitudeDegrees, heightMeters);
  return [
    -sinLongitude, cosLongitude, 0, 0,
    -sinLatitude * cosLongitude, -sinLatitude * sinLongitude, cosLatitude, 0,
    cosLatitude * cosLongitude, cosLatitude * sinLongitude, sinLatitude, 0,
    origin[0], origin[1], origin[2], 1,
  ];
};

/** Recursively resolves every COPC hierarchy page into a flat node map. */
const loadAllNodes = async (getter, page, maxDepth) => {
  const all = {};
  const queue = [page];
  while (queue.length > 0) {
    const current = queue.shift();
    const { nodes, pages } = await Copc.loadHierarchyPage(getter, current);
    Object.assign(all, nodes);
    for (const [key, subPage] of Object.entries(pages)) {
      if (!subPage) continue;
      if (Number(key.split("-")[0]) > maxDepth) continue;
      queue.push(subPage);
    }
  }
  return all;
};

const keyToParts = (key) => key.split("-").map(Number);

/** Axis-aligned bounds of an octree key inside the COPC cube. */
const keyBounds = (cube, key) => {
  const [depth, x, y, z] = keyToParts(key);
  const divisor = 2 ** depth;
  const sizeX = (cube[3] - cube[0]) / divisor;
  const sizeY = (cube[4] - cube[1]) / divisor;
  const sizeZ = (cube[5] - cube[2]) / divisor;
  return [
    cube[0] + sizeX * x,
    cube[1] + sizeY * y,
    cube[2] + sizeZ * z,
    cube[0] + sizeX * (x + 1),
    cube[1] + sizeY * (y + 1),
    cube[2] + sizeZ * (z + 1),
  ];
};

const alignTo4 = (value) => (value + 3) & ~3;

/**
 * Minimal glTF 2.0 GLB writer for a single POINTS primitive.
 *
 * Positions are float32 relative to the tile center (the center goes into the
 * node translation), which keeps coordinates small enough for float precision
 * far away from the ECEF origin.
 */
const buildPointsGlb = ({ positions, colors, intensity, classification, ao, center }) => {
  const pointCount = positions.length / 3;
  const buffers = [];
  const bufferViews = [];
  const accessors = [];
  const attributes = {};

  const pushBuffer = (data, target) => {
    const byteOffset = buffers.reduce((sum, entry) => sum + entry.byteLength, 0);
    const padded = alignTo4(data.byteLength);
    const view = Buffer.alloc(padded);
    Buffer.from(data.buffer, data.byteOffset, data.byteLength).copy(view);
    buffers.push(view);
    bufferViews.push({ buffer: 0, byteOffset, byteLength: data.byteLength, target });
    return bufferViews.length - 1;
  };

  let minimum = [Infinity, Infinity, Infinity];
  let maximum = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < pointCount; index++) {
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[index * 3 + axis];
      if (value < minimum[axis]) minimum[axis] = value;
      if (value > maximum[axis]) maximum[axis] = value;
    }
  }

  accessors.push({
    bufferView: pushBuffer(positions, 34962),
    componentType: 5126,
    count: pointCount,
    type: "VEC3",
    min: minimum,
    max: maximum,
  });
  attributes.POSITION = accessors.length - 1;

  if (colors) {
    accessors.push({
      bufferView: pushBuffer(colors, 34962),
      componentType: 5121,
      normalized: true,
      count: pointCount,
      type: "VEC3",
    });
    attributes.COLOR_0 = accessors.length - 1;
  }
  // Underscore-prefixed custom attributes survive glTF loaders as plain
  // vertex attributes, which is what the viewer's colorization shaders read.
  const pushScalar = (name, data, componentType, normalized) => {
    if (!data) return;
    accessors.push({
      bufferView: pushBuffer(data, 34962),
      componentType,
      normalized,
      count: pointCount,
      type: "SCALAR",
    });
    attributes[name] = accessors.length - 1;
  };
  pushScalar("_INTENSITY", intensity, 5123, true);
  pushScalar("_CLASSIFICATION", classification, 5121, false);
  pushScalar("_AO", ao, 5121, true);

  const binary = Buffer.concat(buffers);
  const gltf = {
    asset: { version: "2.0", generator: "carma copc-to-3dtiles" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: center }],
    meshes: [{ primitives: [{ attributes, mode: 0 }] }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: binary.byteLength }],
  };

  const jsonText = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonPadded = Buffer.alloc(alignTo4(jsonText.byteLength), 0x20);
  jsonText.copy(jsonPadded);
  const binaryPadded = Buffer.alloc(alignTo4(binary.byteLength));
  binary.copy(binaryPadded);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonPadded.byteLength + 8 + binaryPadded.byteLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonPadded.byteLength, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // "JSON"
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binaryPadded.byteLength, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4); // "BIN"

  return Buffer.concat([header, jsonHeader, jsonPadded, binaryHeader, binaryPadded]);
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  const startedAt = Date.now();
  const log = (message) =>
    console.log(`[${((Date.now() - startedAt) / 1000).toFixed(1)}s] ${message}`);

  const getter = options.source.startsWith("http")
    ? Getter.http(options.source)
    : options.source;
  const copc = await Copc.create(getter);
  const { cube, spacing } = copc.info;
  log(
    `source: ${copc.header.pointCount.toLocaleString()} points, ` +
      `pdrf ${copc.header.pointDataRecordFormat}, spacing ${spacing.toFixed(3)} m`
  );

  // Local ENU origin: horizontal center of the data extent at its floor. The
  // declared vertical datum is orthometric, so the ellipsoidal height used for
  // the ECEF anchor adds the geoid undulation supplied by the caller.
  const originEasting = (copc.header.min[0] + copc.header.max[0]) / 2;
  const originNorthing = (copc.header.min[1] + copc.header.max[1]) / 2;
  const originHeight = copc.header.min[2];
  const [originLongitude, originLatitude] = proj4(UTM32, WGS84, [
    originEasting,
    originNorthing,
  ]);
  const rootTransform = enuToEcefMatrix(
    originLongitude,
    originLatitude,
    originHeight + options.geoidUndulationMeters
  );
  log(
    `origin: ${originEasting.toFixed(3)} E ${originNorthing.toFixed(3)} N ` +
      `${originHeight.toFixed(3)} m (+${options.geoidUndulationMeters} geoid) → ` +
      `${originLongitude.toFixed(6)}, ${originLatitude.toFixed(6)}`
  );

  // UTM grid axes are neither true-scale nor aligned with true north: the
  // grid is rotated against north by the meridian convergence (about 1.5
  // degrees here) and scaled by the projection. Linearize the whole
  // UTM→ENU mapping at the origin so both effects are carried; ignoring the
  // convergence would swing the cloud by metres across this extent.
  const originEcef = geodeticToEcef(originLongitude, originLatitude, 0);
  const eastAxis = [rootTransform[0], rootTransform[1], rootTransform[2]];
  const northAxis = [rootTransform[4], rootTransform[5], rootTransform[6]];
  const enuOffsetOf = (easting, northing) => {
    const [longitude, latitude] = proj4(UTM32, WGS84, [easting, northing]);
    const ecef = geodeticToEcef(longitude, latitude, 0);
    const delta = [
      ecef[0] - originEcef[0],
      ecef[1] - originEcef[1],
      ecef[2] - originEcef[2],
    ];
    return [
      delta[0] * eastAxis[0] + delta[1] * eastAxis[1] + delta[2] * eastAxis[2],
      delta[0] * northAxis[0] + delta[1] * northAxis[1] + delta[2] * northAxis[2],
    ];
  };
  const sampleDistance = 200;
  const eastSample = enuOffsetOf(originEasting + sampleDistance, originNorthing);
  const northSample = enuOffsetOf(originEasting, originNorthing + sampleDistance);
  // Columns: ENU response to a unit step along grid east / grid north.
  const jacobian = [
    [eastSample[0] / sampleDistance, northSample[0] / sampleDistance],
    [eastSample[1] / sampleDistance, northSample[1] / sampleDistance],
  ];
  const convergenceDegrees =
    (Math.atan2(jacobian[0][1], jacobian[1][1]) * 180) / Math.PI;
  log(
    `grid→ENU jacobian [[${jacobian[0][0].toFixed(6)}, ${jacobian[0][1].toFixed(6)}], ` +
      `[${jacobian[1][0].toFixed(6)}, ${jacobian[1][1].toFixed(6)}]] · ` +
      `convergence ${convergenceDegrees.toFixed(4)}°`
  );
  const gridToEnu = (deltaEasting, deltaNorthing) => [
    jacobian[0][0] * deltaEasting + jacobian[0][1] * deltaNorthing,
    jacobian[1][0] * deltaEasting + jacobian[1][1] * deltaNorthing,
  ];

  const nodes = await loadAllNodes(getter, copc.info.rootHierarchyPage, options.maxDepth);
  const keys = Object.keys(nodes)
    .filter((key) => keyToParts(key)[0] <= options.maxDepth)
    .sort((a, b) => {
      const [depthA] = keyToParts(a);
      const [depthB] = keyToParts(b);
      return depthA - depthB || a.localeCompare(b);
    });
  const totalPoints = keys.reduce((sum, key) => sum + nodes[key].pointCount, 0);
  log(`hierarchy: ${keys.length} nodes, ${totalPoints.toLocaleString()} points`);

  await mkdir(join(options.out, "content"), { recursive: true });

  const tiles = new Map();
  let writtenPoints = 0;
  let writtenBytes = 0;
  let processed = 0;

  for (const key of keys) {
    if (writtenPoints >= options.pointLimit) break;
    const node = nodes[key];
    if (!node || node.pointCount === 0) continue;
    const view = await Copc.loadPointDataView(getter, copc, node);
    const count = view.pointCount;
    const getX = view.getter("X");
    const getY = view.getter("Y");
    const getZ = view.getter("Z");
    const dimensions = view.dimensions;
    const getRed = dimensions.Red ? view.getter("Red") : null;
    const getGreen = dimensions.Green ? view.getter("Green") : null;
    const getBlue = dimensions.Blue ? view.getter("Blue") : null;
    const getIntensity = dimensions.Intensity ? view.getter("Intensity") : null;
    const getClassification = dimensions.Classification
      ? view.getter("Classification")
      : null;
    const aoName = Object.keys(dimensions).find(
      (name) => name.toLowerCase() === "ao"
    );
    const getAo = aoName ? view.getter(aoName) : null;

    const positions = new Float32Array(count * 3);
    const colors = getRed ? new Uint8Array(count * 3) : null;
    const intensity = getIntensity ? new Uint16Array(count) : null;
    const classification = getClassification ? new Uint8Array(count) : null;
    const ao = getAo ? new Uint8Array(count) : null;

    // Tile-local center keeps float32 positions precise; the offset is
    // re-applied through the glTF node translation.
    const bounds = keyBounds(cube, key);
    const centerEasting = (bounds[0] + bounds[3]) / 2;
    const centerNorthing = (bounds[1] + bounds[4]) / 2;
    const centerHeight = (bounds[2] + bounds[5]) / 2;

    let colorShift = 0;
    if (getRed) {
      for (let index = 0; index < Math.min(count, 4096); index++) {
        if (getRed(index) > 255 || (getGreen && getGreen(index) > 255)) {
          colorShift = 8;
          break;
        }
      }
    }

    for (let index = 0; index < count; index++) {
      // Source → true-meter ENU relative to the tile center, then to the
      // glTF Y-up axes the tile content is expected to use.
      const [east, north] = gridToEnu(
        getX(index) - centerEasting,
        getY(index) - centerNorthing
      );
      const up = getZ(index) - centerHeight;
      positions[index * 3] = east;
      positions[index * 3 + 1] = up;
      positions[index * 3 + 2] = -north;
      if (colors) {
        colors[index * 3] = getRed(index) >> colorShift;
        colors[index * 3 + 1] = getGreen(index) >> colorShift;
        colors[index * 3 + 2] = getBlue(index) >> colorShift;
      }
      if (intensity) intensity[index] = getIntensity(index);
      if (classification) classification[index] = getClassification(index);
      if (ao) {
        const value = getAo(index);
        ao[index] = value <= 1 ? Math.round(value * 255) : value;
      }
    }

    const glb = buildPointsGlb({
      positions,
      colors,
      intensity,
      classification,
      ao,
      center: (() => {
        const [east, north] = gridToEnu(
          centerEasting - originEasting,
          centerNorthing - originNorthing
        );
        return [east, centerHeight - originHeight, -north];
      })(),
    });
    const contentPath = `content/${key}.glb`;
    await writeFile(join(options.out, contentPath), glb);
    writtenBytes += glb.byteLength;
    writtenPoints += count;

    const [depth] = keyToParts(key);
    tiles.set(key, {
      key,
      depth,
      contentPath,
      pointCount: count,
      // Bounding volume stays in the Z-up ENU tile frame. The grid-aligned
      // cube is rotated by the convergence, so the half-axes are the mapped
      // grid axes rather than axis-aligned extents.
      box: (() => {
        const [centerEast, centerNorth] = gridToEnu(
          centerEasting - originEasting,
          centerNorthing - originNorthing
        );
        const [xEast, xNorth] = gridToEnu((bounds[3] - bounds[0]) / 2, 0);
        const [yEast, yNorth] = gridToEnu(0, (bounds[4] - bounds[1]) / 2);
        return [
          centerEast, centerNorth, centerHeight - originHeight,
          xEast, xNorth, 0,
          yEast, yNorth, 0,
          0, 0, (bounds[5] - bounds[2]) / 2,
        ];
      })(),
      geometricError: spacing / 2 ** depth,
      children: [],
    });

    processed += 1;
    if (processed % 50 === 0) {
      log(
        `${processed}/${keys.length} nodes · ${writtenPoints.toLocaleString()} pts · ` +
          `${(writtenBytes / 1e6).toFixed(0)} MB`
      );
    }
  }

  // Link children to the nearest present ancestor so a depth-capped or
  // point-limited run still yields a connected tree.
  const rootTiles = [];
  for (const tile of tiles.values()) {
    const [depth, x, y, z] = keyToParts(tile.key);
    let parent = null;
    for (let parentDepth = depth - 1; parentDepth >= 0 && !parent; parentDepth--) {
      const shift = depth - parentDepth;
      const candidate = `${parentDepth}-${x >> shift}-${y >> shift}-${z >> shift}`;
      parent = tiles.get(candidate) ?? null;
    }
    if (parent) parent.children.push(tile);
    else rootTiles.push(tile);
  }

  const toTileJson = (tile) => ({
    boundingVolume: { box: tile.box },
    geometricError: tile.geometricError,
    // COPC octrees are additive: children add detail rather than replacing
    // their parent's points.
    refine: "ADD",
    content: { uri: tile.contentPath },
    ...(tile.children.length > 0
      ? { children: tile.children.map(toTileJson) }
      : {}),
  });

  const root = rootTiles.length === 1 ? rootTiles[0] : null;
  const rootJson = root
    ? { ...toTileJson(root), transform: rootTransform, refine: "ADD" }
    : {
        transform: rootTransform,
        boundingVolume: {
          box: (() => {
            const [xEast, xNorth] = gridToEnu(
              (copc.header.max[0] - copc.header.min[0]) / 2, 0
            );
            const [yEast, yNorth] = gridToEnu(
              0, (copc.header.max[1] - copc.header.min[1]) / 2
            );
            return [
              0, 0, (copc.header.max[2] - copc.header.min[2]) / 2,
              xEast, xNorth, 0,
              yEast, yNorth, 0,
              0, 0, (copc.header.max[2] - copc.header.min[2]) / 2,
            ];
          })(),
        },
        geometricError: spacing,
        refine: "ADD",
        children: rootTiles.map(toTileJson),
      };

  const tileset = {
    asset: {
      version: "1.1",
      tilesetVersion: options.name ?? "carma-copc-3dtiles",
    },
    geometricError: spacing * 2,
    root: rootJson,
  };
  await writeFile(
    join(options.out, "tileset.json"),
    JSON.stringify(tileset, null, 1)
  );

  log(
    `done: ${tiles.size} tiles · ${writtenPoints.toLocaleString()} points · ` +
      `${(writtenBytes / 1e6).toFixed(0)} MB content`
  );
};

await main();
