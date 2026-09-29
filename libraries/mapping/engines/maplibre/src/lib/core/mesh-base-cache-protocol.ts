import type { MeshBaseRenderRecord } from "./mesh-base-render-record";
export const MESH_BASE_RENDER_FORMAT = "mesh-base-render-v0.1";
export const MESH_BASE_CACHE_OPERATION = {
  initialize: "initialize",
  get: "get",
  put: "put",
  confirm: "confirm",
} as const;

export type MeshBaseManifest = {
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
  | {
      operation: typeof MESH_BASE_CACHE_OPERATION.put;
      url: string;
      record: MeshBaseRenderRecord;
    }
  | {
      operation: typeof MESH_BASE_CACHE_OPERATION.confirm;
      manifest: MeshBaseManifest;
    }
);
export type MeshBaseCacheResponse = {
  id: number;
  value: MeshBaseRenderRecord | MeshBaseManifest | boolean | null;
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
  manifest.sourceUrl === identity.sourceUrl &&
  manifest.sourceRevision === identity.sourceRevision &&
  manifest.buildId === identity.buildId &&
  Number.isFinite(manifest.extentError) &&
  manifest.extentError > 0 &&
  Number.isFinite(manifest.residentBytes) &&
  manifest.residentBytes > 0 &&
  Array.isArray(manifest.urls) &&
  manifest.urls.length > 0 &&
  manifest.urls.length <= 4096 &&
  manifest.urls.every((url) => typeof url === "string");
