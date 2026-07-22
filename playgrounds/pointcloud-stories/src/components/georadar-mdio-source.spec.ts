import { describe, expect, it } from "vitest";

import { crc32c, createGeoradarMdioSource } from "./georadar-mdio-source";

const jsonResponse = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const makeSyntheticStore = () => {
  const chunks = [
    new Uint16Array([0, 4, 8, 12, 16, 20, 24, 28]),
    new Uint16Array([32, 36, 40, 44, 48, 52, 56, 60]),
  ];
  const chunkBytes = chunks.map(
    (chunk) => new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  );
  const indexPayload = new Uint8Array(32);
  const indexView = new DataView(indexPayload.buffer);
  let offset = 0;
  chunkBytes.forEach((chunk, index) => {
    indexView.setBigUint64(index * 16, BigInt(offset), true);
    indexView.setBigUint64(index * 16 + 8, BigInt(chunk.byteLength), true);
    offset += chunk.byteLength;
  });
  const index = new Uint8Array(indexPayload.byteLength + 4);
  index.set(indexPayload);
  new DataView(index.buffer).setUint32(
    indexPayload.byteLength,
    crc32c(indexPayload),
    true
  );
  const shard = new Uint8Array(offset + index.byteLength);
  offset = 0;
  for (const chunk of chunkBytes) {
    shard.set(chunk, offset);
    offset += chunk.byteLength;
  }
  shard.set(index, offset);
  return { shard, indexBytes: index.byteLength };
};

describe("createGeoradarMdioSource", () => {
  it("validates the sharding index and reuses range-loaded chunks", async () => {
    const { shard, indexBytes } = makeSyntheticStore();
    const ranges: string[] = [];
    const fetchFunction: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/zarr.json") && !url.includes("/amplitude/")) {
        return jsonResponse({
          zarr_format: 3,
          node_type: "group",
          attributes: {
            apiVersion: "1.2.0",
            attributes: {
              carmaFormat: "carma-georadar-mdio-v1",
              signal: {
                normalizedAmplitudeHistogram256: Array(256).fill(1),
                activeSampleCount: 15,
              },
            },
          },
        });
      }
      if (url.endsWith("/amplitude/zarr.json")) {
        return jsonResponse({
          zarr_format: 3,
          node_type: "array",
          shape: [4, 2, 2],
          dimension_names: ["slice", "trace", "depth"],
          chunk_grid: { configuration: { chunk_shape: [4, 2, 2] } },
          codecs: [
            {
              name: "sharding_indexed",
              configuration: {
                chunk_shape: [2, 2, 2],
                codecs: [{ name: "bytes" }],
                index_codecs: [{ name: "bytes" }, { name: "crc32c" }],
                index_location: "end",
              },
            },
          ],
        });
      }
      const range = new Headers(init?.headers).get("range");
      if (!range) throw new Error("missing range");
      ranges.push(range);
      const suffix = range.match(/^bytes=-(\d+)$/);
      const explicit = range.match(/^bytes=(\d+)-(\d+)$/);
      const start = suffix
        ? shard.byteLength - Number(suffix[1])
        : Number(explicit?.[1]);
      const end = suffix ? shard.byteLength - 1 : Number(explicit?.[2]);
      return new Response(shard.slice(start, end + 1), {
        status: 206,
        headers: { "Content-Range": `bytes ${start}-${end}/${shard.length}` },
      });
    };
    const source = await createGeoradarMdioSource({
      storeUrl: "https://example.test/capture.mdio",
      expectedShape: { slice: 4, trace: 2, depth: 2 },
      signalOffset: 0,
      maximumCode: 64,
      fetchFunction,
    });

    const request = {
      sliceWindows: [
        { start: 0, end: 1 },
        { start: 1, end: 3 },
      ],
      depthWindows: [{ start: 0, end: 2 }],
    };
    const first = await source.loadSegmentValues(request);
    const second = await source.loadSegmentValues(request);

    expect(Array.from(first)).toEqual(Array.from(second));
    expect(first).toHaveLength(4);
    expect(ranges[0]).toBe(`bytes=-${indexBytes}`);
    expect(ranges).toHaveLength(3);
    expect(source.getMetrics()).toMatchObject({
      rangeRequests: 3,
      cacheHits: 2,
      cacheMisses: 2,
      residentChunks: 2,
    });
    source.dispose();
  });

  it("rejects a corrupt CRC32C index", async () => {
    const { shard } = makeSyntheticStore();
    shard[shard.length - 1] ^= 0xff;
    const fetchFunction: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/zarr.json") && !url.includes("/amplitude/")) {
        return jsonResponse({
          zarr_format: 3,
          node_type: "group",
          attributes: {
            attributes: { carmaFormat: "carma-georadar-mdio-v1" },
          },
        });
      }
      if (url.endsWith("/amplitude/zarr.json")) {
        return jsonResponse({
          zarr_format: 3,
          node_type: "array",
          shape: [4, 2, 2],
          dimension_names: ["slice", "trace", "depth"],
          chunk_grid: { configuration: { chunk_shape: [4, 2, 2] } },
          codecs: [
            {
              name: "sharding_indexed",
              configuration: {
                chunk_shape: [2, 2, 2],
                codecs: [{ name: "bytes" }],
                index_codecs: [{ name: "bytes" }, { name: "crc32c" }],
                index_location: "end",
              },
            },
          ],
        });
      }
      const range = new Headers(init?.headers).get("range")!;
      const suffixBytes = Number(range.slice("bytes=-".length));
      const start = shard.length - suffixBytes;
      return new Response(shard.slice(start), {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${shard.length - 1}/${shard.length}`,
        },
      });
    };

    await expect(
      createGeoradarMdioSource({
        storeUrl: "https://example.test/capture.mdio",
        expectedShape: { slice: 4, trace: 2, depth: 2 },
        signalOffset: 0,
        maximumCode: 64,
        fetchFunction,
      })
    ).rejects.toThrow("CRC32C");
  });
});
