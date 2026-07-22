export type GeoradarSampleWindow = {
  start: number;
  end: number;
};

export type GeoradarSegmentSampleRequest = {
  sliceWindows: readonly GeoradarSampleWindow[];
  depthWindows: readonly GeoradarSampleWindow[];
};

export type GeoradarMdioMetrics = {
  metadataRequests: number;
  metadataBytes: number;
  rangeRequests: number;
  rangeBytes: number;
  cacheHits: number;
  cacheMisses: number;
  residentChunks: number;
  residentBytes: number;
  decodedSamples: number;
  aggregationMilliseconds: number;
};

export type GeoradarMdioSource = {
  kind: "mdio-zarr-v3";
  histogram256: number[];
  activeSampleCount?: number;
  loadSegmentValues: (
    request: GeoradarSegmentSampleRequest
  ) => Promise<Float32Array>;
  getMetrics: () => GeoradarMdioMetrics;
  getStatus: () => string;
  dispose: () => void;
};

type ZarrCodec = {
  name: string;
  configuration?: {
    chunk_shape?: number[];
    codecs?: ZarrCodec[];
    index_codecs?: ZarrCodec[];
    index_location?: string;
  };
};

type ZarrArrayMetadata = {
  zarr_format: number;
  node_type: "array";
  shape: number[];
  dimension_names?: string[];
  chunk_grid: { configuration: { chunk_shape: number[] } };
  codecs: ZarrCodec[];
};

type ZarrGroupMetadata = {
  zarr_format: number;
  node_type: "group";
  attributes?: {
    apiVersion?: string;
    attributes?: {
      carmaFormat?: string;
      signal?: {
        normalizedAmplitudeHistogram256?: number[];
        activeSampleCount?: number;
      };
    };
  };
};

type ChunkIndexEntry = { offset: number; byteLength: number };
type ChunkCacheEntry = {
  promise: Promise<Uint16Array>;
  byteLength: number;
};

const UINT16_BYTES = Uint16Array.BYTES_PER_ELEMENT;
const DEFAULT_CACHE_BYTES = 32 * 1024 ** 2;
const DEFAULT_CONCURRENT_REQUESTS = 4;
const MISSING_SHARD_VALUE = 0xffff_ffff_ffff_ffffn;

export const crc32c = (bytes: Uint8Array) => {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0x82f6_3b78 : 0);
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
};

const product = (values: readonly number[]) =>
  values.reduce((result, value) => result * value, 1);

const arraysEqual = (left: readonly unknown[], right: readonly unknown[]) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const formatMebibytes = (bytes: number) => (bytes / 1024 ** 2).toFixed(1);

const createRequestQueue = (maximumConcurrent: number) => {
  const pending: Array<() => void> = [];
  let active = 0;
  const pump = () => {
    while (active < maximumConcurrent && pending.length > 0) {
      active += 1;
      pending.shift()?.();
    }
  };
  const schedule = <Result>(task: () => Promise<Result>) =>
    new Promise<Result>((resolve, reject) => {
      pending.push(() => {
        void task()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            pump();
          });
      });
      pump();
    });
  return { schedule };
};

const readJson = async <Result>(
  fetchFunction: typeof fetch,
  url: string,
  signal: AbortSignal,
  metrics: GeoradarMdioMetrics
) => {
  const response = await fetchFunction(url, { cache: "force-cache", signal });
  if (!response.ok) {
    throw new Error(
      `MDIO-Metadaten nicht verfügbar: ${response.status} ${response.statusText} · ${url}`
    );
  }
  const text = await response.text();
  metrics.metadataRequests += 1;
  metrics.metadataBytes += new TextEncoder().encode(text).byteLength;
  return JSON.parse(text) as Result;
};

