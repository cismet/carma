#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

const option = (name) =>
  process.argv
    .find((argument) => argument.startsWith(`${name}=`))
    ?.slice(name.length + 1);

const volumeRoot = path.resolve(
  option("--volume-root") ||
    process.env.GEORADAR_VOLUME_ROOT ||
    path.join(projectRoot, ".data", "derived", "georadar-volume")
);
const metadataPath = path.resolve(
  option("--metadata") || path.join(volumeRoot, "capture-026-10m.json")
);
const outputDir = path.resolve(
  option("--output-dir") || path.join(projectRoot, "docs", "assets", "georadar")
);

const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
const rawVariant = metadata.variants.find((variant) => variant.id === "raw16");
const gatedVariant = metadata.variants.find(
  (variant) => variant.id === "noise-gated16"
);
if (!rawVariant || !gatedVariant) {
  throw new Error("Metadata must contain raw16 and noise-gated16 variants");
}

const rawPath = path.join(path.dirname(metadataPath), rawVariant.url);
const gatedPath = path.join(path.dirname(metadataPath), gatedVariant.url);
const [rawBuffer, gatedBuffer] = await Promise.all([
  readFile(rawPath),
  readFile(gatedPath),
]);
const { depth, trace, slice } = rawVariant.shape;
const sampleCount = depth * trace * slice;
if (
  rawBuffer.byteLength !== sampleCount * 2 ||
  gatedBuffer.byteLength !== sampleCount * 2
) {
  throw new Error("R16 byte length does not match metadata shape");
}

const decodeR16 = (buffer) => {
  const values = new Int32Array(buffer.byteLength / 2);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = buffer.readUInt16LE(index * 2) - 32_768;
  }
  return values;
};

const raw = decodeR16(rawBuffer);
const gated = decodeR16(gatedBuffer);
const indexOf = (depthIndex, traceIndex, sliceIndex) =>
  (depthIndex * trace + traceIndex) * slice + sliceIndex;

const quantile = (values, fraction) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))
  ];
};

const activeAbsolute = [];
for (const value of gated) {
  const absolute = Math.abs(value);
  if (absolute > 0 && absolute < 32_760) activeAbsolute.push(absolute);
}
const amplitudeClamp = quantile(activeAbsolute, 0.98);
const energyClip = quantile(activeAbsolute, 0.9);

const sliceScores = new Float64Array(slice);
for (let sliceIndex = 0; sliceIndex < slice; sliceIndex += 1) {
  let sumSquares = 0;
  let included = 0;
  for (let traceIndex = 0; traceIndex < trace; traceIndex += 1) {
    for (let depthIndex = 0; depthIndex < depth; depthIndex += 1) {
      const absolute = Math.abs(
        gated[indexOf(depthIndex, traceIndex, sliceIndex)]
      );
      if (absolute >= 32_760) continue;
      const value = Math.min(absolute, energyClip);
      sumSquares += value * value;
      included += 1;
    }
  }
  sliceScores[sliceIndex] = Math.sqrt(sumSquares / included);
}

let selectedSlice = -1;
const selectionMarginMeters = 0.5;
for (let index = 0; index < sliceScores.length; index += 1) {
  const station = metadata.axes.sliceMeters[index];
  if (
    station < selectionMarginMeters ||
    station > metadata.axes.sliceMeters.at(-1) - selectionMarginMeters
  ) {
    continue;
  }
  if (selectedSlice === -1 || sliceScores[index] > sliceScores[selectedSlice]) {
    selectedSlice = index;
  }
}

const centerTrace = Math.floor(trace / 2);
const sliceMeters = metadata.axes.sliceMeters;
const traceMeters = metadata.axes.traceMeters;
const depthMillimeters = metadata.axes.depthMillimeters;

