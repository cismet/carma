import { createPersistentTileCache } from "./persistent-tile-cache";
import {
  MESH_BASE_CACHE_OPERATION,
  MESH_BASE_RENDER_FORMAT,
  meshBaseCacheKey,
  meshBaseCacheIdentity,
  meshBaseIdentitySourceMatches,
  type CachedMeshBaseRenderRecord,
  meshBaseManifestMatches,
  type MeshBaseCacheRequest,
  type MeshBaseCacheResponse,
  type MeshBaseManifest,
} from "../../core/mesh-base-cache-protocol";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<MeshBaseCacheRequest>) => void) | null;
  postMessage: (value: MeshBaseCacheResponse, transfer: Transferable[]) => void;
};
let manager: ReturnType<typeof createPersistentTileCache> | null = null;
let sourceUrl = "",
  revision = "",
  buildId = "";
const namespace = "mesh-resident-base";
const records = () => manager!.register(namespace, MESH_BASE_RENDER_FORMAT);
const identity = () =>
  meshBaseCacheIdentity({ sourceUrl, sourceRevision: revision, buildId });
const key = (url: string) => meshBaseCacheKey(sourceUrl, identity(), url);

async function complete(
  manifest: MeshBaseManifest,
  replace = false
): Promise<boolean> {
  if (
    !meshBaseManifestMatches(manifest, {
      sourceUrl,
      sourceRevision: revision,
      buildId,
    })
  )
    return false;
  return records().protectTree(identity(), manifest.urls, {
    replace,
    manifest: {
      key: key("manifest"),
      value: manifest,
      bytes: JSON.stringify(manifest).length * 2,
    },
  });
}

scope.onmessage = async ({ data }) => {
  let value: MeshBaseCacheResponse["value"] = null;
  try {
    if (data.operation === MESH_BASE_CACHE_OPERATION.initialize) {
      manager?.close();
      sourceUrl = data.sourceUrl;
      revision = data.sourceRevision;
      buildId = data.buildId;
      manager = createPersistentTileCache(`${buildId}:${MESH_BASE_RENDER_FORMAT}`);
      const rows = await records().inspect();
      const stale = new Set(
        rows
          ?.map((row) => row.tree?.identity)
          .filter(
            (candidate): candidate is string =>
              !!candidate &&
              candidate !== identity() &&
              meshBaseIdentitySourceMatches(candidate, sourceUrl)
          )
      );
      for (const obsolete of stale) await records().invalidateTree(obsolete);
      const saved = await records().get<MeshBaseManifest>(key("manifest"), {
        touch: false,
      });
      value = saved && (await complete(saved.value, true)) ? saved.value : null;
    } else if (
      manager &&
      data.operation === MESH_BASE_CACHE_OPERATION.invalidate
    ) {
      value = (await records().invalidateTree(identity())) > 0;
    } else if (manager && data.operation === MESH_BASE_CACHE_OPERATION.get) {
      value =
        (
          await records().get<CachedMeshBaseRenderRecord>(key(data.url), {
            touch: false,
            tree: { identity: identity(), node: data.url },
          })
        )?.value ?? null;
      if (
        value &&
        typeof value === "object" &&
        "textures" in value &&
        (value.cacheIdentity !== identity() ||
          value.contentUrl !== data.url ||
          value.version !== MESH_BASE_RENDER_FORMAT)
      ) {
        for (const texture of Object.values(value.textures))
          texture.image.close();
        value = null;
      }
    } else if (
      manager &&
      data.operation === MESH_BASE_CACHE_OPERATION.markUsed
    ) {
      value = (await records().markTreeUsed(identity(), data.nodes)) > 0;
    } else if (manager && data.operation === MESH_BASE_CACHE_OPERATION.put) {
      if (
        data.tree.identity === identity() &&
        data.tree.node === data.url &&
        data.record.version === MESH_BASE_RENDER_FORMAT
      )
        value = await records().put(
          key(data.url),
          { ...data.record, cacheIdentity: identity(), contentUrl: data.url },
          {
            bytes: data.record.bytes,
            tree: data.tree,
          }
        );
    } else if (
      manager &&
      data.operation === MESH_BASE_CACHE_OPERATION.confirm &&
      meshBaseManifestMatches(data.manifest, {
        sourceUrl,
        sourceRevision: revision,
        buildId,
      })
    ) {
      value = await records().protectTree(identity(), data.manifest.urls, {
        replace: true,
        manifest: {
          key: key("manifest"),
          value: data.manifest,
          bytes: JSON.stringify(data.manifest).length * 2,
        },
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
