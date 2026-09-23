import type { Tile } from "3d-tiles-renderer/core";
import { retainMeshDetailFrontier } from "./mesh-tile-retention";

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

export const retain = (
  previous: Tile[],
  proposed: Tile[],
  requestedError = 1
) =>
  retainMeshDetailFrontier({
    previous: new Set(previous),
    proposed: new Set(proposed),
    requestedError,
    inView: (tile) => tile.traversal.inFrustum,
  });
