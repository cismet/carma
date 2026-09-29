import { createDerivedBufferCache } from "@carma-commons/utils";
import type { MeshBaseRenderRecord } from "../../core/mesh-base-render-record";
import {
  MESH_BASE_CACHE_OPERATION,
  MESH_BASE_RENDER_FORMAT,
  meshBaseCacheKey,
  meshBaseManifestMatches,
  type MeshBaseCacheRequest,
  type MeshBaseCacheResponse,
  type MeshBaseManifest,
} from "../../core/mesh-base-cache-protocol";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<MeshBaseCacheRequest>) => void) | null;
  postMessage: (value: MeshBaseCacheResponse, transfer: Transferable[]) => void;
};
let manager: ReturnType<typeof createDerivedBufferCache> | null = null;
let sourceUrl = "",
  revision = "",
  buildId = "";
const namespace = "mesh-resident-base";
const records = () => manager!.register(namespace, MESH_BASE_RENDER_FORMAT);
const key = (url: string) => meshBaseCacheKey(sourceUrl, revision, url);

async function complete(manifest: MeshBaseManifest): Promise<boolean> {
  if (
    !meshBaseManifestMatches(manifest, {
      sourceUrl,
      sourceRevision: revision,
      buildId,
    })
  )
    return false;
  const rows = await records().inspect();
  const known = new Set(rows?.map((row) => row.key));
  return manifest.urls.every((url) => known.has(key(url)));
}

scope.onmessage = async ({ data }) => {
  let value: MeshBaseCacheResponse["value"] = null;
  try {
    if (data.operation === MESH_BASE_CACHE_OPERATION.initialize) {
      sourceUrl = data.sourceUrl;
      revision = data.sourceRevision;
      buildId = data.buildId;
      manager = createDerivedBufferCache({
        capacityBytes: 256 * 1024 ** 2,
        adaptiveCapacity: true,
        producerEpoch: `${buildId}:${MESH_BASE_RENDER_FORMAT}`,
      });
      const saved = await records().get<MeshBaseManifest>(key("manifest"), {
        touch: false,
      });
      value = saved && (await complete(saved.value)) ? saved.value : null;
    } else if (manager && data.operation === MESH_BASE_CACHE_OPERATION.get) {
      value =
        (await records().get<MeshBaseRenderRecord>(key(data.url)))?.value ??
        null;
    } else if (manager && data.operation === MESH_BASE_CACHE_OPERATION.put) {
      value = await records().put(key(data.url), data.record, {
        bytes: data.record.bytes,
      });
    } else if (
      manager &&
      data.operation === MESH_BASE_CACHE_OPERATION.confirm &&
      (await complete(data.manifest))
    ) {
      value = await records().put(key("manifest"), data.manifest, {
        bytes: JSON.stringify(data.manifest).length * 2,
      });
    }
  } catch {
    /* Optional persistent data must not fail loading. */
  }
  if (data.operation === MESH_BASE_CACHE_OPERATION.put) {
    for (const texture of Object.values(data.record.textures))
      texture.image.close();
  }
  const transfer = new Set<Transferable>();
  if (value && typeof value === "object" && "textures" in value) {
    for (const texture of Object.values(value.textures))
      transfer.add(texture.image);
    for (const geometry of value.geometries) {
      for (const attribute of Object.values(geometry.attributes))
        transfer.add(attribute.array.buffer as ArrayBuffer);
      if (geometry.index)
        transfer.add(geometry.index.array.buffer as ArrayBuffer);
    }
  }
  scope.postMessage({ id: data.id, value }, [...transfer]);
};
