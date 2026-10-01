import { resolveDerivedCacheAssetEpoch } from "@carma-commons/utils";
import { createPersistentTileCache } from "./persistent-tile-cache";
import { terrainIndexArraysEqual } from "../../core/terrain-index-equality";
import type { terrainCacheTree } from "./terrain-cache-tree";

export type TerrainEcefCacheInput = {
  context: string;
  arrays: (Float32Array | Uint16Array | Uint32Array)[];
  tree: ReturnType<typeof terrainCacheTree>;
};
export type TerrainEcefGeometryRecord = {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array | Uint32Array;
  bounds: number[];
  sphere: number[];
  /** Transient worker proof against this read's native input, never trusted
   * from a previously persisted record. */
  indicesUnchanged?: boolean;
};
export type TerrainEcefCacheRequest = {
  id: number;
  producer: string;
  version: string;
  input: TerrainEcefCacheInput;
  record?: TerrainEcefGeometryRecord;
  recomputeMs?: number;
  protectedNodes?: readonly string[];
  usedNodes?: readonly string[];
};
export type TerrainEcefCacheResponse = {
  id: number;
  value: TerrainEcefGeometryRecord | boolean | null;
};

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<TerrainEcefCacheRequest>) => void) | null;
  postMessage: (
    value: TerrainEcefCacheResponse,
    transfer: Transferable[]
  ) => void;
};
const workerEpoch = resolveDerivedCacheAssetEpoch({
  production: import.meta.env.PROD,
  assetUrl: location.href,
});
let manager: ReturnType<typeof createPersistentTileCache> | null = null;
let producer = "";
const key = async ({ context, arrays }: TerrainEcefCacheInput) => {
  const header = new TextEncoder().encode(
    JSON.stringify([
      context,
      arrays.map((a) => [a.byteLength, a.BYTES_PER_ELEMENT]),
    ])
  );
  const bytes = new Uint8Array(
    header.byteLength +
      arrays.reduce((size, array) => size + array.byteLength, 0)
  );
  bytes.set(header);
  let offset = header.byteLength;
  for (const array of arrays) {
    bytes.set(
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength),
      offset
    );
    offset += array.byteLength;
  }
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0")
  ).join("");
};
scope.onmessage = async ({ data }) => {
  let value: TerrainEcefCacheResponse["value"] = null;
  try {
    const mainEpoch = resolveDerivedCacheAssetEpoch({
      production: import.meta.env.PROD,
      assetUrl: data.producer,
    });
    if (mainEpoch && workerEpoch) {
      if (producer !== mainEpoch) {
        manager?.close();
        producer = mainEpoch;
        manager = createPersistentTileCache(
          JSON.stringify([mainEpoch, workerEpoch])
        );
      }
      const records = manager!.register("terrain-ecef", data.version);
      const tree = data.input.tree;
      const cacheKey = JSON.stringify([tree.identity, tree.node]);
      if (data.usedNodes) {
        value = (await records.markTreeUsed(tree.identity, data.usedNodes)) > 0;
      } else if (data.protectedNodes) {
        value = await records.protectTree(tree.identity, data.protectedNodes, {
          replace: true,
        });
      } else if (data.record) {
        const fingerprint = await key(data.input);
        const record = data.record;
        value = await records.put(
          cacheKey,
          { fingerprint, record },
          {
            tree,
            bytes:
              record.positions.byteLength +
              record.normals.byteLength +
              record.indices.byteLength +
              10 * Float64Array.BYTES_PER_ELEMENT,
            recomputeMs: data.recomputeMs,
          }
        );
      } else {
        const persisted = (
          await records.get<{
            fingerprint: string;
            record: TerrainEcefGeometryRecord;
          }>(cacheKey, { tree, touch: false })
        )?.value;
        // Stable hierarchy keys let absent/incompatible records fail before
        // hashing the large transient source arrays.
        const fingerprint = persisted ? await key(data.input) : null;
        const cached =
          persisted?.fingerprint === fingerprint ? persisted.record : null;
        const nativeIndices = data.input.arrays[2];
        if (cached)
          value = {
            ...cached,
            indicesUnchanged:
              (nativeIndices instanceof Uint16Array ||
                nativeIndices instanceof Uint32Array) &&
              (cached.indices instanceof Uint16Array ||
                cached.indices instanceof Uint32Array) &&
              terrainIndexArraysEqual(cached.indices, nativeIndices),
          };
      }
    }
  } catch {
    // Persistence is optional; source terrain always remains authoritative.
  }
  const transfer = new Set<Transferable>();
  if (value && typeof value === "object") {
    for (const array of [value.positions, value.normals, value.indices])
      if (ArrayBuffer.isView(array)) transfer.add(array.buffer as ArrayBuffer);
  }
  scope.postMessage({ id: data.id, value }, [...transfer]);
};
