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
    expect(advanceTerrainTileFrontier(children, [], () => false)).toEqual(
      children
    );
    expect(advanceTerrainTileFrontier(children, [parent], () => false)).toEqual(
      children
    );
    expect(advanceTerrainTileFrontier(children, [parent], () => true)).toEqual([
      parent,
    ]);
  });

  it("keeps historical offscreen tiles while the next pan requests disjoint terrain", () => {
    const other = tile("next-view", 10, 533, 218);
    expect(advanceTerrainTileFrontier(children, [other], () => true)).toEqual([
      ...children,
      other,
    ]);
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

  it("retains failed and offscreen coverage even after the new selection completes", () => {
    const other = tile("old-other", 10, 533, 218);
    expect(
      advanceTerrainTileFrontier([parent, other], children, () => false)
    ).toEqual([parent, other]);
    expect(
      advanceTerrainTileFrontier([parent, other], children, () => true)
    ).toEqual([other, ...children]);
  });

  it("does not mistake a fully ready requested subset for spatial coverage", () => {
    for (let count = 1; count < 4; count += 1) {
      expect(
        advanceTerrainTileFrontier(
          [parent],
          children.slice(0, count),
          () => true
        )
      ).toEqual([parent]);
    }
  });

  it("proves a mixed-depth cut recursively before retiring its parent", () => {
    const grandchildren = [
      tile("grandchild-nw", 12, 2128, 872),
      tile("grandchild-ne", 12, 2129, 872),
      tile("grandchild-sw", 12, 2128, 873),
      tile("grandchild-se", 12, 2129, 873),
    ];
    const mixed = [...grandchildren, ...children.slice(1)];
    expect(
      advanceTerrainTileFrontier(
        [parent],
        mixed,
        (key) => key !== "grandchild-se"
      )
    ).toEqual([parent]);
    expect(
      advanceTerrainTileFrontier([parent], mixed.slice(1), () => true)
    ).toEqual([parent]);
    expect(advanceTerrainTileFrontier([parent], mixed, () => true)).toEqual(
      mixed
    );
  });

  it("does not count duplicate or overlapping descendants as missing quadrants", () => {
    const grandchild = tile("grandchild-nw", 12, 2128, 872);
    expect(
      advanceTerrainTileFrontier(
        [parent],
        [
          children[0],
          { ...children[0], key: "duplicate" },
          grandchild,
          children[1],
        ],
        () => true
      )
    ).toEqual([parent]);
    const normalized = advanceTerrainTileFrontier(
      [parent],
      [...children, grandchild],
      () => true
    );
    expect(normalized).toEqual(children);
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
