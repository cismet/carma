import {
  collectCachedMeshBase,
  MESH_BASE_RENDER_FORMAT,
  meshBaseCacheSourceUrl,
  type MeshBaseCacheIdentity,
  type MeshBaseManifest,
} from "../../core/mesh-base-cache-protocol";
import { meshBaseRequiredAncestors } from "../../core/mesh-base-cache-tree";
import { resolveTileContentUrl } from "./three-tiles-runtime-vendor";
import type {
  RuntimeTile,
  RuntimeTilesRenderer,
} from "./three-tiles-runtime-types";

export const getMeshBaseContentUrl = (tile: RuntimeTile): string | null =>
  tile.internal?.hasRenderableContent ? resolveTileContentUrl(tile) : null;

export const prepareMeshBaseManifest = (
  tiles: RuntimeTilesRenderer,
  identity: MeshBaseCacheIdentity,
  stored: ReadonlySet<string>,
  storedBytes: ReadonlyMap<string, number>,
  memoryBudget: number
): MeshBaseManifest | null => {
  const root = tiles.root as RuntimeTile | null;
  if (!root) return null;
  const roots = collectCachedMeshBase(
    root,
    (tile) =>
      tile.internal?.hasRenderableContent === true &&
      stored.has(resolveTileContentUrl(tile) ?? ""),
    (tile) =>
      !tile.internal ||
      (tile.internal.hasUnrenderableContent && tile.internal.loadingState !== 4)
        ? null
        : ((tile.children ?? []) as RuntimeTile[]),
    (tile) =>
      !tile.internal.hasRenderableContent &&
      !tile.internal.hasUnrenderableContent
  );
  if (!roots?.length) return null;
  const selectedUrls = meshBaseRequiredAncestors(
    roots,
    getMeshBaseContentUrl,
    (tile) => tile.parent as RuntimeTile | null,
    (url) => stored.has(url)
  );
  if (!selectedUrls) return null;
  const resident = new Map<string, number>();
  tiles.traverse((tile) => {
    const runtime = tile as RuntimeTile;
    const url = resolveTileContentUrl(runtime);
    if (url && selectedUrls.has(url))
      resident.set(url, tiles.lruCache.getMemoryUsage(runtime) || 0);
    return false;
  }, null);
  const residentBytes = [...selectedUrls].reduce(
    (sum, url) =>
      sum + Math.max(resident.get(url) ?? 0, (storedBytes.get(url) ?? 0) * 2),
    0
  );
  if (!residentBytes || residentBytes > memoryBudget) return null;
  return {
    format: MESH_BASE_RENDER_FORMAT,
    sourceUrl: meshBaseCacheSourceUrl(identity.sourceUrl),
    sourceRevision: identity.sourceRevision,
    buildId: identity.buildId,
    extentError: Math.max(...roots.map((tile) => tile.geometricError)),
    residentBytes,
    urls: [...selectedUrls].sort(),
  };
};

/** A replaced source invalidates native-owned GPU resources as well as prepared cache records.
 * Use the upstream LRU lifecycle to abort work and dispose geometry/materials/textures. */
export const invalidateMeshBaseRenderer = (
  tiles: RuntimeTilesRenderer | undefined
) => {
  if (!tiles?.root) return;
  const stale: RuntimeTile[] = [];
  tiles.traverse((tile) => {
    stale.push(tile as RuntimeTile);
    return false;
  }, null);
  for (const tile of stale) tiles.lruCache.remove(tile);
};
