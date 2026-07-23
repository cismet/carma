#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const [reportPath, copcPath, outputPath] = process.argv.slice(2);
if (!reportPath || !copcPath || !outputPath) {
  throw new Error(
    "Usage: finalize-pointcloud-ao-report.mjs REPORT COPC OUTPUT"
  );
}

const hashFile = (path) =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });

const report = JSON.parse(await readFile(reportPath, "utf8"));
if (report.schema !== "carma.pointcloud-ao-bake") {
  throw new Error("Unsupported AO report");
}
const copcStat = await stat(copcPath);
report.output = {
  file: basename(copcPath),
  sha256: await hashFile(copcPath),
  bytes: copcStat.size,
  pointCount: report.source.pointCount,
  extraDimensions: ["AO=uint8"],
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
