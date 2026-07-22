#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [derivedRoot, reportRoot, outputPath] = process.argv.slice(2);
if (!derivedRoot || !reportRoot || !outputPath) {
  throw new Error(
    "Usage: create-pointcloud-publication-manifest.mjs DERIVED REPORTS OUTPUT"
  );
}

const files = [
  "kaiser-wilhelm-hain-rgb.copc.laz",
  "awg-2-segmentierung.copc.laz",
  "wuppertal-oelberg-mls-2025-09-11.copc.laz",
  "nordbahntrasse-2025-12-segments.copc.laz",
];
const assets = [];
for (const file of files) {
  const reportFile = `${file}.ao-report.json`;
  const reportBytes = await readFile(join(reportRoot, reportFile));
  const report = JSON.parse(reportBytes.toString("utf8"));
  let localBytes = null;
  try {
    localBytes = (await stat(join(derivedRoot, file))).size;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (
    report.schema !== "carma.pointcloud-ao-bake" ||
    report.output?.file !== file ||
    !Number.isSafeInteger(report.output?.bytes) ||
    (localBytes !== null && report.output.bytes !== localBytes)
  ) {
    throw new Error(`AO report does not match ${file}`);
  }
  const publicationFile = `${file.slice(
    0,
    -".copc.laz".length
  )}-mesh2024-ao-v1-${report.output.sha256.slice(0, 12)}.copc.laz`;
  const retainedFields = report.fields?.retainedPayload ?? [];
  if (retainedFields.some((name) => name !== name.toLowerCase())) {
    throw new Error(`${file}: publication fields must be lowercase`);
  }
  const fields = [
    ...retainedFields.map((name) => name.replaceAll("_", "")),
    "ao",
  ];
  const hasRgb = ["red", "green", "blue"].every((name) =>
    fields.includes(name)
  );
  assets.push({
    id: report.asset,
    file,
    publicationFile,
    bytes: report.output.bytes,
    sha256: report.output.sha256,
    pointCount: report.output.pointCount,
    fields,
    hasRgb,
    reportSource: reportFile,
    report: `${publicationFile}.ao-report.json`,
    reportBytes: reportBytes.byteLength,
    reportSha256: createHash("sha256").update(reportBytes).digest("hex"),
  });
}

const manifest = {
  schema: "carma.pointcloud-publication",
  version: 1,
  release: "mesh2024-ao-v1",
  publicBaseUrl:
    "https://wupp-3d-data.cismet.de/mesh2024/pointclouds/",
  serverRequirements: [
    "HTTPS",
    "Range GET returns HTTP 206 with a correct Content-Range",
    "CORS GET/HEAD",
    "immutable cache policy for versioned files",
  ],
  assets,
};
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
