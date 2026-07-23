#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";

import { Las } from "copc";

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
const requiredPath = (name) => {
  const path = resolve(args.get(name) ?? "");
  if (!args.has(name) || !existsSync(path)) {
    throw new Error(`Missing --${name}: ${path}`);
  }
  return path;
};

const volumePath = requiredPath("volume");
const surfacePath = requiredPath("surface");
const outputPrefix = resolve(args.get("output-prefix") ?? "");
if (!args.has("output-prefix")) throw new Error("Missing --output-prefix");
const captureId = Number(args.get("capture-id") ?? 26);
const startMeter = Number(args.get("start-meter") ?? 0);
const segmentLengthMeter = Number(args.get("segment-length-meter") ?? 10);
const adjacentSegments = Number(args.get("adjacent-segments") ?? 2);
const totalLengthMeter = Number(
  args.get("length-meter") ?? segmentLengthMeter * (adjacentSegments * 2 + 1)
);

const readLas = async (path, fields) => {
  const file = new Uint8Array(await readFile(path));
  const header = Las.Header.parse(file);
  const data = await Las.PointData.decompressFile(file);
  return Las.View.create(data, header, [], fields);
};

const cumulativeDistance = (points) => {
  const result = [0];
  for (let index = 1; index < points.length; index += 1) {
    result.push(
      result.at(-1) +
        Math.hypot(
          points[index][0] - points[index - 1][0],
          points[index][1] - points[index - 1][1]
        )
    );
  }
  return result;
};

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const surface = await readLas(surfacePath, ["X", "Y"]);
const surfaceX = surface.getter("X");
const surfaceY = surface.getter("Y");
const starts = [0];
for (let index = 1; index < surface.pointCount; index += 1) {
  if (
    Math.hypot(
      surfaceX(index) - surfaceX(index - 1),
      surfaceY(index) - surfaceY(index - 1)
    ) > 1
  ) {
    starts.push(index);
  }
}
starts.push(surface.pointCount);
const traceCount = starts.length - 1;
const sliceCount = starts[1] - starts[0];
if (starts.slice(1).some((end, index) => end - starts[index] !== sliceCount)) {
  throw new Error("Surface trace lengths differ");
}
const centerTraceIndex = Math.floor(traceCount / 2);
const centerStart = starts[centerTraceIndex];
const fullCenterline = Array.from({ length: sliceCount }, (_, index) => [
  surfaceX(centerStart + index),
  surfaceY(centerStart + index),
]);
const fullStation = cumulativeDistance(fullCenterline);
const firstSlice = fullStation.findIndex((value) => value >= startMeter);
let lastSliceExclusive = fullStation.findIndex(
  (value) => value > startMeter + totalLengthMeter
);
if (lastSliceExclusive < 0) lastSliceExclusive = sliceCount;
if (firstSlice < 0 || lastSliceExclusive - firstSlice < 2) {
  throw new Error("Requested strip is outside the capture trajectory");
}
const selectedSliceCount = lastSliceExclusive - firstSlice;
const selectedStation = fullStation
  .slice(firstSlice, lastSliceExclusive)
  .map((value) => value - fullStation[firstSlice]);
const centerlineUtm = fullCenterline.slice(firstSlice, lastSliceExclusive);

const volume = await readLas(volumePath, ["Intensity", "Z"]);
const surfaceSampleCount = traceCount * sliceCount;
if (volume.pointCount % surfaceSampleCount !== 0) {
  throw new Error(
    `Volume count ${volume.pointCount} is not divisible by ${surfaceSampleCount}`
  );
}
const depthCount = volume.pointCount / surfaceSampleCount;
const intensity = volume.getter("Intensity");
const volumeZ = volume.getter("Z");
const output = new Uint16Array(selectedSliceCount * traceCount * depthCount);
const histogram256 = new Array(256).fill(0);
for (let depth = 0; depth < depthCount; depth += 1) {
  for (let trace = 0; trace < traceCount; trace += 1) {
    const sourceBase =
      depth * surfaceSampleCount + trace * sliceCount + firstSlice;
    const targetBase = selectedSliceCount * (trace + traceCount * depth);
    for (let slice = 0; slice < selectedSliceCount; slice += 1) {
      const value = intensity(sourceBase + slice);
      output[targetBase + slice] = value;
      histogram256[Math.min(255, Math.floor(value / 256))] += 1;
    }
  }
}

const middleSlice = firstSlice + Math.floor(selectedSliceCount / 2);
const lateralPoints = starts
  .slice(0, -1)
  .map((start) => [
    surfaceX(start + middleSlice),
    surfaceY(start + middleSlice),
  ]);
const lateralStation = cumulativeDistance(lateralPoints);
const lateralReference = lateralStation[centerTraceIndex];
const traceMeters = lateralStation.map((value) => value - lateralReference);
const depthMillimeters = Array.from({ length: depthCount }, (_, index) =>
  Math.max(0, -volumeZ(index * surfaceSampleCount) * 20)
);
const sliceSteps = selectedStation
  .slice(1)
  .map((value, index) => value - selectedStation[index]);
const traceSteps = lateralStation
  .slice(1)
  .map((value, index) => value - lateralStation[index]);
const depthSteps = depthMillimeters
  .slice(1)
  .map((value, index) => value - depthMillimeters[index]);
const binaryPath = `${outputPrefix}.r16`;
const metadataPath = `${outputPrefix}.json`;
await mkdir(dirname(metadataPath), { recursive: true });
await writeFile(binaryPath, new Uint8Array(output.buffer));
const shape = {
  slice: selectedSliceCount,
  trace: traceCount,
  depth: depthCount,
};
const variant = {
  id: "raw16",
  label: "Raw R16 · unverändert",
  url: binaryPath.split("/").at(-1),
  dtype: "uint16-le",
  validBits: 16,
  maximumCode: 65535,
  signalOffset: 32768,
  order: ["depth", "trace", "slice"],
  shape,
  byteLength: output.byteLength,
  valueRange: [0, 65535],
  histogram256,
};
const metadata = {
  format: "carma-georadar-volume-v1",
  captureId,
  source: {
    volume: volumePath.split("/").at(-1),
    surface: surfacePath.split("/").at(-1),
  },
  data: variant,
  variants: [variant],
  selection: {
    startSlice: firstSlice,
    endSliceExclusive: lastSliceExclusive,
    requestedStartMeter: startMeter,
    requestedLengthMeter: totalLengthMeter,
    actualLengthMeter: selectedStation.at(-1),
    focusStartMeter: adjacentSegments * segmentLengthMeter,
    segmentLengthMeter,
    adjacentSegments,
  },
  georeference: { crs: "EPSG:25832", centerlineUtm },
  axes: {
    sliceMeters: selectedStation,
    traceMeters,
    depthMillimeters,
  },
  spacing: {
    sliceMedianMeters: median(sliceSteps),
    traceMedianMeters: median(traceSteps),
    depthMedianMillimeters: median(depthSteps),
  },
  histogram256,
};
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(
  JSON.stringify({
    metadata: metadataPath,
    shape,
    actualLengthMeter: metadata.selection.actualLengthMeter,
    focusStartMeter: metadata.selection.focusStartMeter,
  })
);
