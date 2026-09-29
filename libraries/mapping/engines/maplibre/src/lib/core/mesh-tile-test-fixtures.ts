import type { Tile } from "3d-tiles-renderer/core";

export const mesh = (parent: Tile | null = null, error = 0.5): Tile =>
  ({
    parent,
    children: [],
    refine: "REPLACE",
    internal: { hasRenderableContent: true, loadingState: 4 },
    traversal: { error, inFrustum: true },
  } as Tile);

export const quartet = (
  parent = mesh()
): { parent: Tile; children: Tile[] } => {
  const children = Array.from({ length: 4 }, () => mesh(parent));
  parent.children = children;
  return { parent, children };
};
