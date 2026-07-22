#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootArg = process.argv.find((arg) => arg.startsWith("--root="))?.slice("--root=".length);
const root = path.resolve(rootArg || process.env.TWIN4ROAD_CATALOG_ROOT || defaultRoot);
const rootsFile = path.join(root, ".local", "roots.json");
const outDir = path.join(root, "catalog");
const hashMode = process.argv.includes("--hash-archives");
const archivePattern = /\.(?:zip|tar|tgz|tar\.gz|7z)$/i;
const ignoredNames = new Set([".DS_Store", ".cache"]);

const roots = JSON.parse(await readFile(rootsFile, "utf8"));
roots.catalog = root;

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function walk(rootId, base, relative = "") {
  const absolute = path.join(base, relative);
  const entries = await readdir(absolute, { withFileTypes: true });
  const records = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (ignoredNames.has(entry.name) || (rootId === "catalog" && entry.name === ".local")) continue;
    const rel = path.posix.join(relative.split(path.sep).join(path.posix.sep), entry.name);
    const full = path.join(base, rel);
    const stat = await lstat(full);
    if (stat.isDirectory()) {
      records.push(...await walk(rootId, base, rel));
      continue;
    }
    const record = {
      root: rootId,
      path: rel,
      kind: stat.isSymbolicLink() ? "symlink" : "file",
      bytes: stat.size,
      modified: stat.mtime.toISOString(),
      device: Number(stat.dev),
      inode: Number(stat.ino),
      hardLinks: stat.nlink
    };
    if (stat.isSymbolicLink()) {
      try {
        const resolved = await realpath(full);
        record.targetExists = true;
        record.targetKind = (await lstat(resolved)).isDirectory() ? "directory" : "file";
      } catch {
        record.targetExists = false;
      }
    } else if (hashMode && archivePattern.test(entry.name)) {
      record.sha256 = await sha256(full);
    }
    records.push(record);
  }
  return records;
}

await mkdir(outDir, { recursive: true });
const all = [];
for (const [rootId, configuredPath] of Object.entries(roots)) {
  const base = path.resolve(configuredPath);
  try {
    all.push(...await walk(rootId, base));
  } catch (error) {
    all.push({ root: rootId, path: "", kind: "unavailable", error: error.message });
  }
}

await writeFile(path.join(outDir, "inventory.jsonl"), `${all.map((r) => JSON.stringify(r)).join("\n")}\n`);

const summary = {};
for (const record of all) {
  const current = summary[record.root] ??= { files: 0, bytes: 0, unavailable: false, extensions: {} };
  if (record.kind === "unavailable") {
    current.unavailable = true;
    continue;
  }
  current.files += 1;
  current.bytes += record.bytes ?? 0;
  const ext = path.extname(record.path).toLowerCase() || "[none]";
  current.extensions[ext] = (current.extensions[ext] ?? 0) + 1;
}
await writeFile(path.join(outDir, "summary.json"), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  records: all.length,
  rootCount: Object.keys(summary).length,
  roots: summary
}, null, 2)}\n`);
console.log(JSON.stringify({ records: all.length, roots: Object.keys(summary).length, output: "catalog/inventory.jsonl" }));
