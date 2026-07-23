#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import proj4 from "proj4";
import { Matrix4, Vector3 } from "three";
import { WGS84_ELLIPSOID } from "3d-tiles-renderer/three";

const DEFAULT_TILESET = "https://wupp-3d-data.cismet.de/mesh2024/tileset.json";

const readOption = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const tilesetUrl = readOption("--tileset", DEFAULT_TILESET);
const outputDirectory = readOption("--output", null);
const inspectionPath = readOption("--inspection", null);
const errorTarget = Number(readOption("--error-target", "0.25"));
const bufferMeters = Number(readOption("--buffer", "50"));
const dryRun = process.argv.includes("--dry-run");
if (!inspectionPath || (!outputDirectory && !dryRun)) {
  throw new Error(
    "Usage: prepare-mesh-ao-source.mjs [--dry-run] --inspection FILE --output DIR [--error-target M] [--buffer M]"
  );
}
if (!(errorTarget >= 0) || !(bufferMeters >= 0)) {
  throw new Error("Error target and buffer must be non-negative");
}

const fetchBytes = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  return new Uint8Array(await response.arrayBuffer());
};
const fetchJson = async (url) =>
  JSON.parse(new TextDecoder().decode(await fetchBytes(url)));

const inspectionBytes = await readFile(inspectionPath);
const inspection = JSON.parse(inspectionBytes.toString("utf8"));
if (inspection.schema !== "carma.pointcloud-ao-inspection") {
  throw new Error("Unsupported point-cloud AO inspection");
}
const workingBounds = inspection.workingFrame?.registeredBounds;
if (!workingBounds?.minimum || !workingBounds?.maximum) {
  throw new Error("Inspection has no registered working-frame bounds");
}
const outputOrigin = new Vector3()
  .fromArray(workingBounds.minimum)
  .add(new Vector3().fromArray(workingBounds.maximum))
  .multiplyScalar(0.5);

proj4.defs(
  "EPSG:25832",
  "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs +type=crs"
);
const utmToEcef = (point) => {
  const [longitude, latitude] = proj4("EPSG:25832", "EPSG:4326", [
    point.x,
    point.y,
  ]);
  return WGS84_ELLIPSOID.getCartographicToPosition(
    (latitude * Math.PI) / 180,
    (longitude * Math.PI) / 180,
    point.z,
    new Vector3()
  );
};

const rootTileset = await fetchJson(tilesetUrl);
const rootTransform = new Matrix4().fromArray(
  rootTileset.root.transform ?? new Matrix4().toArray()
);
const ecefToRoot = rootTransform.clone().invert();
const rootBoundsForUtmBox = (minimum, maximum) => {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const x of [minimum[0], maximum[0]]) {
    for (const y of [minimum[1], maximum[1]]) {
      for (const z of [minimum[2], maximum[2]]) {
        const local = utmToEcef(new Vector3(x, y, z)).applyMatrix4(ecefToRoot);
        min.min(local);
        max.max(local);
      }
    }
  }
  return { min, max };
};
const globalTarget = rootBoundsForUtmBox(
  workingBounds.minimum,
  workingBounds.maximum
);
globalTarget.min.addScalar(-bufferMeters);
globalTarget.max.addScalar(bufferMeters);
const footprint = inspection.workingFrame?.horizontalFootprint;
const footprintRows = new Map();
for (const [cellX, cellY] of footprint?.cells ?? []) {
  const row = footprintRows.get(cellY) ?? [];
  row.push(cellX);
  footprintRows.set(cellY, row);
}
const footprintRanges = [];
for (const [cellY, unsorted] of footprintRows) {
  const cells = [...new Set(unsorted)].sort((a, b) => a - b);
  let first = cells[0];
  let previous = cells[0];
  for (const cell of cells.slice(1)) {
    if (cell === previous + 1) {
      previous = cell;
      continue;
    }
    footprintRanges.push([first, previous, cellY]);
    first = cell;
    previous = cell;
  }
  if (first !== undefined) footprintRanges.push([first, previous, cellY]);
}
const cellSize = Number(footprint?.cellSizeMeters);
const targetVolumes =
  Number.isFinite(cellSize) && cellSize > 0 && footprintRanges.length > 0
    ? footprintRanges.map(([firstX, lastX, cellY]) =>
        rootBoundsForUtmBox(
          [
            firstX * cellSize - bufferMeters,
            cellY * cellSize - bufferMeters,
            workingBounds.minimum[2] - bufferMeters,
          ],
          [
            (lastX + 1) * cellSize + bufferMeters,
            (cellY + 1) * cellSize + bufferMeters,
            workingBounds.maximum[2] + bufferMeters,
          ]
        )
      )
    : [globalTarget];

