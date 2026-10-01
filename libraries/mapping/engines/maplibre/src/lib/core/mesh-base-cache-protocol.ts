import type { MeshBaseRenderRecord } from "./mesh-base-render-record";
export const MESH_BASE_RENDER_FORMAT = "mesh-base-render-v0.1";
export const MESH_BASE_CACHE_OPERATION = {
  initialize: "initialize",
  get: "get",
  put: "put",
  confirm: "confirm",
  markUsed: "markUsed",
  invalidate: "invalidate",
} as const;

export type MeshBaseCacheIdentity = {
  sourceUrl: string;
  sourceRevision: string;
  buildId: string;
};
export type MeshBaseCacheTree = {
  identity: string;
  node: string;
  parent: string | null;
  level: number;
};
export type CachedMeshBaseRenderRecord = MeshBaseRenderRecord & {
  cacheIdentity: string;
  contentUrl: string;
};
export const meshBaseCacheIdentity = (identity: MeshBaseCacheIdentity) =>
  JSON.stringify([
    meshBaseCacheSourceUrl(identity.sourceUrl),
    identity.sourceRevision,
    identity.buildId,
    MESH_BASE_RENDER_FORMAT,
  ]);

export type MeshBaseManifest = {
  format: typeof MESH_BASE_RENDER_FORMAT;
  sourceUrl: string;
  sourceRevision: string;
  buildId: string;
  extentError: number;
  residentBytes: number;
  urls: string[];
};
export type MeshBaseCacheRequest = { id: number } & (
  | {
      operation: typeof MESH_BASE_CACHE_OPERATION.initialize;
      sourceUrl: string;
      sourceRevision: string;
      buildId: string;
    }
  | { operation: typeof MESH_BASE_CACHE_OPERATION.get; url: string }
  | { operation: typeof MESH_BASE_CACHE_OPERATION.markUsed; nodes: string[] }
  | { operation: typeof MESH_BASE_CACHE_OPERATION.invalidate }
  | {
      operation: typeof MESH_BASE_CACHE_OPERATION.put;
      url: string;
      record: MeshBaseRenderRecord;
      tree: MeshBaseCacheTree;
    }
  | {
      operation: typeof MESH_BASE_CACHE_OPERATION.confirm;
      manifest: MeshBaseManifest;
    }
);
export type MeshBaseCacheResponse = {
  id: number;
  value: CachedMeshBaseRenderRecord | MeshBaseManifest | boolean | null;
};

/** Fragment-only camera state cannot change the source; query revisions can. */
export const meshBaseCacheSourceUrl = (url: string): string => {
  const source = new URL(url);
  source.hash = "";
  return source.href;
};
export const meshBaseCacheKey = (
  sourceUrl: string,
  revision: string,
  url: string
) => JSON.stringify([meshBaseCacheSourceUrl(sourceUrl), revision, url]);

export const meshBaseManifestMatches = (
  manifest: MeshBaseManifest,
  identity: Pick<MeshBaseManifest, "sourceUrl" | "sourceRevision" | "buildId">
) =>
  manifest.format === MESH_BASE_RENDER_FORMAT &&
  manifest.sourceUrl === meshBaseCacheSourceUrl(identity.sourceUrl) &&
  manifest.sourceRevision === identity.sourceRevision &&
  manifest.buildId === identity.buildId &&
  Number.isFinite(manifest.extentError) &&
  manifest.extentError > 0 &&
  Number.isFinite(manifest.residentBytes) &&
  manifest.residentBytes > 0 &&
  Array.isArray(manifest.urls) &&
  manifest.urls.length > 0 &&
  manifest.urls.length <= 4096 &&
  manifest.urls.every((url) => typeof url === "string" && url.length > 0) &&
  new Set(manifest.urls).size === manifest.urls.length;

/** Certify a complete cached cut. An available parent covers unfinished child
 * records; unknown branches without such a fallback never count as coverage.
 * This only certifies persistence and does not change the live selection. */
export const collectCachedMeshBase = <T>(
  root: T,
  stored: (tile: T) => boolean,
  children: (tile: T) => readonly T[] | null,
  empty: (tile: T) => boolean
): T[] | null => {
  const visit = (tile: T): T[] | null => {
    const descendants = children(tile);
    if (descendants?.length) {
      const cuts = descendants.map(visit);
      if (cuts.every((cut): cut is T[] => cut !== null)) return cuts.flat();
    } else if (descendants && empty(tile)) return [];
    return stored(tile) ? [tile] : null;
  };
  return visit(root);
};

/** Only the exact same tileset URL is a replacement; separate sources keep independent bases. */
export const meshBaseIdentitySourceMatches = (
  identity: string,
  sourceUrl: string
): boolean => {
  try {
    const tuple: unknown = JSON.parse(identity);
    return (
      Array.isArray(tuple) &&
      tuple.length === 4 &&
      tuple[0] === meshBaseCacheSourceUrl(sourceUrl) &&
      tuple[3] === MESH_BASE_RENDER_FORMAT
    );
  } catch {
    return false;
  }
};
