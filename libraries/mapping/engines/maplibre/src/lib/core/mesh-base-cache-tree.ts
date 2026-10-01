import type { MeshBaseCacheTree } from "./mesh-base-cache-protocol";

/** Containers are traversal details; persisted lineage links content-bearing ancestors. */
export const meshBaseContentLineage = <T>(
  tile: T,
  identity: string,
  content: (tile: T) => string | null,
  parentOf: (tile: T) => T | null
): MeshBaseCacheTree | null => {
  const node = content(tile);
  if (!node || !identity) return null;
  let parent = parentOf(tile);
  let parentUrl: string | null = null;
  let level = 0;
  const visited = new Set<T>([tile]);
  while (parent) {
    if (visited.has(parent)) return null;
    visited.add(parent);
    const url = content(parent);
    if (url) {
      level++;
      parentUrl ??= url;
    }
    parent = parentOf(parent);
  }
  return { identity, node, parent: parentUrl, level };
};

/** A complete cut protects only its required fallback chains, not every cached refinement. */
export const meshBaseRequiredAncestors = <T>(
  cut: readonly T[],
  content: (tile: T) => string | null,
  parentOf: (tile: T) => T | null,
  stored: (url: string) => boolean
): Set<string> | null => {
  const urls = new Set<string>();
  for (const root of cut) {
    const visited = new Set<T>();
    let tile: T | null = root;
    while (tile) {
      if (visited.has(tile)) return null;
      visited.add(tile);
      const url = content(tile);
      if (url) {
        if (!stored(url)) return null;
        urls.add(url);
      }
      tile = parentOf(tile);
    }
  }
  return urls;
};
