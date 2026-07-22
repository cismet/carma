#!/usr/bin/env node

import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const parseArguments = (values) => {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value, received ${name ?? "<end>"}`);
    }
    result.set(name.slice(2), value);
  }
  return result;
};

const args = parseArguments(process.argv.slice(2));
const sourceRoot = resolve(args.get("source-root") ?? "");
const outputRoot = resolve(args.get("output-root") ?? "");
if (!args.has("source-root") || !existsSync(sourceRoot)) {
  throw new Error(`Missing --source-root: ${sourceRoot}`);
}
if (!args.has("output-root")) throw new Error("Missing --output-root");

const scriptRoot = new URL(".", import.meta.url);
const deriveVolumeScript = new URL(
  "derive-georadar-volume-strip.mjs",
  scriptRoot
);
const captureToken = (captureId) => String(captureId).padStart(3, "0");
const collectFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  });
const sourceFiles = collectFiles(sourceRoot);
const findSource = (captureId, suffix) => {
  const token = captureToken(captureId);
  const suffixPattern =
    suffix === "volume" ? `-${token}_vol.laz` : `-${token} - Region1-0.laz`;
  const path = sourceFiles.find((candidate) =>
    candidate.endsWith(suffixPattern)
  );
  if (!path) throw new Error(`Missing ${suffix} source for capture ${token}`);
  return path;
};

const cumulativeDistance = (points) => {
  const station = [0];
  for (let index = 1; index < points.length; index += 1) {
    station.push(
      station.at(-1) +
        Math.hypot(
          points[index][0] - points[index - 1][0],
          points[index][1] - points[index - 1][1]
        )
    );
  }
  return station;
};

const fitFrame = (centerline) => {
  const station = cumulativeDistance(centerline);
  const origin = centerline[Math.floor(centerline.length / 2)];
  const first = centerline[0];
  const last = centerline.at(-1);
  const alongLength = Math.hypot(last[0] - first[0], last[1] - first[1]);
  const along = [
    (last[0] - first[0]) / alongLength,
    (last[1] - first[1]) / alongLength,
  ];
  const across = [-along[1], along[0]];
  const halfLength = station.at(-1) / 2;
  const residuals = centerline.map((point, index) => {
    const deltaEast = point[0] - origin[0];
    const deltaNorth = point[1] - origin[1];
    return Math.hypot(
      deltaEast * along[0] +
        deltaNorth * along[1] -
        (station[index] - halfLength),
      deltaEast * across[0] + deltaNorth * across[1]
    );
  });
  return {
    origin,
    along,
    across,
    rmsResidualMeters: Math.sqrt(
      residuals.reduce((sum, value) => sum + value * value, 0) /
        residuals.length
    ),
    maximumResidualMeters: Math.max(...residuals),
  };
};

await mkdir(outputRoot, { recursive: true });
const traces = [];
for (let captureId = 1; captureId <= 27; captureId += 1) {
  const token = captureToken(captureId);
  const volumePath = findSource(captureId, "volume");
  const surfacePath = findSource(captureId, "surface");
  const outputPrefix = join(outputRoot, `capture-${token}`);
  const metadataPath = `${outputPrefix}.json`;
  const binaryPath = `${outputPrefix}.r16`;
  if (!existsSync(metadataPath) || !existsSync(binaryPath)) {
    const result = spawnSync(
      process.execPath,
      [
        deriveVolumeScript.pathname,
        "--volume",
        volumePath,
        "--surface",
        surfacePath,
        "--output-prefix",
        outputPrefix,
        "--capture-id",
        String(captureId),
        "--start-meter",
        "0",
        "--length-meter",
        "100000",
        "--segment-length-meter",
        "10",
        "--adjacent-segments",
        "0",
      ],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
    );
    if (result.status !== 0) {
      throw new Error(
        result.stderr || result.stdout || `Capture ${token} derivation failed`
      );
    }
  }
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const centerline = metadata.georeference.centerlineUtm;
  const frame = fitFrame(centerline);
  const sceneFileName = `capture-${token}-scene.json`;
  const scene = {
    format: "carma-georadar-survey-scene-v1",
    captureId,
    source: {
      t0: basename(surfacePath),
      volume: basename(volumePath),
    },
    volume: {
      metadataUrl: `/georadar-survey/${basename(metadataPath)}`,
      variantId: "raw16",
      depthExaggeration: 10,
      clipUnit: { x: [0, 1], y: [0, 0.58], z: [0, 1] },
    },
    georeference: {
      crs: "EPSG:25832",
      originUtm: frame.origin,
      anchorHeightDhhN: 163.311,
      alongEastNorth: frame.along,
      acrossEastNorth: frame.across,
      centerlineUtm: centerline,
      segmentWindow: {
        focusStartMeter: 0,
        segmentLengthMeter: 10,
        adjacentSegments: 2,
      },
      surfaceHeight: { initialOffsetFromCameraMeters: -1.8 },
      rigidFit: {
        rmsResidualMeters: frame.rmsResidualMeters,
        maximumResidualMeters: frame.maximumResidualMeters,
      },
    },
    imageSelection: {
      imageTextureManifestUrl: "/capture-026-scene/image-textures.json",
      planarIntrinsics: "not available for this survey trace",
    },
    imagery: [],
  };
  await writeFile(
    join(outputRoot, sceneFileName),
    `${JSON.stringify(scene, null, 2)}\n`
  );
  traces.push({
    id: token,
    captureId,
    sceneManifestUrl: `/georadar-survey/${sceneFileName}`,
    volumeMetadataUrl: scene.volume.metadataUrl,
    centerlineUtm: centerline,
    lengthMeters: metadata.selection.actualLengthMeter,
  });
  process.stdout.write(
    `capture ${token}: ${metadata.selection.actualLengthMeter.toFixed(1)} m\n`
  );
}

await writeFile(
  join(outputRoot, "survey.json"),
  `${JSON.stringify(
    {
      format: "carma-georadar-survey-v1",
      crs: "EPSG:25832",
      maximumConnectionRadiusMeters: 20,
      traces,
    },
    null,
    2
  )}\n`
);
process.stdout.write(`survey: ${traces.length} traces\n`);