const parseIndex = (
  bytes: Uint8Array,
  entryCount: number,
  hasCrc32c: boolean
) => {
  const payloadBytes = entryCount * 2 * BigUint64Array.BYTES_PER_ELEMENT;
  const expectedBytes = payloadBytes + (hasCrc32c ? 4 : 0);
  if (bytes.byteLength !== expectedBytes) {
    throw new Error(
      `MDIO-Shard-Index hat ${bytes.byteLength} statt ${expectedBytes} Byte`
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (hasCrc32c) {
    const expectedCrc = view.getUint32(payloadBytes, true);
    const actualCrc = crc32c(bytes.subarray(0, payloadBytes));
    if (actualCrc !== expectedCrc) {
      throw new Error(
        `MDIO-Shard-Index CRC32C ${actualCrc.toString(
          16
        )} stimmt nicht mit ${expectedCrc.toString(16)} überein`
      );
    }
  }
  return Array.from({ length: entryCount }, (_, index): ChunkIndexEntry => {
    const offset = view.getBigUint64(index * 16, true);
    const byteLength = view.getBigUint64(index * 16 + 8, true);
    if (offset === MISSING_SHARD_VALUE || byteLength === MISSING_SHARD_VALUE) {
      throw new Error(`MDIO-Amplituden-Chunk ${index} fehlt im Shard`);
    }
    const numericOffset = Number(offset);
    const numericByteLength = Number(byteLength);
    if (
      !Number.isSafeInteger(numericOffset) ||
      !Number.isSafeInteger(numericByteLength)
    ) {
      throw new Error(
        `MDIO-Amplituden-Chunk ${index} ist zu groß für JavaScript`
      );
    }
    return { offset: numericOffset, byteLength: numericByteLength };
  });
};

export const createGeoradarMdioSource = async ({
  storeUrl,
  expectedShape,
  signalOffset,
  maximumCode,
  cacheBytes = DEFAULT_CACHE_BYTES,
  maximumConcurrentRequests = DEFAULT_CONCURRENT_REQUESTS,
  fetchFunction = fetch,
}: {
  storeUrl: string;
  expectedShape: { slice: number; trace: number; depth: number };
  signalOffset: number;
  maximumCode: number;
  cacheBytes?: number;
  maximumConcurrentRequests?: number;
  fetchFunction?: typeof fetch;
}): Promise<GeoradarMdioSource> => {
  const rootUrl = storeUrl.replace(/\/$/, "");
  const abortController = new AbortController();
  const metrics: GeoradarMdioMetrics = {
    metadataRequests: 0,
    metadataBytes: 0,
    rangeRequests: 0,
    rangeBytes: 0,
    cacheHits: 0,
    cacheMisses: 0,
    residentChunks: 0,
    residentBytes: 0,
    decodedSamples: 0,
    aggregationMilliseconds: 0,
  };
  const [rootMetadata, amplitudeMetadata] = await Promise.all([
    readJson<ZarrGroupMetadata>(
      fetchFunction,
      `${rootUrl}/zarr.json`,
      abortController.signal,
      metrics
    ),
    readJson<ZarrArrayMetadata>(
      fetchFunction,
      `${rootUrl}/amplitude/zarr.json`,
      abortController.signal,
      metrics
    ),
  ]);
  if (
    rootMetadata.zarr_format !== 3 ||
    rootMetadata.node_type !== "group" ||
    rootMetadata.attributes?.attributes?.carmaFormat !==
      "carma-georadar-mdio-v1"
  ) {
    throw new Error(`Kein unterstützter CARMA-MDIO-v1-Store: ${rootUrl}`);
  }
  const expectedArrayShape = [
    expectedShape.slice,
    expectedShape.trace,
    expectedShape.depth,
  ];
  if (
    amplitudeMetadata.zarr_format !== 3 ||
    amplitudeMetadata.node_type !== "array" ||
    !arraysEqual(amplitudeMetadata.shape, expectedArrayShape) ||
    !arraysEqual(amplitudeMetadata.dimension_names ?? [], [
      "slice",
      "trace",
      "depth",
    ])
  ) {
    throw new Error(
      `MDIO-Amplitude ${amplitudeMetadata.shape.join(
        "×"
      )} passt nicht zum Manifest ${expectedArrayShape.join("×")}`
    );
  }
  const sharding = amplitudeMetadata.codecs.find(
    (codec) => codec.name === "sharding_indexed"
  );
  const innerShape = sharding?.configuration?.chunk_shape;
  const innerCodecs = sharding?.configuration?.codecs ?? [];
  const indexCodecs = sharding?.configuration?.index_codecs ?? [];
  const shardShape = amplitudeMetadata.chunk_grid.configuration.chunk_shape;
  if (
    !sharding ||
    !innerShape ||
    sharding.configuration?.index_location !== "end" ||
    !arraysEqual(innerShape.slice(1), [
      expectedShape.trace,
      expectedShape.depth,
    ]) ||
    !arraysEqual(shardShape.slice(1), [
      expectedShape.trace,
      expectedShape.depth,
    ]) ||
    innerCodecs.length !== 1 ||
    innerCodecs[0].name !== "bytes"
  ) {
    throw new Error(
      "MDIO-Amplitude benötigt unkomprimierte vollständige Trace×Tiefe-Chunks und einen Index am Shard-Ende"
    );
  }
  const chunksPerShard = shardShape.map(
    (size, index) => size / innerShape[index]
  );
  if (
    chunksPerShard.some((value) => !Number.isSafeInteger(value)) ||
    chunksPerShard[1] !== 1 ||
    chunksPerShard[2] !== 1 ||
    expectedShape.slice > shardShape[0]
  ) {
    throw new Error("Nicht unterstütztes MDIO-Amplituden-Shardraster");
  }
  const chunkCount = product(chunksPerShard);
  const indexPayloadBytes = chunkCount * 2 * BigUint64Array.BYTES_PER_ELEMENT;
  const hasIndexCrc32c = indexCodecs.some((codec) => codec.name === "crc32c");
  const indexBytes = indexPayloadBytes + (hasIndexCrc32c ? 4 : 0);
  const shardUrl = `${rootUrl}/amplitude/c/0/0/0`;
  const requestQueue = createRequestQueue(
    Math.max(1, Math.floor(maximumConcurrentRequests))
  );
  const fetchRange = async (range: string) => {
    const response = await fetchFunction(shardUrl, {
      headers: { Range: range },
      cache: "force-cache",
      signal: abortController.signal,
    });
    if (response.status !== 206) {
      throw new Error(
        `MDIO Range/CORS-Fehler: ${response.status} ${response.statusText} für ${range}; Server muss 206 und Content-Range liefern`
      );
    }
    const contentRange = response.headers.get("content-range");
    if (!contentRange) {
      throw new Error(
        `MDIO Range/CORS-Fehler: Content-Range fehlt oder ist nicht exponiert (${range})`
      );
    }
    const buffer = await response.arrayBuffer();
    metrics.rangeRequests += 1;
    metrics.rangeBytes += buffer.byteLength;
    return new Uint8Array(buffer);
  };
  const index = parseIndex(
    await fetchRange(`bytes=-${indexBytes}`),
    chunkCount,
    hasIndexCrc32c
  );
  const chunkSampleCount = product(innerShape);
  const expectedChunkBytes = chunkSampleCount * UINT16_BYTES;
  const cache = new Map<number, ChunkCacheEntry>();

  const updateCacheMetrics = () => {
    metrics.residentChunks = cache.size;
    metrics.residentBytes = Array.from(cache.values()).reduce(
      (sum, entry) => sum + entry.byteLength,
      0
    );
  };
  const evictCache = (protectedIndex: number) => {
    updateCacheMetrics();
    for (const [index, entry] of cache) {
      if (metrics.residentBytes <= cacheBytes) break;
      if (index === protectedIndex || entry.byteLength === 0) continue;
      cache.delete(index);
      metrics.residentBytes -= entry.byteLength;
    }
    metrics.residentChunks = cache.size;
  };
  const loadChunk = (chunkIndex: number) => {
    const cached = cache.get(chunkIndex);
    if (cached) {
      metrics.cacheHits += 1;
      cache.delete(chunkIndex);
      cache.set(chunkIndex, cached);
      return cached.promise;
    }
    const entry = index[chunkIndex];
    if (!entry) throw new Error(`MDIO-Amplituden-Chunk ${chunkIndex} fehlt`);
    metrics.cacheMisses += 1;
    const cacheEntry: ChunkCacheEntry = {
      byteLength: 0,
      promise: requestQueue
        .schedule(() =>
          fetchRange(
            `bytes=${entry.offset}-${entry.offset + entry.byteLength - 1}`
          )
        )
        .then((bytes) => {
          if (bytes.byteLength !== expectedChunkBytes) {
            throw new Error(
              `MDIO-Amplituden-Chunk ${chunkIndex} hat ${bytes.byteLength} statt ${expectedChunkBytes} Byte`
            );
          }
          cacheEntry.byteLength = bytes.byteLength;
          evictCache(chunkIndex);
          return new Uint16Array(
            bytes.buffer,
            bytes.byteOffset,
            bytes.byteLength / UINT16_BYTES
          );
        })
        .catch((reason) => {
          cache.delete(chunkIndex);
          updateCacheMetrics();
          throw reason;
        }),
    };
    cache.set(chunkIndex, cacheEntry);
    updateCacheMetrics();
    return cacheEntry.promise;
  };

  const negativeScale = Math.max(1, signalOffset);
  const positiveScale = Math.max(1, maximumCode - signalOffset);
  const normalize = (sample: number) => {
    const centered = sample - signalOffset;
    return Math.min(
      1,
      Math.abs(
        centered < 0 ? centered / negativeScale : centered / positiveScale
      )
    );
  };
  const loadSegmentValues = async ({
    sliceWindows,
    depthWindows,
  }: GeoradarSegmentSampleRequest) => {
    const startedAt = performance.now();
    const requiredChunkIndices = new Set<number>();
    for (const window of sliceWindows) {
      if (window.start < 0 || window.end > expectedShape.slice) {
        throw new Error(
          `Slice-Fenster ${window.start}:${window.end} ist ungültig`
        );
      }
      for (
        let slice = window.start;
        slice < window.end;
        slice += innerShape[0]
      ) {
        requiredChunkIndices.add(Math.floor(slice / innerShape[0]));
      }
      if (window.end > window.start) {
        requiredChunkIndices.add(Math.floor((window.end - 1) / innerShape[0]));
      }
    }
    const chunks = new Map(
      await Promise.all(
        Array.from(
          requiredChunkIndices,
          async (chunkIndex) =>
            [chunkIndex, await loadChunk(chunkIndex)] as const
        )
      )
    );
    const values = new Float32Array(
      sliceWindows.length * expectedShape.trace * depthWindows.length
    );
    let targetOffset = 0;
    let decodedSamples = 0;
    for (const depthWindow of depthWindows) {
      for (let trace = 0; trace < expectedShape.trace; trace += 1) {
        for (const sliceWindow of sliceWindows) {
          let sum = 0;
          let count = 0;
          for (
            let depth = depthWindow.start;
            depth < depthWindow.end;
            depth += 1
          ) {
            for (
              let slice = sliceWindow.start;
              slice < sliceWindow.end;
              slice += 1
            ) {
              const chunkIndex = Math.floor(slice / innerShape[0]);
              const chunk = chunks.get(chunkIndex);
              if (!chunk) {
                throw new Error(`MDIO-Amplituden-Chunk ${chunkIndex} fehlt`);
              }
              const localSlice = slice - chunkIndex * innerShape[0];
              const sourceOffset =
                (localSlice * expectedShape.trace + trace) *
                  expectedShape.depth +
                depth;
              sum += normalize(chunk[sourceOffset]);
              count += 1;
            }
          }
          values[targetOffset] = count > 0 ? sum / count : 0;
          targetOffset += 1;
          decodedSamples += count;
        }
      }
    }
    metrics.decodedSamples += decodedSamples;
    metrics.aggregationMilliseconds += performance.now() - startedAt;
    return values;
  };
  const signalMetadata = rootMetadata.attributes?.attributes?.signal;
  const histogram256 = signalMetadata?.normalizedAmplitudeHistogram256;
  if (!histogram256 || histogram256.length !== 256) {
    throw new Error(
      "MDIO-Store enthält kein verifiziertes normalizedAmplitudeHistogram256"
    );
  }

  return {
    kind: "mdio-zarr-v3",
    histogram256,
    activeSampleCount: signalMetadata.activeSampleCount,
    loadSegmentValues,
    getMetrics: () => ({ ...metrics }),
    getStatus: () =>
      `MDIO ${metrics.residentChunks}/${chunkCount} Chunks · ${formatMebibytes(
        metrics.residentBytes
      )} MB CPU · ${metrics.rangeRequests} Ranges / ${formatMebibytes(
        metrics.rangeBytes
      )} MB · Cache ${metrics.cacheHits}/${metrics.cacheMisses}`,
    dispose: () => {
      abortController.abort();
      cache.clear();
      updateCacheMetrics();
    },
  };
};
