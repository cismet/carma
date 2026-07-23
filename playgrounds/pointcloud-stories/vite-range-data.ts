import { createReadStream, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

import type { Plugin } from "vite";

const setRangeHeaders = (response: ServerResponse): void => {
  response.setHeader("Accept-Ranges", "bytes");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Range");
  response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  response.setHeader(
    "Access-Control-Expose-Headers",
    "Accept-Ranges, Content-Length, Content-Range"
  );
};

const contentTypeFor = (filePath: string): string => {
  switch (extname(filePath).toLowerCase()) {
    case ".geojson":
      return "application/geo+json";
    case ".json":
      return "application/json";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
};

/** Serve one immutable local data file with the byte ranges COPC/Zarr need. */
export const serveRangeDataFile = (
  request: IncomingMessage,
  response: ServerResponse,
  filePath: string
): void => {
  setRangeHeaders(response);

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.statusCode = 405;
    response.setHeader("Allow", "GET, HEAD, OPTIONS");
    response.end();
    return;
  }

  const stats = statSync(filePath);
  if (!stats.isFile()) {
    throw new Error("Mounted data resource is not a file");
  }
  const { size } = stats;
  const rangeHeader = request.headers.range;
  if (size === 0 && !rangeHeader) {
    response.setHeader("Content-Type", contentTypeFor(filePath));
    response.setHeader("Content-Length", 0);
    response.end();
    return;
  }
  const explicitRange = rangeHeader?.match(/^bytes=(\d+)-(\d*)$/);
  const suffixRange = rangeHeader?.match(/^bytes-(\d+)$/);
  if (rangeHeader && !explicitRange && !suffixRange) {
    response.statusCode = 416;
    response.setHeader("Content-Range", `bytes */${size}`);
    response.end();
    return;
  }

  const suffixLength = suffixRange ? Number(suffixRange[1]) : 0;
  const start = explicitRange
    ? Number(explicitRange[1])
    : suffixRange
    ? Math.max(0, size - suffixLength)
    : 0;
  const requestedEnd = explicitRange?.[2] ? Number(explicitRange[2]) : size - 1;
  const end = Math.min(requestedEnd, size - 1);

  if (start > end || start >= size || suffixLength < 0) {
    response.statusCode = 416;
    response.setHeader("Content-Range", `bytes */${size}`);
    response.end();
    return;
  }

  response.setHeader("Content-Type", contentTypeFor(filePath));
  if (explicitRange || suffixRange) {
    response.statusCode = 206;
    response.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
  }
  response.setHeader("Content-Length", end - start + 1);

  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath, { start, end }).pipe(response);
};
