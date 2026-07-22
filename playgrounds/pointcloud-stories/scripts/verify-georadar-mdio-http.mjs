#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const [storeUrlValue, sourceMetadataValue, chunkIndexValue = "0"] =
  process.argv.slice(2);
if (!storeUrlValue || !sourceMetadataValue) {
  console.error(
    "usage: verify-georadar-mdio-http.mjs STORE_URL SOURCE.json [CHUNK_INDEX]"
  );
  process.exit(2);
}

const storeUrl = storeUrlValue.replace(/\/$/, "");
const sourceMetadataPath = resolve(sourceMetadataValue);
const chunkIndex = Number(chunkIndexValue);
if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0) {
  throw new Error(`invalid chunk index: ${chunkIndexValue}`);
}

const fetchOk = async (url, init) => {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  return response;
};

const arrayMetadata = await (
  await fetchOk(`${storeUrl}/amplitude/zarr.json`)
).json();
if (arrayMetadata.dimension_names?.join(",") !== "slice,trace,depth") {
  throw new Error(
    `unexpected MDIO amplitude dimensions: ${arrayMetadata.dimension_names}`
  );
}
const sharding = arrayMetadata.codecs?.find(
  (codec) => codec.name === "sharding_indexed"
);
if (!sharding) throw new Error("MDIO amplitude array is not sharded");

const innerShape = sharding.configuration.chunk_shape;
const shardShape = arrayMetadata.chunk_grid.configuration.chunk_shape;
const chunksPerShard = shardShape.map(
  (value, dimension) => value / innerShape[dimension]
);
if (chunksPerShard.some((value) => !Number.isSafeInteger(value))) {
  throw new Error("inner chunk shape does not divide shard shape");
}
const innerChunkCount = chunksPerShard.reduce(
  (product, value) => product * value,
  1
);
if (chunkIndex >= innerChunkCount) {
  throw new Error(`chunk index ${chunkIndex} is outside ${innerChunkCount}`);
}

const indexPayloadBytes =
  innerChunkCount * 2 * BigUint64Array.BYTES_PER_ELEMENT;
const indexCrcBytes = sharding.configuration.index_codecs?.some(
  (codec) => codec.name === "crc32c"
)
  ? Uint32Array.BYTES_PER_ELEMENT
  : 0;
const indexBytes = indexPayloadBytes + indexCrcBytes;
const shardUrl = `${storeUrl}/amplitude/c/0/0/0`;
const indexResponse = await fetchOk(shardUrl, {
  headers: { Range: `bytes=-${indexBytes}` },
});
if (indexResponse.status !== 206) {
  throw new Error(
    `suffix range returned ${indexResponse.status}, expected 206`
  );
}
const exposedHeaders =
  indexResponse.headers.get("access-control-expose-headers") ?? "";
if (!exposedHeaders.toLowerCase().includes("content-range")) {
  throw new Error("Content-Range is not exposed through CORS");
}
const index = Buffer.from(await indexResponse.arrayBuffer());
if (index.byteLength !== indexBytes) {
  throw new Error(`received ${index.byteLength} of ${indexBytes} index bytes`);
}

const offset = Number(index.readBigUInt64LE(chunkIndex * 16));
const byteLength = Number(index.readBigUInt64LE(chunkIndex * 16 + 8));
const chunkResponse = await fetchOk(shardUrl, {
  headers: { Range: `bytes=${offset}-${offset + byteLength - 1}` },
});
if (chunkResponse.status !== 206) {
  throw new Error(`chunk range returned ${chunkResponse.status}, expected 206`);
}
const chunk = Buffer.from(await chunkResponse.arrayBuffer());
if (chunk.byteLength !== byteLength) {
  throw new Error(`received ${chunk.byteLength} of ${byteLength} chunk bytes`);
}

const sourceMetadata = JSON.parse(await readFile(sourceMetadataPath, "utf8"));
const rawVariant = [
  sourceMetadata.data,
  ...(sourceMetadata.variants ?? []),
].find((variant) => variant?.id === "raw16");
if (!rawVariant) throw new Error("source metadata has no raw16 variant");
const source = await readFile(
  resolve(dirname(sourceMetadataPath), rawVariant.url)
);
const [sliceCount, traceCount, depthCount] = arrayMetadata.shape;
const [slicesPerChunk, chunkTraceCount, chunkDepthCount] = innerShape;
if (chunkTraceCount !== traceCount || chunkDepthCount !== depthCount) {
  throw new Error("MDIO chunk does not contain a complete GPR cross-section");
}
const sliceStart = chunkIndex * slicesPerChunk;
const slicesInChunk = Math.min(slicesPerChunk, sliceCount - sliceStart);
let verifiedBytes = 0;

for (let slice = 0; slice < slicesInChunk; slice += 1) {
  for (let trace = 0; trace < traceCount; trace += 1) {
    for (let depth = 0; depth < depthCount; depth += 1) {
      const sourceSample =
        (depth * traceCount + trace) * sliceCount + sliceStart + slice;
      const chunkSample = (slice * traceCount + trace) * depthCount + depth;
      const sourceValue = source.readUInt16LE(
        sourceSample * Uint16Array.BYTES_PER_ELEMENT
      );
      const chunkValue = chunk.readUInt16LE(
        chunkSample * Uint16Array.BYTES_PER_ELEMENT
      );
      if (sourceValue !== chunkValue) {
        throw new Error(
          `HTTP MDIO chunk differs at slice ${slice}, trace ${trace}, depth ${depth}`
        );
      }
      verifiedBytes += Uint16Array.BYTES_PER_ELEMENT;
    }
  }
}

console.log(
  JSON.stringify(
    {
      storeUrl,
      chunkIndex,
      suffixRange: {
        status: indexResponse.status,
        bytes: index.byteLength,
        contentRange: indexResponse.headers.get("content-range"),
      },
      chunkRange: {
        status: chunkResponse.status,
        bytes: chunk.byteLength,
        contentRange: chunkResponse.headers.get("content-range"),
      },
      byteExactSourceVerification: {
        passed: true,
        verifiedBytes,
      },
    },
    null,
    2
  )
);
