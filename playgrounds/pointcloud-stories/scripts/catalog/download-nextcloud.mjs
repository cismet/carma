#!/usr/bin/env node

import { createWriteStream } from "node:fs";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const [shareUrl, destination] = process.argv.slice(2);
const listOnly = process.argv.includes("--list-only");
if (!shareUrl || !destination) {
  console.error("usage: download-nextcloud.mjs SHARE_URL DESTINATION");
  process.exit(2);
}

const parsed = new URL(shareUrl);
const share = parsed.pathname.split("/").filter(Boolean).at(-1);
const webdav = new URL(`/public.php/dav/files/${share}/`, parsed.origin);
const propfindBody = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/><d:getcontentlength/><d:getetag/><d:getlastmodified/><d:getcontenttype/></d:prop></d:propfind>`;

function xmlText(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", "\"").replaceAll("&#39;", "'");
}

function field(block, name) {
  return xmlText(block.match(new RegExp(`<[^>]*:?${name}[^>]*>([\\s\\S]*?)<\\/[^>]*:?${name}>`, "i"))?.[1]?.trim() ?? "");
}

function parseResponses(xml) {
  return [...xml.matchAll(/<(?:[\w-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?response>/gi)].map((match) => {
    const block = match[1];
    return {
      href: decodeURIComponent(field(block, "href")),
      displayName: field(block, "displayname"),
      directory: /<(?:[\w-]+:)?collection\s*\/>/i.test(block),
      bytes: Number(field(block, "getcontentlength") || 0),
      etag: field(block, "getetag"),
      modified: field(block, "getlastmodified")
    };
  });
}

async function list(remotePath = "") {
  const url = new URL(remotePath.split("/").map(encodeURIComponent).join("/"), webdav);
  const response = await fetch(url, {
    method: "PROPFIND",
    headers: { Depth: "1", "Content-Type": "application/xml", "X-Requested-With": "XMLHttpRequest" },
    body: propfindBody
  });
  if (response.status !== 207) throw new Error(`PROPFIND failed: HTTP ${response.status}`);
  return parseResponses(await response.text());
}

async function download(remotePath, localPath, expectedBytes) {
  await mkdir(path.dirname(localPath), { recursive: true });
  try {
    if ((await stat(localPath)).size === expectedBytes) return;
  } catch {}
  const partial = `${localPath}.partial`;
  let offset = 0;
  try { offset = (await stat(partial)).size; } catch {}
  const url = new URL(remotePath.split("/").map(encodeURIComponent).join("/"), webdav);
  const headers = {};
  if (offset > 0) headers.Range = `bytes=${offset}-`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`GET ${remotePath} failed: HTTP ${response.status}`);
  const append = offset > 0 && response.status === 206;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial, { flags: append ? "a" : "w" }));
  await rename(partial, localPath);
}

const rootEntries = await list();
if (process.argv.includes("--debug")) console.error(JSON.stringify({ webdav: webdav.pathname, rootEntries }, null, 2));
const rootHref = rootEntries[0]?.href?.replace(/\/$/, "") ?? `/public.php/dav/files/${share}`;
const manifest = [];

if (rootEntries.length === 1 && !rootEntries[0].directory) {
  const entry = rootEntries[0];
  const fileName = entry.displayName || `share-${share}`;
  if (!listOnly) await download("", path.join(destination, fileName), entry.bytes);
  manifest.push({ path: fileName, bytes: entry.bytes, etag: entry.etag, modified: entry.modified });
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, "source-manifest.json"), `${JSON.stringify({ source: shareUrl, files: manifest }, null, 2)}\n`);
  console.log(JSON.stringify({ complete: true, listOnly, files: 1, bytes: entry.bytes }));
  process.exit(0);
}

async function visit(remotePath = "") {
  const entries = await list(remotePath);
  for (const entry of entries) {
    const normalizedHref = entry.href.replace(/\/$/, "");
    if (normalizedHref === rootHref || normalizedHref.endsWith(`/${remotePath}`)) continue;
    const relative = normalizedHref.slice(rootHref.length).replace(/^\//, "");
    if (!relative) continue;
    const safeParts = relative.split("/").filter((part) => part && part !== "." && part !== "..");
    const safeRelative = safeParts.join("/");
    if (entry.directory) {
      await visit(safeRelative);
    } else {
      if (!listOnly) await download(safeRelative, path.join(destination, safeRelative), entry.bytes);
      manifest.push({ path: safeRelative, bytes: entry.bytes, etag: entry.etag, modified: entry.modified });
      if (!listOnly) console.log(JSON.stringify({ file: safeRelative, bytes: entry.bytes, downloaded: true }));
    }
  }
}

await mkdir(destination, { recursive: true });
await visit();
await writeFile(path.join(destination, "source-manifest.json"), `${JSON.stringify({ source: shareUrl, files: manifest }, null, 2)}\n`);
console.log(JSON.stringify({ complete: true, listOnly, files: manifest.length, bytes: manifest.reduce((sum, file) => sum + file.bytes, 0) }));
