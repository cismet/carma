import { describe, expect, it } from "vitest";
import { advanceTerrainTileFrontier } from "./terrain-tile-frontier";

const tile = (key: string, level: number, x: number, y: number) => ({
  key,
  id: { level, x, y },
});
const parent = tile("old-parent", 10, 532, 218);
const children = [
  tile("child-nw", 11, 1064, 436),
  tile("child-ne", 11, 1065, 436),
  tile("child-sw", 11, 1064, 437),
  tile("child-se", 11, 1065, 437),
];

describe("advanceTerrainTileFrontier", () => {
  it("keeps visible detail when a drag selection omits it or its parent is still loading", () => {
    const visible = new Set(children.map(({ key }) => key));
    expect(
      advanceTerrainTileFrontier(children, [], () => false, true, visible)
    ).toEqual(children);
    expect(
      advanceTerrainTileFrontier(children, [parent], () => false, true, visible)
    ).toEqual(children);
    expect(
      advanceTerrainTileFrontier(children, [parent], () => true, true, visible)
    ).toEqual([parent]);
  });

  it("releases omitted tiles only after they leave the visible set", () => {
    expect(
      advanceTerrainTileFrontier(
        children,
        [],
        () => false,
        true,
        new Set([children[0].key])
      )
    ).toEqual([children[0]]);
  });
  it("replaces one ready tile without waiting for an unrelated tile", () => {
    const other = tile("old-other", 10, 533, 218);
    const next = [
      tile("new-parent", 10, 532, 218),
      tile("new-other", 10, 533, 218),
    ];
    expect(
      advanceTerrainTileFrontier(
        [parent, other],
        next,
        (key) => key === "new-parent"
      )
    ).toEqual([other, next[0]]);
  });

  it("waits only for a coarse tile's full child group, not the screen", () => {
    const other = tile("old-other", 10, 533, 218);
    const next = [...children, tile("new-other", 10, 533, 218)];
    expect(
      advanceTerrainTileFrontier(
        [parent, other],
        next,
        (key) => key !== "child-se" && key !== "new-other"
      )
    ).toEqual([parent, other]);
    expect(
      advanceTerrainTileFrontier(
        [parent, other],
        next,
        (key) => key !== "new-other"
      )
    ).toEqual([other, ...children]);
  });

  it("replaces fine tiles with a ready parent atomically", () => {
    expect(advanceTerrainTileFrontier(children, [parent], () => true)).toEqual([
      parent,
    ]);
  });

  it("retains failed coverage but prunes offscreen coverage at completion", () => {
    const other = tile("old-other", 10, 533, 218);
    expect(
      advanceTerrainTileFrontier([parent, other], children, () => false, true)
    ).toEqual([parent]);
  });

  it("supports rapid source changes from an already mixed cut", () => {
    const mixed = [
      children[0],
      ...children
        .slice(1)
        .map((entry) => ({ ...entry, key: `old:${entry.key}` })),
    ];
    const next = children.map((entry) => ({
      ...entry,
      key: `third:${entry.key}`,
    }));
    const frontier = advanceTerrainTileFrontier(
      mixed,
      next,
      (key) => key === "third:child-ne"
    );
    expect(frontier).toHaveLength(4);
    expect(frontier.map(({ key }) => key)).toEqual([
      "child-nw",
      "old:child-sw",
      "old:child-se",
      "third:child-ne",
    ]);
  });
});
