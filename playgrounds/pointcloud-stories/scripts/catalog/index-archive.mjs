#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const [archiveArg, outputPrefixArg] = process.argv.slice(2);
if (!archiveArg || !outputPrefixArg) {
  console.error("usage: index-archive.mjs ARCHIVE OUTPUT_PREFIX");
  process.exit(2);
}

const archive = path.resolve(archiveArg);
const outputPrefix = path.resolve(outputPrefixArg);

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function zipMembers(file) {
  const { stdout } = await execFileAsync("unzip", ["-l", file], { maxBuffer: 256 * 1024 * 1024 });
  const members = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2})\s+(.+)$/);
    if (!match) continue;
    members.push({ path: match[4], bytes: Number(match[1]), modified: `${match[2]} ${match[3]}`, kind: match[4].endsWith("/") ? "directory" : "file" });
  }
  return members;
}

async function tarMembers(file) {
  const { stdout } = await execFileAsync("tar", ["-tf", file], { maxBuffer: 256 * 1024 * 1024 });
  return stdout.split(/\r?\n/).filter(Boolean).map((name) => ({ path: name, kind: name.endsWith("/") ? "directory" : "file" }));
}

const lower = archive.toLowerCase();
const format = lower.endsWith(".zip") ? "zip" : lower.endsWith(".tar") || lower.endsWith(".tar.gz") || lower.endsWith(".tgz") ? "tar" : null;
if (!format) throw new Error(`unsupported archive format: ${archive}`);
const members = format === "zip" ? await zipMembers(archive) : await tarMembers(archive);
const files = members.filter((member) => member.kind === "file");
const extensions = {};
const topLevel = {};
for (const member of files) {
  const ext = path.extname(member.path).toLowerCase() || "[none]";
  extensions[ext] = (extensions[ext] ?? 0) + 1;
  const top = member.path.split("/")[0] || "[root]";
  topLevel[top] = (topLevel[top] ?? 0) + 1;
}
await mkdir(path.dirname(outputPrefix), { recursive: true });
await writeFile(`${outputPrefix}.members.jsonl`, `${members.map((member) => JSON.stringify(member)).join("\n")}\n`);
const summary = {
  schemaVersion: 1,
  archive: path.basename(archive),
  format,
  archiveBytes: (await stat(archive)).size,
  sha256: await sha256(archive),
  members: members.length,
  files: files.length,
  directories: members.length - files.length,
  uncompressedBytes: files.reduce((sum, member) => sum + (member.bytes ?? 0), 0),
  extensions,
  topLevel
};
await writeFile(`${outputPrefix}.summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ archive: summary.archive, files: summary.files, sha256: summary.sha256 }));
