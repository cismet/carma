#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const argumentsByName = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  argumentsByName.set(
    process.argv[index]?.replace(/^--/, ""),
    process.argv[index + 1]
  );
}

const requiredPath = (name) => {
  const value = argumentsByName.get(name);
  if (!value) throw new Error(`missing --${name}`);
  return path.resolve(value);
};

const sceneRoot = requiredPath("scene-root");
const panoramaMirrorRoot = requiredPath("panorama-mirror-root");
const downloadHelper = requiredPath("download-helper");
const magickCommand = argumentsByName.get("magick-command") ?? "magick";
const previewMaximumDimension = Number(
  argumentsByName.get("preview-max-dimension") ?? 512
);
if (
  !Number.isSafeInteger(previewMaximumDimension) ||
  previewMaximumDimension <= 0
) {
  throw new Error("--preview-max-dimension must be a positive integer");
}

const fileExists = async (filePath) => {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
};

const sha256 = async (filePath) => {
  const hash = createHash("sha256");
  hash.update(await readFile(filePath));
  return hash.digest("hex");
};

const downloadOnce = async (url, destination) => {
  if (await fileExists(destination)) return;
  await mkdir(path.dirname(destination), { recursive: true });
  await execFileAsync(process.execPath, [downloadHelper, url, destination]);
};

const imageDimensions = async (source) => {
  const { stdout } = await execFileAsync(magickCommand, [
    source,
    "-auto-orient",
    "-format",
    "%w %h",
    "info:",
  ]);
  const [width, height] = stdout.trim().split(/\s+/).map(Number);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    throw new Error(`could not read image dimensions: ${source}`);
  }
  return { width, height };
};

const nextLowerPowerOfTwo = (value) =>
  2 ** Math.max(0, Math.floor(Math.log2(Math.max(1, value - 1))));

const deriveDisplay = async (source, destination, maximumDimension) => {
  await mkdir(path.dirname(destination), { recursive: true });
  await execFileAsync(magickCommand, [
    source,
    "-auto-orient",
    "-filter",
    "Lanczos",
    "-resize",
    `${maximumDimension}x${maximumDimension}>`,
    "-colorspace",
    "Lab",
    "-channel",
    "R",
    "-sigmoidal-contrast",
    "2x50%",
    "-unsharp",
    "0x0.65+0.65+0.02",
    "+channel",
    "-colorspace",
    "sRGB",
    "-strip",
    "-sampling-factor",
    "4:4:4",
    "-interlace",
    "Plane",
    "-quality",
    "95",
    destination,
  ]);
};

const derivePreview = async (source, destination) => {
  await mkdir(path.dirname(destination), { recursive: true });
  await execFileAsync(magickCommand, [
    source,
    "-filter",
    "Lanczos",
    "-resize",
    `${previewMaximumDimension}x${previewMaximumDimension}>`,
    "-strip",
    "-sampling-factor",
    "4:4:4",
    "-interlace",
    "Plane",
    "-quality",
    "95",
    destination,
  ]);
};

const sceneManifestNames = (await readdir(sceneRoot))
  .filter((name) =>
    /^capture-026-scene(?:-(?:11|21|27)x10m)?\.json$/.test(name)
  )
  .sort();
if (sceneManifestNames.length === 0) {
  throw new Error(`no Capture 026 scene manifests in ${sceneRoot}`);
}

const sceneManifests = await Promise.all(
  sceneManifestNames.map(async (name) =>
    JSON.parse(await readFile(path.join(sceneRoot, name), "utf8"))
  )
);
const firstPanoramaSelection = sceneManifests[0].imageSelection.panorama;
const panoramaReferencePath = path.join(panoramaMirrorRoot, "reference.csv");
await downloadOnce(firstPanoramaSelection.referenceUrl, panoramaReferencePath);

const panoramaReference = await readFile(panoramaReferencePath, "utf8");
const panoramaPoses = panoramaReference
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => {
    const columns = line.split("\t");
    const id = columns[1]?.trim();
    const east = Number(columns[8]);
    const north = Number(columns[9]);
    if (!id || !Number.isFinite(east) || !Number.isFinite(north)) return null;
    if (!/^[A-Za-z0-9._-]+$/.test(id)) {
      throw new Error(`unsafe panorama id: ${id}`);
    }
    return { id, east, north };
  })
  .filter(Boolean);