const boxIntersectsTarget = (box, transform) => {
  if (!box) return true;
  const center = new Vector3(box[0], box[1], box[2]);
  const axes = [
    new Vector3(box[3], box[4], box[5]),
    new Vector3(box[6], box[7], box[8]),
    new Vector3(box[9], box[10], box[11]),
  ];
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const corner = center
          .clone()
          .addScaledVector(axes[0], sx)
          .addScaledVector(axes[1], sy)
          .addScaledVector(axes[2], sz)
          .applyMatrix4(transform);
        min.min(corner);
        max.max(corner);
      }
    }
  }
  const intersects = (target) =>
    !(
      max.x < target.min.x ||
      min.x > target.max.x ||
      max.y < target.min.y ||
      min.y > target.max.y ||
      max.z < target.min.z ||
      min.z > target.max.z
    );
  return intersects(globalTarget) && targetVolumes.some(intersects);
};

const selected = [];
let manifestRequests = 0;
const resolveContents = (tile) =>
  tile.contents ?? (tile.content ? [tile.content] : []);

const selectTile = async (
  tile,
  baseUrl,
  parentTransform,
  ignoreOwnTransform
) => {
  const transform = parentTransform.clone();
  if (!ignoreOwnTransform && tile.transform) {
    transform.multiply(new Matrix4().fromArray(tile.transform));
  }
  if (!boxIntersectsTarget(tile.boundingVolume?.box, transform)) return [];

  const contents = resolveContents(tile);
  const models = contents.filter((content) =>
    /\.(b3dm|glb)(?:[?#]|$)/i.test(content.uri ?? content.url ?? "")
  );
  const externalTilesets = contents.filter((content) =>
    /\.json(?:[?#]|$)/i.test(content.uri ?? content.url ?? "")
  );
  if ((tile.geometricError ?? 0) <= errorTarget && models.length > 0) {
    return models.map((content) => ({
      url: new URL(content.uri ?? content.url, baseUrl).href,
      geometricError: tile.geometricError ?? 0,
      transform: transform.toArray(),
    }));
  }

  const children = [];
  for (const child of tile.children ?? []) {
    children.push(...(await selectTile(child, baseUrl, transform, false)));
  }
  for (const content of externalTilesets) {
    const url = new URL(content.uri ?? content.url, baseUrl).href;
    manifestRequests++;
    const external = await fetchJson(url);
    children.push(...(await selectTile(external.root, url, transform, false)));
  }
  if (children.length > 0) return children;
  return models.map((content) => ({
    url: new URL(content.uri ?? content.url, baseUrl).href,
    geometricError: tile.geometricError ?? 0,
    transform: transform.toArray(),
  }));
};

selected.push(
  ...(await selectTile(rootTileset.root, tilesetUrl, new Matrix4(), true))
);

const unique = [
  ...new Map(selected.map((entry) => [entry.url, entry])).values(),
];
const files = [];
if (!dryRun) {
  await mkdir(outputDirectory, { recursive: true });
  for (let index = 0; index < unique.length; index++) {
    const entry = unique[index];
    const bytes = await fetchBytes(entry.url);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const filename = `${String(index).padStart(4, "0")}-${basename(
      new URL(entry.url).pathname
    )}`;
    await writeFile(join(outputDirectory, filename), bytes);
    files.push({ ...entry, filename, bytes: bytes.byteLength, sha256: hash });
  }
}

const manifest = {
  schema: "carma.mesh-ao-source",
  version: 2,
  sourceTileset: tilesetUrl,
  sourceAsset: rootTileset.asset,
  rootTransformEcef: rootTransform.toArray(),
  selection: {
    target: `${inspection.asset} registered ellipsoidal bounds`,
    errorTargetMeters: errorTarget,
    bufferMeters,
    targetBoundsRootLocal: {
      min: globalTarget.min.toArray(),
      max: globalTarget.max.toArray(),
    },
    horizontalFootprintCellCount: footprint?.cells?.length ?? null,
    horizontalFootprintRangeCount: targetVolumes.length,
    manifestRequests,
    tileCount: unique.length,
  },
  target: {
    asset: inspection.asset,
    inspection: basename(inspectionPath),
    inspectionSha256: createHash("sha256")
      .update(inspectionBytes)
      .digest("hex"),
    workingFrame: inspection.workingFrame,
    registration: inspection.registration,
    triangleOriginUtmEllipsoidal: outputOrigin.toArray(),
  },
  files: dryRun ? unique : files,
};
if (!dryRun) {
  await writeFile(
    join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
}
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
