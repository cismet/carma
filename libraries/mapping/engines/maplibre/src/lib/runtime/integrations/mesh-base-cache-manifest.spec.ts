import { describe, expect, it, vi } from "vitest";
import { invalidateMeshBaseRenderer } from "./mesh-base-cache-manifest";
import type {
  RuntimeTile,
  RuntimeTilesRenderer,
} from "./three-tiles-runtime-types";

describe("incompatible native mesh memory", () => {
  it("collects the whole old tree before upstream eviction mutates external children", () => {
    const leaf = {} as RuntimeTile;
    const root = { children: [leaf] } as RuntimeTile;
    const remove = vi.fn((tile: RuntimeTile) => {
      tile.children = [];
      return true;
    });
    const tiles = {
      root,
      lruCache: { remove },
      traverse: (callback: (tile: RuntimeTile) => boolean) => {
        callback(root);
        for (const child of root.children) callback(child as RuntimeTile);
      },
    } as unknown as RuntimeTilesRenderer;
    invalidateMeshBaseRenderer(tiles);
    expect(remove.mock.calls.map(([tile]) => tile)).toEqual([root, leaf]);
  });
});
