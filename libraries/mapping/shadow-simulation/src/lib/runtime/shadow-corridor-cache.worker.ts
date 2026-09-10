import {
  createDerivedBufferCache,
  decodeTypedBinaryRecord,
  encodeTypedBinaryRecord,
  resolveDerivedCacheAssetEpoch,
  type DerivedBufferCache,
  type DerivedCacheCosts,
} from "@carma-commons/utils";

import {
  SHADOW_CORRIDOR_CACHE,
  SHADOW_CORRIDOR_CACHE_OPERATION,
  isShadowCorridorCacheRecord,
  isShadowCorridorPackedEnvelope,
  shadowCorridorCacheKey,
  type ShadowCorridorCacheCapture,
  type ShadowCorridorCacheIdentity,
  type ShadowCorridorCacheRecord,
  type ShadowCorridorPackedCapture,
} from "../core/shadow-corridor-cache-record";

export type ShadowCorridorCacheRequest = Readonly<{
  id: number;
  producerAssetUrl: string;
  identity: ShadowCorridorCacheIdentity;
}> &
  (
    | Readonly<{ operation: typeof SHADOW_CORRIDOR_CACHE_OPERATION.read }>
    | Readonly<{
        operation: typeof SHADOW_CORRIDOR_CACHE_OPERATION.write;
        capture: ShadowCorridorCacheCapture;
        costs?: DerivedCacheCosts;
      }>
    | Readonly<{
        operation: typeof SHADOW_CORRIDOR_CACHE_OPERATION.writePacked;
        capture: ShadowCorridorPackedCapture;
        costs?: DerivedCacheCosts;
      }>
  );
export type ShadowCorridorCacheResponse = Readonly<{
  id: number;
  record: ShadowCorridorCacheRecord | null;
  written: boolean;
}>;

let manager: DerivedBufferCache | null = null;
let producerEpoch: string | null = null;
let busy = false;

const execute = async (
  request: ShadowCorridorCacheRequest
): Promise<ShadowCorridorCacheResponse> => {
  const missing = { id: request.id, record: null, written: false };
  const main = resolveDerivedCacheAssetEpoch({
    assetUrl: request.producerAssetUrl,
    production: import.meta.env.PROD,
  });
  const worker = resolveDerivedCacheAssetEpoch({
    assetUrl: self.location.href,
    production: import.meta.env.PROD,
  });
  const key = shadowCorridorCacheKey(request.identity);
  if (!main || !worker || !key) return missing;
  const epoch = JSON.stringify([main, worker]);
  if (producerEpoch && epoch !== producerEpoch) return missing;
  if (!manager) {
    producerEpoch = epoch;
    // Shared physical database budget must match the terrain producer policy.
    manager = createDerivedBufferCache({
      capacityBytes: 256 * 1024 ** 2,
      producerEpoch: epoch,
    });
  }
  const records = manager.register(
    SHADOW_CORRIDOR_CACHE.namespace,
    SHADOW_CORRIDOR_CACHE.schema
  );
  if (request.operation === SHADOW_CORRIDOR_CACHE_OPERATION.read) {
    const started = performance.now();
    const cached = await records.get<Blob>(key);
    if (!cached || !(cached.value instanceof Blob)) return missing;
    try {
      const record = await decodeTypedBinaryRecord<ShadowCorridorCacheRecord>(
        cached.value,
        { maxBytes: SHADOW_CORRIDOR_CACHE.maximumRecordBytes }
      );
      if (!isShadowCorridorCacheRecord(record, request.identity)) {
        await records.remove(key);
        return missing;
      }
      await records.updateCosts(key, {
        restoreMs: performance.now() - started,
      });
      return { ...missing, record };
    } catch {
      await records.remove(key);
      return missing;
    }
  }
  let capture: ShadowCorridorCacheCapture;
  if (request.operation === SHADOW_CORRIDOR_CACHE_OPERATION.writePacked) {
    if (!isShadowCorridorPackedEnvelope(request.capture)) return missing;
    const { rgba, ...coordinates } = request.capture;
    const pixels = coordinates.width * coordinates.height;
    const visibility = new Float32Array(pixels);
    const depth = new Float32Array(pixels);
    for (let index = 0; index < pixels; index += 1) {
      visibility[index] = rgba[index * 4];
      depth[index] = rgba[index * 4 + 1];
    }
    capture = { ...coordinates, visibility, depth };
  } else if (request.operation === SHADOW_CORRIDOR_CACHE_OPERATION.write) {
    capture = request.capture;
  } else return missing;
  const record: ShadowCorridorCacheRecord = {
    ...capture,
    identity: request.identity,
    schema: SHADOW_CORRIDOR_CACHE.schema,
  };
  if (!isShadowCorridorCacheRecord(record, request.identity)) return missing;
  const blob = encodeTypedBinaryRecord(record, {
    maxBytes: SHADOW_CORRIDOR_CACHE.maximumRecordBytes,
  });
  const written = await records.put(key, blob, {
    bytes: blob.size,
    recomputeMs: request.costs?.recomputeMs,
    restoreMs: request.costs?.restoreMs,
  });
  return { ...missing, written };
};

// Decision: SHADOW_CORRIDOR_CACHE.md, PERSISTENT-CORRIDOR-20260908. One optional
// worker owns validation/serialization/IDB; no terrain-codec dependency or queue.
self.onmessage = async (event: MessageEvent<ShadowCorridorCacheRequest>) => {
  const request = event.data;
  if (busy) {
    self.postMessage({ id: request.id, record: null, written: false });
    return;
  }
  busy = true;
  try {
    const response = await execute(request);
    const transfer = response.record
      ? ([
          ...new Set([
            response.record.visibility.buffer,
            response.record.depth.buffer,
          ]),
        ] as ArrayBuffer[])
      : [];
    self.postMessage(response, { transfer });
  } catch {
    self.postMessage({ id: request.id, record: null, written: false });
  } finally {
    busy = false;
  }
};
