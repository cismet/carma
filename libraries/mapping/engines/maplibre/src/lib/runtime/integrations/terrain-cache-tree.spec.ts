import { describe, expect, it } from "vitest";
import { terrainCacheTree } from "./terrain-cache-tree";

describe("terrain persistent XYZ tree", () => {
  it("makes configured source minimum tiles roots, without fictitious global parents", () => {
    expect(terrainCacheTree("source", { level: 5, x: 16, y: 10 }, 5)).toEqual({
      identity: "source",
      node: "5/16/10",
      parent: null,
      level: 5,
    });
    expect(
      terrainCacheTree("source", { level: 6, x: 33, y: 21 }, 5).parent
    ).toBe("5/16/10");
  });
});