const planEnergy = new Float64Array(trace * slice);
let planMaximum = 0;
for (let traceIndex = 0; traceIndex < trace; traceIndex += 1) {
  for (let sliceIndex = 0; sliceIndex < slice; sliceIndex += 1) {
    let sumSquares = 0;
    let included = 0;
    for (let depthIndex = 0; depthIndex < depth; depthIndex += 1) {
      const absolute = Math.abs(
        gated[indexOf(depthIndex, traceIndex, sliceIndex)]
      );
      if (absolute >= 32_760) continue;
      const value = Math.min(absolute, energyClip);
      sumSquares += value * value;
      included += 1;
    }
    const energy = Math.sqrt(sumSquares / included);
    planEnergy[traceIndex * slice + sliceIndex] = energy;
    planMaximum = Math.max(planMaximum, energy);
  }
}

const interpolate = (left, right, amount) =>
  left.map((value, index) =>
    Math.round(value + (right[index] - value) * amount)
  );

const divergingColor = (value) => {
  const normalized = Math.max(-1, Math.min(1, value / amplitudeClamp));
  const neutral = [247, 247, 243, 255];
  return normalized < 0
    ? [...interpolate([30, 79, 160], neutral, normalized + 1), 255]
    : [...interpolate(neutral, [181, 32, 47], normalized), 255];
};

const sequentialStops = [
  [16, 30, 63],
  [30, 93, 138],
  [35, 156, 150],
  [137, 213, 117],
  [245, 231, 91],
];
const sequentialColor = (value) => {
  const normalized = Math.max(0, Math.min(1, value / planMaximum));
  const scaled = normalized * (sequentialStops.length - 1);
  const lower = Math.min(sequentialStops.length - 2, Math.floor(scaled));
  return [
    ...interpolate(
      sequentialStops[lower],
      sequentialStops[lower + 1],
      scaled - lower
    ),
    255,
  ];
};

const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[index] = value >>> 0;
}

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
};

const encodePng = (width, height, pixel) => {
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 4);
    scanlines[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const color = pixel(x, y);
      const offset = row + 1 + x * 4;
      for (let channel = 0; channel < 4; channel += 1)
        scanlines[offset + channel] = color[channel];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
};

const asDataUrl = (buffer) =>
  `data:image/png;base64,${buffer.toString("base64")}`;
const formatTick = (value, digits = 1) =>
  Number(value).toFixed(digits).replace(".", ",");
const tickValues = (minimum, maximum, count) =>
  Array.from(
    { length: count },
    (_, index) => minimum + ((maximum - minimum) * index) / (count - 1)
  );

const axisMarkup = ({
  plotX,
  plotY,
  plotWidth,
  plotHeight,
  xRange,
  yRange,
  xUnit,
  yUnit,
}) => {
  const xTicks = tickValues(xRange[0], xRange[1], 6)
    .map((value, index) => {
      const x = plotX + (plotWidth * index) / 5;
      return `<line x1="${x}" y1="${plotY + plotHeight}" x2="${x}" y2="${
        plotY + plotHeight + 8
      }"/><text x="${x}" y="${
        plotY + plotHeight + 30
      }" text-anchor="middle">${formatTick(value)}</text>`;
    })
    .join("");
  const yTicks = tickValues(yRange[0], yRange[1], 5)
    .map((value, index) => {
      const y = plotY + (plotHeight * index) / 4;
      return `<line x1="${
        plotX - 8
      }" y1="${y}" x2="${plotX}" y2="${y}"/><text x="${plotX - 14}" y="${
        y + 6
      }" text-anchor="end">${formatTick(value)}</text>`;
    })
    .join("");
  return `<g class="axis"><path d="M ${plotX} ${plotY} V ${
    plotY + plotHeight
  } H ${plotX + plotWidth}"/>${xTicks}${yTicks}<text class="label" x="${
    plotX + plotWidth / 2
  }" y="${
    plotY + plotHeight + 68
  }" text-anchor="middle">${xUnit}</text><text class="label" transform="translate(${
    plotX - 70
  } ${
    plotY + plotHeight / 2
  }) rotate(-90)" text-anchor="middle">${yUnit}</text></g>`;
};

