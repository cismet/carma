#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const DEFAULT_SOURCE_URL =
  "https://wupp-3d-data.cismet.de/mesh2024/festpunkte/nivP.json";
const GRID_NAME = "de_bkg_gcg2016.tif";
const PIPELINE = [
  "+proj=pipeline",
  "+step +inv +proj=utm +zone=32 +ellps=GRS80",
  `+step +proj=vgridshift +grids=${GRID_NAME} +multiplier=1`,
  "+step +proj=cart +ellps=WGS84",
].join(" ");
const GEOGRAPHIC_PIPELINE = PIPELINE.replace(
  " +step +proj=cart +ellps=WGS84",
  ""
);

const usage = () => {
  console.error(
    "Usage: node scripts/derive-niv-ecef.mjs --source <nivP.json> [--output <derived.json>] [--source-url <url>] [--grid <de_bkg_gcg2016.tif>]"
  );
  process.exit(2);
};

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || !value) usage();
  args.set(key.slice(2), value);
}
if (!args.has("source")) usage();

const sourcePath = resolve(args.get("source"));
const outputPath = resolve(
  args.get("output") ?? ".data/derived/niv-control-points/niv-points-ecef.json"
);
const sourceUrl = args.get("source-url") ?? DEFAULT_SOURCE_URL;

const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    const detail = [result.error?.message, result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(`${command} failed: ${detail}`);
  }
  return result.stdout.trim();
};

const sha256 = (content) => createHash("sha256").update(content).digest("hex");

const locateGrid = () => {
  const explicit = args.get("grid");
  if (explicit) return resolve(explicit);
  const searchPaths = run("projinfo", ["--searchpaths"])
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  for (const searchPath of searchPaths) {
    const candidate = join(searchPath, GRID_NAME);
    try {
      statSync(candidate);
      return candidate;
    } catch {
      // Continue through PROJ's configured data directories.
    }
  }
  throw new Error(
    `${GRID_NAME} is missing from PROJ's search paths. Install the PROJ datum grids or pass --grid.`
  );
};

const parseCctRows = (output, expectedCount) => {
  const rows = output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const values = line.trim().split(/\s+/).slice(0, 4).map(Number);
      if (
        values.length < 3 ||
        values.some((value) => !Number.isFinite(value))
      ) {
        throw new Error(`Invalid cct output row: ${line}`);
      }
      return values;
    });
  if (rows.length !== expectedCount) {
    throw new Error(
      `cct returned ${rows.length} rows for ${expectedCount} input points`
    );
  }
  return rows;
};

const transform = (rows, pipeline, inverse = false) => {
  if (rows.length === 0) return [];
  const input = `${rows.map((row) => row.join(" ")).join("\n")}\n`;
  const output = run(
    "cct",
    ["-d", "12", ...(inverse ? ["-I"] : []), ...pipeline.split(" ")],
    { input }
  );
  return parseCctRows(output, rows.length);
};

const sourceBytes = readFileSync(sourcePath);
const sourceRecords = JSON.parse(sourceBytes.toString("utf8"));
if (!Array.isArray(sourceRecords)) {
  throw new Error("The NIV source must be a JSON array");
}

const valid = [];
const transformedPoints = sourceRecords.map((point, sourceIndex) => {
  const easting = Number(point.geojson?.coordinates?.[0]);
  const northing = Number(point.geojson?.coordinates?.[1]);
  const normalHeight = Number(point.hoehe_ueber_nhn2016);
  const sourceCrsName = point.geojson?.crs?.properties?.name;
  const transformable =
    sourceCrsName === "EPSG:25832" &&
    Number.isFinite(easting) &&
    Number.isFinite(northing) &&
    Number.isFinite(normalHeight) &&
    normalHeight !== 0;
  if (transformable) {
    valid.push({ sourceIndex, easting, northing, normalHeight });
  }
  return {
    ...point,
    transformStatus: transformable
      ? "pending"
      : sourceCrsName !== "EPSG:25832"
      ? "unverified-horizontal-crs"
      : "missing-dhhn2016-height",
  };
});

const gridPath = locateGrid();
const gridBytes = readFileSync(gridPath);
const projVersion = run("cct", ["--version"])
  .replace(/^cct:\s*/, "")
  .split(/\r?\n/)[0];
const wuppertalBoundingBox = "7.0,51.1,7.4,51.4";
const accuracySummary = (target) =>
  run("projinfo", [
    "-s",
    "EPSG:25832+7837",
    "-t",
    target,
    "--bbox",
    wuppertalBoundingBox,
    "--spatial-test",
    "contains",
    "--summary",
  ]);
