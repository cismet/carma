import type { MeshBaseRenderRecord } from "../../core/mesh-base-render-record";
import {
  MESH_BASE_CACHE_OPERATION,
  type MeshBaseCacheRequest,
  type MeshBaseCacheResponse,
} from "../../core/mesh-base-cache-protocol";
export type MeshCacheRequest = MeshBaseCacheRequest extends infer R
  ? R extends { id: number }
    ? Omit<R, "id">
    : never
  : never;
export type MeshCacheJob = (value: MeshBaseCacheResponse["value"]) => void;

export const requestMeshBaseCache = (
  worker: Worker | null,
  data: MeshCacheRequest,
  id: number,
  jobs: Map<number, MeshCacheJob>,
  onReadTimeout: () => void,
  deadline: number
): Promise<MeshBaseCacheResponse["value"]> => {
  if (!worker) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      jobs.delete(id);
      if (data.operation === MESH_BASE_CACHE_OPERATION.get) onReadTimeout();
      resolve(null);
    }, deadline);
    jobs.set(id, (value) => {
      clearTimeout(timer);
      resolve(value);
    });
    try {
      worker.postMessage({ ...data, id });
    } catch {
      jobs.get(id)?.(null);
      jobs.delete(id);
    }
  });
};

export const closeMeshBaseRecord = (record: MeshBaseRenderRecord) => {
  for (const texture of Object.values(record.textures ?? {}))
    texture?.image?.close?.();
};

/** Deadline-expired records must release their transferred bitmaps. Only the owning
 * current worker may deliver a late confirmed manifest to the runtime. */
export const bindMeshBaseCacheWorker = (
  worker: Worker,
  jobs: Map<number, MeshCacheJob>,
  onManifest: (
    manifest: import("../../core/mesh-base-cache-protocol").MeshBaseManifest
  ) => void,
  onFailure: () => void
) => {
  worker.onmessage = ({ data }: MessageEvent<MeshBaseCacheResponse>) => {
    const job = jobs.get(data.id);
    jobs.delete(data.id);
    if (job) job(data.value);
    else if (
      data.value &&
      typeof data.value === "object" &&
      "urls" in data.value
    )
      onManifest(data.value);
    else if (
      data.value &&
      typeof data.value === "object" &&
      "textures" in data.value
    )
      closeMeshBaseRecord(data.value);
  };
  worker.onerror = onFailure;
};
