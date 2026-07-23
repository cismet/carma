#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readFile, readdir, rename, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const [url, destinationArg, expectedBytesArg, expectedSha256, workersArg = "6"] = process.argv.slice(2);
const expectedBytes = Number(expectedBytesArg);
const workers = Number(workersArg);
if (!url || !destinationArg || !Number.isSafeInteger(expectedBytes) || expectedBytes <= 0 || !/^[a-f0-9]{64}$/i.test(expectedSha256 ?? "") || !Number.isInteger(workers) || workers < 1) {
  console.error("usage: download-ranges.mjs URL DESTINATION EXPECTED_BYTES EXPECTED_SHA256 [WORKERS]");
  process.exit(2);
}

const destination = path.resolve(destinationArg);
const legacyPartial = `${destination}.partial`;
const partsDir = `${destination}.parts`;
await mkdir(path.dirname(destination), { recursive: true });
await mkdir(partsDir, { recursive: true });

try {
  const existing = await stat(legacyPartial);
  if (existing.size > 0) {
    const firstPart = path.join(partsDir, `0-${existing.size - 1}.part`);
    try { await stat(firstPart); } catch { await rename(legacyPartial, firstPart); }
  }
} catch {}

const foundParts = (await readdir(partsDir)).map((name) => {
  const match = name.match(/^(\d+)-(\d+)\.part$/);
  return match ? { name, start: Number(match[1]), end: Number(match[2]) } : null;
}).filter(Boolean).sort((a, b) => a.start - b.start);

let coveredUntil = -1;
for (const part of foundParts) {
  if (part.start !== coveredUntil + 1) break;
  const size = (await stat(path.join(partsDir, part.name))).size;
  if (size !== part.end - part.start + 1) break;
  coveredUntil = part.end;
}

const startOffset = coveredUntil + 1;
const remaining = expectedBytes - startOffset;
if (remaining < 0) throw new Error("existing partial exceeds expected size");
const planFile = path.join(partsDir, "plan.json");
let ranges;
try {
  const plan = JSON.parse(await readFile(planFile, "utf8"));
  if (plan.expectedBytes !== expectedBytes || plan.expectedSha256 !== expectedSha256.toLowerCase()) throw new Error("saved range plan does not match requested source");
  ranges = plan.ranges;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  const chunkSize = Math.ceil(remaining / workers);
  ranges = [];
  for (let start = startOffset; start < expectedBytes; start += chunkSize) {
    ranges.push({ start, end: Math.min(expectedBytes - 1, start + chunkSize - 1) });
  }
  await writeFile(planFile, `${JSON.stringify({ expectedBytes, expectedSha256: expectedSha256.toLowerCase(), ranges }, null, 2)}\n`);
}

async function fetchRange(range) {
  const file = path.join(partsDir, `${range.start}-${range.end}.part`);
  let present = 0;
  try { present = (await stat(file)).size; } catch {}
  const required = range.end - range.start + 1;
  if (present === required) return;
  if (present > required) throw new Error(`oversized part ${path.basename(file)}`);
  const requestStart = range.start + present;
  const response = await fetch(url, { redirect: "follow", headers: { Range: `bytes=${requestStart}-${range.end}` } });
  if (response.status !== 206) throw new Error(`range ${requestStart}-${range.end} failed: HTTP ${response.status}`);
  const contentRange = response.headers.get("content-range") ?? "";
  if (!contentRange.startsWith(`bytes ${requestStart}-${range.end}/`)) throw new Error(`unexpected Content-Range: ${contentRange}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file, { flags: present ? "a" : "w" }));
  const completed = (await stat(file)).size;
  if (completed !== required) throw new Error(`incomplete part ${path.basename(file)}: ${completed}/${required}`);
  console.log(JSON.stringify({ completeRange: [range.start, range.end], bytes: required }));
}

await Promise.all(ranges.map(fetchRange));

const allParts = (await readdir(partsDir)).map((name) => {
  const match = name.match(/^(\d+)-(\d+)\.part$/);
  return match ? { name, start: Number(match[1]), end: Number(match[2]) } : null;
}).filter(Boolean).sort((a, b) => a.start - b.start);

const assembling = `${destination}.assembling`;
const output = await open(assembling, "w");
const hash = createHash("sha256");
let position = 0;
try {
  for (const part of allParts) {
    if (part.start !== position) throw new Error(`gap before ${part.name}`);
    const file = path.join(partsDir, part.name);
    const required = part.end - part.start + 1;
    if ((await stat(file)).size !== required) throw new Error(`wrong size for ${part.name}`);
    for await (const chunk of createReadStream(file)) {
      hash.update(chunk);
      await output.write(chunk, 0, chunk.length, position);
      position += chunk.length;
    }
  }
} finally {
  await output.close();
}
if (position !== expectedBytes) throw new Error(`assembled size mismatch: ${position}/${expectedBytes}`);
const actualSha256 = hash.digest("hex");
if (actualSha256 !== expectedSha256.toLowerCase()) throw new Error(`SHA-256 mismatch: ${actualSha256}`);
await rename(assembling, destination);
for (const part of allParts) await unlink(path.join(partsDir, part.name));
await unlink(planFile);
await rmdir(partsDir);
console.log(JSON.stringify({ complete: true, destination: path.basename(destination), bytes: expectedBytes, sha256: actualSha256 }));
