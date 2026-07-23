#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { Las } from "copc";

const parseArguments = (values) => {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value, received ${key ?? "<end>"}`);
    }
    result.set(key.slice(2), value);
  }
  return result;
};

const args = parseArguments(process.argv.slice(2));
const requiredPath = (name) => {
  const value = args.get(name);
  if (!value) throw new Error(`Missing --${name}`);
  const path = resolve(value);
  if (!existsSync(path)) throw new Error(`Missing ${name}: ${path}`);
  return path;
};

const t0Path = requiredPath("t0");
const volumeMetadataPath = requiredPath("volume-metadata");
const planar2ReferencePath = requiredPath("planar2-reference");
const planar2ZipPath = requiredPath("planar2-zip");
const planar3ReferencePath = requiredPath("planar3-reference");
const planar3ZipPath = requiredPath("planar3-zip");
const outputRoot = resolve(args.get("output-root") ?? "capture-026-scene");
const outputName = args.get("output-name") ?? "capture-026-scene.json";
if (basename(outputName) !== outputName || !outputName.endsWith(".json")) {
  throw new Error(`Invalid --output-name: ${outputName}`);
}
const captureId = Number(args.get("capture-id") ?? 26);
const maximumImageDistanceMeters = Number(
  args.get("maximum-image-distance") ?? 4
);
const panoramaBaseUrl = args.get("panorama-base-url")?.replace(/\/$/, "");
if (!panoramaBaseUrl) throw new Error("Missing --panorama-base-url");

const round = (value, digits = 6) => Number(value.toFixed(digits));
const sha256 = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

const readLasPoints = async (path) => {
  const file = new Uint8Array(readFileSync(path));
  const header = Las.Header.parse(file);
  const data = await Las.PointData.decompressFile(file);
  const view = Las.View.create(data, header, [], ["X", "Y", "Z"]);
  const x = view.getter("X");
  const y = view.getter("Y");
  const z = view.getter("Z");
  return Array.from({ length: view.pointCount }, (_, index) => [
    x(index),
    y(index),
    z(index),
  ]);
};

const traceRanges = (points) => {
  const starts = [0];
  for (let index = 1; index < points.length; index += 1) {
    const [x0, y0] = points[index - 1];
    const [x1, y1] = points[index];
    if (Math.hypot(x1 - x0, y1 - y0) > 1) starts.push(index);
  }
  starts.push(points.length);
  const ranges = starts
    .slice(0, -1)
    .map((start, index) => [start, starts[index + 1]]);
  const lengths = new Set(ranges.map(([start, end]) => end - start));
  if (lengths.size !== 1) {
    throw new Error(`T0 trace lengths differ: ${[...lengths].join(", ")}`);
  }
  return ranges;
};

const cumulativeDistance = (points) => {
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    const [x0, y0] = points[index - 1];
    const [x1, y1] = points[index];
    distances.push(distances.at(-1) + Math.hypot(x1 - x0, y1 - y0));
  }
  return distances;
};

const fitRigidFrame = (centerline, station, lateralAtMiddle) => {
  const meanStation =
    station.reduce((sum, value) => sum + value, 0) / station.length;
  const meanX =
    centerline.reduce((sum, point) => sum + point[0], 0) / centerline.length;
  const meanY =
    centerline.reduce((sum, point) => sum + point[1], 0) / centerline.length;
  let covariance = 0;
  let slopeX = 0;
  let slopeY = 0;
  for (let index = 0; index < station.length; index += 1) {
    const ds = station[index] - meanStation;
    covariance += ds * ds;
    slopeX += ds * (centerline[index][0] - meanX);
    slopeY += ds * (centerline[index][1] - meanY);
  }
  const length = Math.hypot(slopeX, slopeY);
  const along = [slopeX / length, slopeY / length];
  const rawAcross = [
    lateralAtMiddle.at(-1)[0] - lateralAtMiddle[0][0],
    lateralAtMiddle.at(-1)[1] - lateralAtMiddle[0][1],
  ];
  let across = [-along[1], along[0]];
  if (across[0] * rawAcross[0] + across[1] * rawAcross[1] < 0) {
    across = [-across[0], -across[1]];
  }
  const selectionMiddle = station.at(-1) / 2;
  const origin = [
    meanX + (selectionMiddle - meanStation) * (slopeX / covariance),
    meanY + (selectionMiddle - meanStation) * (slopeY / covariance),
  ];
  const residuals = centerline.map((point, index) => {
    const expectedAlong = station[index] - selectionMiddle;
    const dx = point[0] - origin[0];
    const dy = point[1] - origin[1];
    const alongError = dx * along[0] + dy * along[1] - expectedAlong;
    const acrossError = dx * across[0] + dy * across[1];
    return Math.hypot(alongError, acrossError);
  });
  return {
    origin,
    along,
    across,
    maximumResidualMeters: Math.max(...residuals),
    rmsResidualMeters: Math.sqrt(
      residuals.reduce((sum, value) => sum + value * value, 0) /
        residuals.length
    ),
  };
};

const pointToSegmentDistance = (point, start, end) => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = Math.max(
    0,
    Math.min(
      1,
      lengthSquared === 0
        ? 0
        : ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) /
            lengthSquared
    )
  );
  return Math.hypot(
    point[0] - (start[0] + t * dx),
    point[1] - (start[1] + t * dy)
  );
};

const pointToPolylineDistance = (point, line) => {
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < line.length; index += 1) {
    distance = Math.min(
      distance,
      pointToSegmentDistance(point, line[index - 1], line[index])
    );
  }
  return distance;
};

const parseReferenceCsv = (path) => {
  const lines = readFileSync(path, "utf8").trim().split(/\r?\n/);
  const header = lines[0].split("\t");
  const index = Object.fromEntries(
    header.map((name, position) => [name, position])
  );
  return lines.slice(1).map((line) => {
    const columns = line.split("\t");
    const number = (name) => Number(columns[index[name]]);
    return {
      id: columns[index["file_name"]],
      gpsSeconds: number("gps_seconds[s]"),
      utm: [
        number("projectedX[m]"),
        number("projectedY[m]"),
        number("projectedZ[m]"),
      ],
      rollDegrees: number("roll[deg]"),
      pitchDegrees: number("pitch[deg]"),
      headingDegrees: number("heading[deg]"),
    };
  });
};

const zipEntries = (path) => {
  const result = spawnSync("unzip", ["-Z1", path], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `Unable to list ${path}`);
  }
  return result.stdout.trim().split(/\r?\n/);
};

const extractImage = (zipPath, entry, outputPath) => {
  const result = spawnSync("unzip", ["-p", zipPath, entry], {
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr?.toString() || `Unable to extract ${entry}`);
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, result.stdout);
};

const volumeMetadata = JSON.parse(readFileSync(volumeMetadataPath, "utf8"));
const allT0Points = await readLasPoints(t0Path);
const ranges = traceRanges(allT0Points);
const traceCount = ranges.length;
const centerTraceIndex = Math.floor(traceCount / 2);
const startSlice = volumeMetadata.selection.startSlice;
const endSlice = volumeMetadata.selection.endSliceExclusive;
const selectedSliceCount = endSlice - startSlice;
const selectedSurface = ranges.map(([start]) =>
  allT0Points.slice(start + startSlice, start + endSlice)
);
const centerline = selectedSurface[centerTraceIndex];
const station = cumulativeDistance(centerline);
const middleSlice = Math.floor(selectedSliceCount / 2);
const lateralAtMiddle = selectedSurface.map((trace) => trace[middleSlice]);
const rigidFrame = fitRigidFrame(centerline, station, lateralAtMiddle);
const horizontalBounds = [
  Math.min(
    ...selectedSurface.flatMap((trace) => trace.map((point) => point[0]))
  ),
  Math.min(
    ...selectedSurface.flatMap((trace) => trace.map((point) => point[1]))
  ),
  Math.max(
    ...selectedSurface.flatMap((trace) => trace.map((point) => point[0]))
  ),
  Math.max(
    ...selectedSurface.flatMap((trace) => trace.map((point) => point[1]))
  ),
];

mkdirSync(outputRoot, { recursive: true });

const buildPlanarAsset = ({ id, referencePath, zipPath }) => {
  const capturePrefix = `sideview_${String(captureId).padStart(6, "0")}_`;
  const selected = parseReferenceCsv(referencePath)
    .filter((pose) => pose.id.startsWith(capturePrefix))
    .map((pose) => ({
      ...pose,
      distanceToVolumeMeters: pointToPolylineDistance(pose.utm, centerline),
    }))
    .filter((pose) => pose.distanceToVolumeMeters <= maximumImageDistanceMeters)
    .sort((left, right) => left.gpsSeconds - right.gpsSeconds);
  const entries = zipEntries(zipPath);
  for (const pose of selected) {
    const entry = entries.find((candidate) =>
      candidate.endsWith(`/${pose.id}.jpg`)
    );
    if (!entry) throw new Error(`${pose.id}.jpg missing in ${zipPath}`);
    const relativePath = `${id}/${pose.id}.jpg`;
    extractImage(zipPath, entry, join(outputRoot, relativePath));
    pose.imageUrl = `/capture-026-scene/${relativePath}`;
    pose.distanceToVolumeMeters = round(pose.distanceToVolumeMeters, 3);
    pose.utm = pose.utm.map((value) => round(value, 3));
  }
  return {
    id,
    reference: basename(referencePath),
    referenceSha256: sha256(referencePath),
    sourceArchive: basename(zipPath),
    selected,
  };
};

const planarAssets = [
  buildPlanarAsset({
    id: "planar-2",
    referencePath: planar2ReferencePath,
    zipPath: planar2ZipPath,
  }),
  buildPlanarAsset({
    id: "planar-3",
    referencePath: planar3ReferencePath,
    zipPath: planar3ZipPath,
  }),
];
const selectedHeights = planarAssets.flatMap((asset) =>
  asset.selected.map((pose) => pose.utm[2])
);
const anchorHeightDhhN = selectedHeights.length
  ? [...selectedHeights].sort((a, b) => a - b)[
      Math.floor(selectedHeights.length / 2)
    ]
  : 0;

const manifest = {
  format: "carma-capture-026-collocated-scene-v1",
  captureId,
  source: {
    t0: basename(t0Path),
    t0Sha256: sha256(t0Path),
    volumeMetadata: basename(volumeMetadataPath),
    volumeMetadataSha256: sha256(volumeMetadataPath),
  },
  volume: {
    metadataUrl: `/georadar-volume/${basename(volumeMetadataPath)}`,
    variantId:
      volumeMetadata.variants?.find(({ id }) => id === "noise-gated16")?.id ??
      volumeMetadata.data.id,
    depthExaggeration: 10,
    clipUnit: { x: [0, 1], y: [0, 0.58], z: [0, 1] },
  },
  georeference: {
    crs: "EPSG:25832",
    originUtm: rigidFrame.origin.map((value) => round(value, 3)),
    anchorHeightDhhN: round(anchorHeightDhhN, 3),
    surfaceHeight: {
      initialOffsetFromCameraMeters: -1.8,
      alignment: "downward raycast onto loaded Mesh 2024 geometry",
    },
    alongEastNorth: rigidFrame.along.map((value) => round(value, 9)),
    acrossEastNorth: rigidFrame.across.map((value) => round(value, 9)),
    horizontalBoundsUtm: horizontalBounds.map((value) => round(value, 3)),
    rigidFit: {
      rmsResidualMeters: round(rigidFrame.rmsResidualMeters, 4),
      maximumResidualMeters: round(rigidFrame.maximumResidualMeters, 4),
      interpretation: `${round(
        volumeMetadata.selection.actualLengthMeter,
        1
      )} m box fit to the delivered T0 center trace; the original centerline is retained below`,
    },
    centerlineUtm: centerline.map(([x, y]) => [round(x, 3), round(y, 3)]),
    segmentWindow: {
      focusStartMeter: volumeMetadata.selection.focusStartMeter ?? 0,
      segmentLengthMeter:
        volumeMetadata.selection.segmentLengthMeter ??
        volumeMetadata.selection.actualLengthMeter,
      adjacentSegments: volumeMetadata.selection.adjacentSegments ?? 0,
    },
  },
  imageSelection: {
    imageTextureManifestUrl: "/capture-026-scene/image-textures.json",
    maximumDistanceToVolumeMeters: maximumImageDistanceMeters,
    planarPoseConvention:
      "Orbit/Trimble: heading clockwise from north; pitch positive up; roll about the optical forward axis",
    planarIntrinsics:
      "not delivered; image-plane size and frustum opening are illustrative",
    panorama: {
      referenceUrl: `${panoramaBaseUrl}/reference.csv`,
      imageBaseUrl: panoramaBaseUrl,
      runtimeRadiusMeters: 25,
    },
  },
  imagery: planarAssets,
};

const outputPath = join(outputRoot, outputName);
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  JSON.stringify({
    output: outputPath,
    originUtm: manifest.georeference.originUtm,
    planar2: planarAssets[0].selected.length,
    planar3: planarAssets[1].selected.length,
    rigidFit: manifest.georeference.rigidFit,
  })
);