const parsePreferredAccuracy = (summary, target) => {
  const preferredOperation = summary.split(/\r?\n/)[1] ?? "";
  const match = preferredOperation.match(/,\s+([0-9.]+) m,/);
  if (!match) {
    throw new Error(
      `PROJ reports no numeric preferred-operation accuracy for ${target}`
    );
  }
  return Number(match[1]);
};
const verticalAccuracySummary = accuracySummary("EPSG:4937");
const compoundAccuracySummary = accuracySummary("EPSG:4978");
const declaredVerticalOperationAccuracyMeters = parsePreferredAccuracy(
  verticalAccuracySummary,
  "EPSG:4937"
);
const declaredCompoundOperationAccuracyMeters = parsePreferredAccuracy(
  compoundAccuracySummary,
  "EPSG:4978"
);
const runtimePipeline = PIPELINE.replace(GRID_NAME, gridPath);
const runtimeGeographicPipeline = GEOGRAPHIC_PIPELINE.replace(
  GRID_NAME,
  gridPath
);
const sourceRows = valid.map(({ easting, northing, normalHeight }) => [
  easting,
  northing,
  normalHeight,
  0,
]);
const geographicRows = transform(sourceRows, runtimeGeographicPipeline);
const ecefRows = transform(sourceRows, runtimePipeline);
const roundtripRows = transform(ecefRows, runtimePipeline, true);

let maximumHorizontalRoundtripErrorMeters = 0;
let maximumVerticalRoundtripErrorMeters = 0;
valid.forEach((entry, transformedIndex) => {
  const ecef = ecefRows[transformedIndex].slice(0, 3);
  const roundtrip = roundtripRows[transformedIndex];
  maximumHorizontalRoundtripErrorMeters = Math.max(
    maximumHorizontalRoundtripErrorMeters,
    Math.hypot(roundtrip[0] - entry.easting, roundtrip[1] - entry.northing)
  );
  maximumVerticalRoundtripErrorMeters = Math.max(
    maximumVerticalRoundtripErrorMeters,
    Math.abs(roundtrip[2] - entry.normalHeight)
  );
  transformedPoints[entry.sourceIndex] = {
    ...transformedPoints[entry.sourceIndex],
    transformStatus: "transformed",
    sourceCoordinate: {
      easting: entry.easting,
      northing: entry.northing,
      normalHeightDhhN2016: entry.normalHeight,
    },
    etrs89Geographic3d: {
      longitudeDegrees: geographicRows[transformedIndex][0],
      latitudeDegrees: geographicRows[transformedIndex][1],
      ellipsoidalHeight: geographicRows[transformedIndex][2],
    },
    ellipsoidalHeight: geographicRows[transformedIndex][2],
    ecef,
  };
});

if (
  maximumHorizontalRoundtripErrorMeters > 1e-5 ||
  maximumVerticalRoundtripErrorMeters > 1e-5
) {
  throw new Error(
    `Roundtrip exceeded tolerance: horizontal=${maximumHorizontalRoundtripErrorMeters}, vertical=${maximumVerticalRoundtripErrorMeters}`
  );
}

const generatedAt = process.env.SOURCE_DATE_EPOCH
  ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1_000).toISOString()
  : new Date().toISOString();
const artifact = {
  format: "carma-niv-ecef-v1",
  generatedAt,
  source: {
    url: sourceUrl,
    fileName: basename(sourcePath),
    sha256: sha256(sourceBytes),
    byteLength: sourceBytes.byteLength,
    recordCount: sourceRecords.length,
  },
  spatialReference: {
    source: {
      horizontal: "EPSG:25832 (ETRS89 / UTM zone 32N)",
      vertical: "EPSG:7837 (DHHN2016 height)",
      compound: "EPSG:25832+7837",
    },
    intermediate: "EPSG:4937 (ETRS89 geographic 3D)",
    target: "EPSG:4978 (WGS 84 geocentric / ECEF)",
    operation: {
      pipeline: PIPELINE,
      projVersion,
      grid: {
        name: GRID_NAME,
        sha256: sha256(gridBytes),
        byteLength: gridBytes.byteLength,
      },
      declaredVerticalOperationAccuracyMeters,
      declaredCompoundOperationAccuracyMeters,
      accuracyEvidence: {
        areaOfUseBoundingBox: wuppertalBoundingBox,
        verticalSummarySha256: sha256(verticalAccuracySummary),
        compoundSummarySha256: sha256(compoundAccuracySummary),
      },
      note: "The compound accuracy includes the selected ETRS89-to-WGS84 datum-ensemble approximation; no coordinate epoch is present in the source.",
    },
  },
  validation: {
    transformedCount: valid.length,
    rejectedCount: sourceRecords.length - valid.length,
    maximumHorizontalRoundtripErrorMeters,
    maximumVerticalRoundtripErrorMeters,
    roundtripToleranceMeters: 1e-5,
  },
  points: transformedPoints,
};

mkdirSync(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp-${process.pid}`;
writeFileSync(temporaryPath, `${JSON.stringify(artifact)}\n`);
renameSync(temporaryPath, outputPath);
console.log(
  JSON.stringify(
    {
      output: outputPath,
      transformed: valid.length,
      rejected: sourceRecords.length - valid.length,
      sourceSha256: artifact.source.sha256,
      gridSha256: artifact.spatialReference.operation.grid.sha256,
      maximumHorizontalRoundtripErrorMeters,
      maximumVerticalRoundtripErrorMeters,
    },
    null,
    2
  )
);