const baseSvg = ({
  title,
  subtitle,
  body,
  defs = "",
  width = 1400,
  height = 800,
}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>${defs}</defs>
  <style>
    text { font-family: Inter, Arial, sans-serif; fill: #18202a; font-size: 20px; }
    .title { font-size: 30px; font-weight: 600; }
    .subtitle { fill: #52606d; font-size: 18px; }
    .axis path, .axis line { fill: none; stroke: #52606d; stroke-width: 1.5; }
    .axis text { fill: #52606d; font-size: 17px; }
    .axis .label { fill: #18202a; font-size: 19px; }
    .legend { font-size: 16px; fill: #52606d; }
  </style>
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text class="title" x="90" y="48">${title}</text>
  <text class="subtitle" x="90" y="76">${subtitle}</text>
  ${body}
</svg>`;

const writeRenderedSvg = async (name, svg) => {
  const svgPath = path.join(outputDir, `${name}.tmp.svg`);
  const pngPath = path.join(outputDir, `${name}.png`);
  await writeFile(svgPath, svg);
  const result = spawnSync(
    "magick",
    ["-background", "white", svgPath, pngPath],
    {
      encoding: "utf8",
    }
  );
  await unlink(svgPath);
  if (result.status !== 0)
    throw new Error(result.stderr || `ImageMagick failed for ${name}`);
  return pngPath;
};

const plotX = 100;
const plotY = 105;
const plotWidth = 1080;
const plotHeight = 570;
const divergenceGradient = `<linearGradient id="diverging" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#1e4fa0"/><stop offset="0.5" stop-color="#f7f7f3"/><stop offset="1" stop-color="#b5202f"/></linearGradient>`;
const energyGradient = `<linearGradient id="energy" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#101e3f"/><stop offset="0.35" stop-color="#1e5d8a"/><stop offset="0.65" stop-color="#239c96"/><stop offset="1" stop-color="#f5e75b"/></linearGradient>`;

const legend = (gradientId, top, middle, bottom, label) => `
  <rect x="1225" y="180" width="28" height="390" fill="url(#${gradientId})"/>
  <text class="legend" x="1265" y="192">${top}</text>
  <text class="legend" x="1265" y="381">${middle}</text>
  <text class="legend" x="1265" y="570">${bottom}</text>
  <text class="legend" transform="translate(1350 375) rotate(-90)" text-anchor="middle">${label}</text>`;

await mkdir(outputDir, { recursive: true });

const planPng = encodePng(slice, trace, (x, y) =>
  sequentialColor(planEnergy[y * slice + x])
);
const selectedX = plotX + (plotWidth * selectedSlice) / (slice - 1);
const planSvg = baseSvg({
  title: "Capture 026 · 10-m-Block · Tiefenenergie",
  subtitle:
    "RMS der Amplitude nach Noise-Gating über 136 Tiefenlagen; Linie markiert den signalreichsten Querschnitt",
  defs: energyGradient,
  body: `
    <image href="${asDataUrl(
      planPng
    )}" x="${plotX}" y="${plotY}" width="${plotWidth}" height="${plotHeight}" preserveAspectRatio="none" image-rendering="pixelated"/>
    <line x1="${selectedX}" y1="${plotY}" x2="${selectedX}" y2="${
    plotY + plotHeight
  }" stroke="#ffffff" stroke-width="4"/>
    <line x1="${selectedX}" y1="${plotY}" x2="${selectedX}" y2="${
    plotY + plotHeight
  }" stroke="#222222" stroke-width="1.5"/>
    <text x="${Math.min(selectedX + 10, plotX + plotWidth - 170)}" y="${
    plotY + 28
  }" fill="#111111">${formatTick(sliceMeters[selectedSlice], 2)} m</text>
    ${axisMarkup({
      plotX,
      plotY,
      plotWidth,
      plotHeight,
      xRange: [sliceMeters[0], sliceMeters.at(-1)],
      yRange: [traceMeters[0], traceMeters.at(-1)],
      xUnit: "Längsstation [m]",
      yUnit: "Querposition [m]",
    })}
    ${legend(
      "energy",
      formatTick(planMaximum, 0),
      formatTick(planMaximum / 2, 0),
      "0",
      "RMS-Amplitude [Code]"
    )}`,
});

const longitudinalPng = encodePng(slice, depth, (x, y) =>
  divergingColor(gated[indexOf(y, centerTrace, x)])
);
const longitudinalSvg = baseSvg({
  title: "Längsschnitt · mittlere Spur",
  subtitle: `Trace ${centerTrace}; Noise-Gating bei ±${metadata.noiseGate.thresholdCodes} Codes; Darstellung auf ±${amplitudeClamp} Codes begrenzt`,
  defs: divergenceGradient,
  body: `
    <image href="${asDataUrl(
      longitudinalPng
    )}" x="${plotX}" y="${plotY}" width="${plotWidth}" height="${plotHeight}" preserveAspectRatio="none" image-rendering="pixelated"/>
    <line x1="${selectedX}" y1="${plotY}" x2="${selectedX}" y2="${
    plotY + plotHeight
  }" stroke="#111111" stroke-width="1.5"/>
    ${axisMarkup({
      plotX,
      plotY,
      plotWidth,
      plotHeight,
      xRange: [sliceMeters[0], sliceMeters.at(-1)],
      yRange: [depthMillimeters[0], depthMillimeters.at(-1)],
      xUnit: "Längsstation [m]",
      yUnit: "inferenzielle Tiefe [mm]",
    })}
    ${legend(
      "diverging",
      `+${amplitudeClamp}`,
      "0",
      `−${amplitudeClamp}`,
      "vorzeichenbehaftete Amplitude [Code]"
    )}`,
});

const crossPng = encodePng(trace, depth, (x, y) =>
  divergingColor(gated[indexOf(y, x, selectedSlice)])
);
const crossSvg = baseSvg({
  title: `Signalreichster Querschnitt · Station ${formatTick(
    sliceMeters[selectedSlice],
    2
  )} m`,
  subtitle: `Auswahl über robust begrenzte RMS-Energie aller ${trace} Spuren und ${depth} Tiefenlagen`,
  defs: divergenceGradient,
  body: `
    <image href="${asDataUrl(
      crossPng
    )}" x="${plotX}" y="${plotY}" width="${plotWidth}" height="${plotHeight}" preserveAspectRatio="none" image-rendering="pixelated"/>
    ${axisMarkup({
      plotX,
      plotY,
      plotWidth,
      plotHeight,
      xRange: [traceMeters[0], traceMeters.at(-1)],
      yRange: [depthMillimeters[0], depthMillimeters.at(-1)],
      xUnit: "Querposition [m]",
      yUnit: "inferenzielle Tiefe [mm]",
    })}
    ${legend(
      "diverging",
      `+${amplitudeClamp}`,
      "0",
      `−${amplitudeClamp}`,
      "vorzeichenbehaftete Amplitude [Code]"
    )}`,
});

const rawLongitudinalPng = encodePng(slice, depth, (x, y) =>
  divergingColor(raw[indexOf(y, centerTrace, x)])
);
const comparisonWidth = 1560;
const comparisonPlotWidth = 620;
const comparisonPlotHeight = 570;
const comparisonX1 = 100;
const comparisonX2 = 830;
const comparisonSvg = baseSvg({
  width: comparisonWidth,
  title: "Rohsignal und heuristisches Noise-Gating",
  subtitle: `Mittlere Spur; ${formatTick(
    metadata.noiseGate.removedFraction * 100,
    1
  )} % der Samples werden nur in der Vergleichsvariante auf null gesetzt`,
  defs: divergenceGradient,
  body: `
    <text x="${comparisonX1}" y="102">R16 unverändert</text>
    <text x="${comparisonX2}" y="102">R16 nach Noise-Gating</text>
    <image href="${asDataUrl(
      rawLongitudinalPng
    )}" x="${comparisonX1}" y="120" width="${comparisonPlotWidth}" height="${comparisonPlotHeight}" preserveAspectRatio="none" image-rendering="pixelated"/>
    <image href="${asDataUrl(
      longitudinalPng
    )}" x="${comparisonX2}" y="120" width="${comparisonPlotWidth}" height="${comparisonPlotHeight}" preserveAspectRatio="none" image-rendering="pixelated"/>
    <text class="legend" x="${comparisonX1}" y="727">0 → ${formatTick(
    sliceMeters.at(-1)
  )} m · Tiefe 0 → ${formatTick(depthMillimeters.at(-1))} mm</text>
    <text class="legend" x="${comparisonX2}" y="727">Schwelle ±${
    metadata.noiseGate.thresholdCodes
  } Codes · Rohdaten bleiben separat erhalten</text>`,
});

const outputNames = [
  ["capture-026-10m-depth-energy", planSvg],
  ["capture-026-10m-longitudinal-section", longitudinalSvg],
  ["capture-026-10m-cross-section", crossSvg],
  ["capture-026-10m-noise-comparison", comparisonSvg],
];
for (const [name, svg] of outputNames) await writeRenderedSvg(name, svg);

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const renderManifest = {
  format: "carma-georadar-static-render-v1",
  source: {
    metadata: path.basename(metadataPath),
    metadataSha256: sha256(await readFile(metadataPath)),
    rawR16: path.basename(rawPath),
    rawR16Sha256: sha256(rawBuffer),
    gatedR16: path.basename(gatedPath),
    gatedR16Sha256: sha256(gatedBuffer),
  },
  shape: { slice, trace, depth },
  selection: {
    captureId: metadata.captureId,
    segmentStartMeters: metadata.selection.requestedStartMeter,
    segmentLengthMeters: metadata.selection.actualLengthMeter,
    selectedSlice,
    selectedStationMeters: sliceMeters[selectedSlice],
    method:
      "maximum robust RMS of unsaturated noise-gated amplitude across trace and depth, excluding 0.5 m segment margins",
    energyClipCodes: energyClip,
    saturationExclusionAbsoluteCodes: 32_760,
  },
  rendering: {
    amplitudeClampCodes: amplitudeClamp,
    centerTrace,
    noiseThresholdCodes: metadata.noiseGate.thresholdCodes,
    plotsAreNotPhysicalAspectRatio: true,
  },
  volumeRendering: {
    sourceStory:
      "pointcloud-investigation-georadar-volume--single-10-meter-block",
    viewportPixels: [1600, 1000],
    variant: "noise-gated16",
    view: "perspective",
    cameraPresetPosition: [8.15, -7.3, 5.5],
    cameraWheelDeltaFromPreset: 0,
    signal: "local-rms-energy",
    rmsDepthWindowSamples: 5,
    smoothing: {
      x: ["gaussian", 3],
      y: ["gaussian", 3],
      z: ["gaussian", 3],
    },
    inputClampUnit: [0.04, 0.62],
    toneCurve: "contrast",
    colorRamp: "inferno",
    alphaRamp: "strong-returns",
    volumeOpacity: 0.58,
    renderMode: "front-to-back-composite",
    representation: "volume",
    clipUnit: {
      x: [0, 1],
      y: [0, 0.58],
      z: [0, 1],
    },
    interpretation:
      "signal visualization only; not a reconstructed material surface or void detection",
  },
  outputs: [
    "capture-026-10m-volume-cutaway.png",
    ...outputNames.map(([name]) => `${name}.png`),
  ],
};
await writeFile(
  path.join(outputDir, "capture-026-10m-render.json"),
  `${JSON.stringify(renderManifest, null, 2)}\n`
);

console.log(
  JSON.stringify({ outputDir, ...renderManifest.selection, amplitudeClamp })
);