const sourceImages = new Map();
for (const manifest of sceneManifests) {
  for (const imagery of manifest.imagery) {
    for (const pose of imagery.selected) {
      const key = `${imagery.id}/${pose.id}`;
      sourceImages.set(key, {
        key,
        kind: imagery.id,
        id: pose.id,
        sourcePath: path.resolve(
          sceneRoot,
          pose.imageUrl.replace(/^\/capture-026-scene\//, "")
        ),
      });
    }
  }

  const { originUtm } = manifest.georeference;
  const { imageBaseUrl, runtimeRadiusMeters } =
    manifest.imageSelection.panorama;
  const selectedPanoramas = panoramaPoses
    .map((pose) => ({
      ...pose,
      distance: Math.hypot(pose.east - originUtm[0], pose.north - originUtm[1]),
    }))
    .filter(({ distance }) => distance <= runtimeRadiusMeters)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 8);
  for (const pose of selectedPanoramas) {
    const key = `panorama/${pose.id}`;
    sourceImages.set(key, {
      key,
      kind: "panorama",
      id: pose.id,
      sourcePath: path.join(panoramaMirrorRoot, `${pose.id}.jpg`),
      sourceUrl: `${imageBaseUrl}/${pose.id}.jpg`,
    });
  }
}

const imageSources = [...sourceImages.values()].sort((left, right) =>
  left.key.localeCompare(right.key)
);
const entries = new Array(imageSources.length);
let nextIndex = 0;
const worker = async () => {
  while (nextIndex < imageSources.length) {
    const index = nextIndex++;
    const image = imageSources[index];
    if (image.sourceUrl) await downloadOnce(image.sourceUrl, image.sourcePath);
    if (!(await fileExists(image.sourcePath))) {
      throw new Error(`missing source image: ${image.sourcePath}`);
    }

    const sourceDimensions = await imageDimensions(image.sourcePath);
    const displayMaximumDimension = nextLowerPowerOfTwo(
      Math.max(sourceDimensions.width, sourceDimensions.height)
    );
    const displayRelative = `image-display/${image.kind}/${image.id}.jpg`;
    const displayPath = path.join(sceneRoot, displayRelative);
    if (!(await fileExists(displayPath))) {
      await deriveDisplay(
        image.sourcePath,
        displayPath,
        displayMaximumDimension
      );
    }
    const previewRelative = `image-previews/${image.kind}/${image.id}.jpg`;
    const previewPath = path.join(sceneRoot, previewRelative);
    if (!(await fileExists(previewPath))) {
      await derivePreview(displayPath, previewPath);
    }
    const displayDimensions = await imageDimensions(displayPath);
    const previewDimensions = await imageDimensions(previewPath);
    entries[index] = {
      key: image.key,
      kind: image.kind,
      id: image.id,
      source:
        image.sourceUrl ??
        image.sourcePath
          .replace(`${sceneRoot}${path.sep}`, "")
          .split(path.sep)
          .join("/"),
      sourceSha256: await sha256(image.sourcePath),
      sourceWidth: sourceDimensions.width,
      sourceHeight: sourceDimensions.height,
      display: {
        url: `/capture-026-scene/${displayRelative}`,
        mediaType: "image/jpeg",
        quality: 95,
        processing:
          "next-lower-power-of-two maximum edge, Lanczos, mild Lab-luminance sigmoid contrast and unsharp mask",
        ...displayDimensions,
        bytes: (await stat(displayPath)).size,
        sha256: await sha256(displayPath),
      },
      preview: {
        url: `/capture-026-scene/${previewRelative}`,
        mediaType: "image/jpeg",
        quality: 95,
        ...previewDimensions,
        bytes: (await stat(previewPath)).size,
        sha256: await sha256(previewPath),
      },
    };
    console.log(`${index + 1}/${imageSources.length} ${image.key}`);
  }
};

await Promise.all(
  Array.from({ length: Math.min(2, imageSources.length) }, worker)
);
const manifest = {
  format: "carma-capture-026-image-textures-v1",
  previewMaximumDimension,
  displayRule: "next lower power-of-two maximum edge, never upscale",
  sourceSceneManifests: sceneManifestNames,
  imageCount: entries.length,
  images: entries,
};
const outputPath = path.join(sceneRoot, "image-textures.json");
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output: outputPath, images: entries.length }));
