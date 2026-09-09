import {
  resolveDerivedCacheAssetEpoch,
  type DerivedCacheCosts,
} from "@carma-commons/utils";

import {
  SHADOW_CORRIDOR_CACHE,
  SHADOW_CORRIDOR_CACHE_OPERATION,
  isShadowCorridorCaptureEnvelope,
  isShadowCorridorPackedEnvelope,
  shadowCorridorCacheKey,
  type ShadowCorridorCacheCapture,
  type ShadowCorridorCacheIdentity,
  type ShadowCorridorCacheRecord,
  type ShadowCorridorPackedCapture,
} from "../core/shadow-corridor-cache-record";
import type {
  ShadowCorridorCacheRequest,
  ShadowCorridorCacheResponse,
} from "./shadow-corridor-cache.worker";

const READ_DEADLINE_MS = 750;
const WRITE_DEADLINE_MS = 5000;
const clients = new Set<{ dispose: () => void }>();

/** Optional single-operation worker; busy calls miss immediately. GPU readback
 * remains owned by the renderer. A successful read is a reprojection candidate,
 * never proof that the current camera's receiver surface is completely covered.
 */
export const createShadowCorridorCache = (producerAssetUrl: string) => {
  const producer = resolveDerivedCacheAssetEpoch({
    assetUrl: producerAssetUrl,
    production: import.meta.env.PROD,
  });
  let worker: Worker | null = null;
  let closed = false;
  let disabled = false;
  let sequence = 0;
  let pending: {
    id: number;
    timer: ReturnType<typeof setTimeout>;
    finish: (response: ShadowCorridorCacheResponse | null) => void;
  } | null = null;

  const stop = () => {
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      worker = null;
    }
    if (pending) {
      const job = pending;
      pending = null;
      clearTimeout(job.timer);
      job.finish(null);
    }
  };
  const fail = () => {
    disabled = true;
    stop();
  };
  const send = (
    request: ShadowCorridorCacheRequest,
    transfer: ArrayBuffer[] = []
  ): Promise<ShadowCorridorCacheResponse | null> => {
    if (
      !producer ||
      closed ||
      disabled ||
      pending ||
      typeof Worker === "undefined"
    )
      return Promise.resolve(null);
    try {
      if (!worker) {
        worker = new Worker(
          new URL("./shadow-corridor-cache.worker.ts", import.meta.url),
          { type: "module" }
        );
        worker.onerror = fail;
        worker.onmessageerror = fail;
        worker.onmessage = (
          event: MessageEvent<ShadowCorridorCacheResponse>
        ) => {
          if (!pending || event.data?.id !== pending.id) return;
          const job = pending;
          pending = null;
          clearTimeout(job.timer);
          job.finish(event.data);
        };
      }
      return new Promise((finish) => {
        const timer = setTimeout(
          fail,
          request.operation === SHADOW_CORRIDOR_CACHE_OPERATION.read
            ? READ_DEADLINE_MS
            : WRITE_DEADLINE_MS
        );
        pending = { id: request.id, timer, finish };
        try {
          worker!.postMessage(request, transfer);
        } catch {
          fail();
        }
      });
    } catch {
      fail();
      return Promise.resolve(null);
    }
  };
  const client = {
    // Superseded solar work is not a storage failure. Release the occupied
    // worker immediately; the next current-time request may start a fresh one.
    cancelPending: stop,
    get enabled() {
      return Boolean(
        producer && !closed && !disabled && typeof Worker !== "undefined"
      );
    },
    get busy() {
      return pending !== null;
    },
    async read(
      identity: ShadowCorridorCacheIdentity
    ): Promise<ShadowCorridorCacheRecord | null> {
      const key = shadowCorridorCacheKey(identity);
      if (!key) return null;
      const response = await send({
        id: ++sequence,
        producerAssetUrl: producer ?? "",
        identity,
        operation: SHADOW_CORRIDOR_CACHE_OPERATION.read,
      });
      const record = response?.record;
      // Pixel scans and binary decoding have already run in the worker.
      return !closed &&
        record?.schema === SHADOW_CORRIDOR_CACHE.schema &&
        shadowCorridorCacheKey(record.identity) === key &&
        isShadowCorridorCaptureEnvelope(record)
        ? record
        : null;
    },
    /** Ownership of both dedicated buffers transfers on admission. Do not pass
     * views into live renderer/source storage, or use these arrays after calling.
     */
    async write(
      identity: ShadowCorridorCacheIdentity,
      capture: ShadowCorridorCacheCapture,
      costs?: DerivedCacheCosts
    ): Promise<boolean> {
      if (
        !shadowCorridorCacheKey(identity) ||
        !isShadowCorridorCaptureEnvelope(capture)
      )
        return false;
      const views = [capture.visibility, capture.depth];
      if (
        views.some(
          (view) =>
            !(view.buffer instanceof ArrayBuffer) ||
            view.byteOffset !== 0 ||
            view.byteLength !== view.buffer.byteLength
        )
      )
        return false;
      const response = await send(
        {
          id: ++sequence,
          producerAssetUrl: producer ?? "",
          identity,
          operation: SHADOW_CORRIDOR_CACHE_OPERATION.write,
          capture,
          costs,
        },
        [...new Set(views.map((view) => view.buffer as ArrayBuffer))]
      );
      return !closed && response?.written === true;
    },
    /** RGBA readback ownership transfers; deinterleaving happens in the worker. */
    async writePacked(
      identity: ShadowCorridorCacheIdentity,
      capture: ShadowCorridorPackedCapture,
      costs?: DerivedCacheCosts
    ): Promise<boolean> {
      if (
        !shadowCorridorCacheKey(identity) ||
        !isShadowCorridorPackedEnvelope(capture) ||
        !(capture.rgba.buffer instanceof ArrayBuffer) ||
        capture.rgba.byteOffset !== 0 ||
        capture.rgba.byteLength !== capture.rgba.buffer.byteLength
      )
        return false;
      const response = await send(
        {
          id: ++sequence,
          producerAssetUrl: producer ?? "",
          identity,
          operation: SHADOW_CORRIDOR_CACHE_OPERATION.writePacked,
          capture,
          costs,
        },
        [capture.rgba.buffer]
      );
      return !closed && response?.written === true;
    },
    dispose() {
      closed = true;
      stop();
      clients.delete(client);
    },
  };
  clients.add(client);
  return client;
};

export type ShadowCorridorCache = ReturnType<typeof createShadowCorridorCache>;

import.meta.hot?.dispose(() => {
  for (const client of clients) client.dispose();
});
