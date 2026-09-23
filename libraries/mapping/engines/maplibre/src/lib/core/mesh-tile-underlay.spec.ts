import type { Tile } from "3d-tiles-renderer/core";
import { describe, expect, it } from "vitest";
import { selectMeshUnderlayParents } from "./mesh-tile-underlay";
import { mesh, quartet } from "./mesh-tile-test-fixtures";

describe("mesh underlay parents", () => {
  const inView = (tile: Tile) => tile.traversal.inFrustum;

  it("draws the nearest loaded ancestor under a hole several levels below it", () => {
    // parent (loaded) -> [west (loaded, refined further), east (unloaded, in view)]
    const { parent, children } = quartet(mesh(null, 20));
    const [west, east] = children;
    const fine = quartet(west).children;
    east.internal.loadingState = 0;
    // The eastern child is partially refined too: one fine grandchild is
    // displayed along the old view edge, the other three are missing.
    const eastFine = quartet(east).children;
    eastFine[0].internal.loadingState = 4;
    for (const tile of eastFine.slice(1)) tile.internal.loadingState = 0;
    const displayed = new Set([...fine, eastFine[0]]);
    expect(selectMeshUnderlayParents(displayed, inView)).toEqual(
      new Set([parent])
    );
  });

  it("keeps displayed parent and child underlays until their separate holes are covered", () => {
    const { parent, children } = quartet(mesh(null, 32));
    const child = children[0];
    const grandchildren = quartet(child).children;
    children[1].internal.loadingState = 0;
    grandchildren[3].internal.loadingState = 0;
    const displayed = new Set([
      parent,
      child,
      ...children.slice(2),
      ...grandchildren.slice(0, 3),
    ]);
    expect(selectMeshUnderlayParents(displayed, inView)).toEqual(
      new Set([parent, child])
    );
    children[1].internal.loadingState = 4;
    displayed.add(children[1]);
    expect(selectMeshUnderlayParents(displayed, inView)).toEqual(
      new Set([child])
    );
    grandchildren[3].internal.loadingState = 4;
    displayed.add(grandchildren[3]);
    expect(selectMeshUnderlayParents(displayed, inView)).toEqual(new Set());
  });

  it("selects nothing when every in-view branch is covered", () => {
    const { parent, children } = quartet(mesh(null, 20));
    expect(selectMeshUnderlayParents(new Set(children), inView)).toEqual(
      new Set()
    );
    // Missing children outside the view are not holes.
    children[3].internal.loadingState = 0;
    children[3].traversal.inFrustum = false;
    expect(
      selectMeshUnderlayParents(new Set(children.slice(0, 3)), inView)
    ).toEqual(new Set());
    expect(parent.refine).toBe("REPLACE");
  });

  it("never selects an ancestor that is unloaded or not ready", () => {
    const { parent, children } = quartet(mesh(null, 20));
    children[0].internal.loadingState = 0;
    parent.internal.loadingState = 0;
    expect(
      selectMeshUnderlayParents(new Set(children.slice(1)), inView)
    ).toEqual(new Set());
    parent.internal.loadingState = 4;
    expect(
      selectMeshUnderlayParents(new Set(children.slice(1)), inView, () => false)
    ).toEqual(new Set());
    expect(
      selectMeshUnderlayParents(new Set(children.slice(1)), inView)
    ).toEqual(new Set([parent]));
  });
});

describe("selectMeshUnderlayParents with the extent floor", () => {
  const inView = () => true;

  it("draws an in-view floor tile under a region with no displayed descendant", () => {
    const { parent: floor, children } = quartet(mesh(null, 30));
    for (const child of children) child.internal.loadingState = 0;
    // No displayed tile anywhere below the floor: nothing refines it, yet
    // the view shows its region.
    expect(selectMeshUnderlayParents(new Set(), inView)).toEqual(new Set());
    expect(
      selectMeshUnderlayParents(new Set(), inView, () => true, [floor])
    ).toEqual(new Set([floor]));
  });

  it("treats a child without traversal state as a hole", () => {
    const { parent: floor, children } = quartet(mesh(null, 30));
    const displayed = new Set(children.slice(0, 3));
    children[3].internal.loadingState = 0;
    delete (children[3] as { traversal?: unknown }).traversal;
    expect(selectMeshUnderlayParents(displayed, inView)).toEqual(
      new Set([floor])
    );
  });

  it("keeps the floor next to a finer underlay that covers only one hole", () => {
    const { parent: floor, children } = quartet(mesh(null, 30));
    const { parent: mid, children: fine } = quartet(children[0]);
    fine[3].internal.loadingState = 0;
    children[1].internal.loadingState = 0;
    const displayed = new Set(fine.slice(0, 3));
    expect(
      selectMeshUnderlayParents(displayed, inView, () => true, [floor])
    ).toEqual(new Set([mid, floor]));
    expect(selectMeshUnderlayParents(displayed, inView)).toEqual(
      new Set([mid])
    );
  });
});
