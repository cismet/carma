#!/usr/bin/env node

import { createWriteStream } from "node:fs";
import { mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const [url, destination] = process.argv.slice(2);
if (!url || !destination) {
  console.error("usage: download-url.mjs URL DESTINATION");
  process.exit(2);
}

await mkdir(path.dirname(path.resolve(destination)), { recursive: true });
const partial = `${destination}.partial`;
let offset = 0;
try { offset = (await stat(partial)).size; } catch {}

const headers = offset > 0 ? { Range: `bytes=${offset}-` } : {};
const response = await fetch(url, { redirect: "follow", headers });
if (!response.ok && response.status !== 206) throw new Error(`download failed: HTTP ${response.status}`);
const append = offset > 0 && response.status === 206;
if (!append) offset = 0;
await pipeline(Readable.fromWeb(response.body), createWriteStream(partial, { flags: append ? "a" : "w" }));
await rename(partial, destination);
console.log(JSON.stringify({ destination: path.basename(destination), bytes: (await stat(destination)).size }));
