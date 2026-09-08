import type { Tile } from "3d-tiles-renderer/core";
import { describe, expect, it } from "vitest";
import {
  isMeshCoveredByLoadedChildren,
  canCoarsenMeshQuartet,
  retainMeshDetailFrontier,
} from "./three-tiles-mesh-frontier";

const mesh = (parent: Tile | null = null, error = 0.5): Tile =>
  ({
    parent,
    children: [],
    refine: "REPLACE",
    internal: { hasRenderableContent: true, loadingState: 4 },
    traversal: { error, inFrustum: true },
  } as Tile);

const quartet = (parent = mesh()): { parent: Tile; children: Tile[] } => {
  const children = Array.from({ length: 4 }, () => mesh(parent));
  parent.children = children;
  return { parent, children };
};

const retain = (previous: Tile[], proposed: Tile[], requestedError = 1) =>
  retainMeshDetailFrontier({
    previous: new Set(previous),
    proposed: new Set(proposed),
    requestedError,
    inView: (tile) => tile.traversal.inFrustum,
  });

describe("mesh detail frontier", () => {
  it("releases a hidden parent payload only while every direct child is loaded and visible", () => {
    const { parent, children } = quartet();
    const visible = new Set(children);
    expect(isMeshCoveredByLoadedChildren(parent, visible)).toBe(true);
    visible.add(parent);
    expect(isMeshCoveredByLoadedChildren(parent, visible)).toBe(false);
    visible.delete(parent);
    visible.delete(children[0]);
    expect(isMeshCoveredByLoadedChildren(parent, visible)).toBe(false);
    visible.add(children[0]);
    children[0].internal.loadingState = -1;
    expect(isMeshCoveredByLoadedChildren(parent, visible)).toBe(false);
  });
  it("allows one complete loaded quartet to coarsen at the requested error", () => {
    const { parent, children } = quartet();
    parent.traversal.error = 1;
    expect(retain(children, [parent])).toEqual(new Set([parent]));
  });

  it("rejects a 16px bootstrap ancestor even though it is already loaded", () => {
    const { parent, children } = quartet();
    parent.traversal.error = 16;
    expect(retain(children, [parent])).toEqual(new Set(children));
    expect(retain(children, [parent], 16)).toEqual(new Set([parent]));
  });

  it("never skips a generation even when the grandparent meets the target", () => {
    const { parent: grandparent, children: parents } = quartet();
    const fine = parents.flatMap((parent) => quartet(parent).children);
    expect(retain(fine, [grandparent])).toEqual(new Set(fine));
  });

  it.each([-1, 0, 1, 2, 3])(
    "does not count loading state %s as a ready child",
    (loadingState) => {
      const { parent, children } = quartet();
      children[0].internal.loadingState = loadingState;
      expect(canCoarsenMeshQuartet(parent, new Set(children), 1)).toBe(false);
      expect(retain(children.slice(1), [parent])).toEqual(
        new Set(children.slice(1))
      );
    }
  );

  it("does not collapse a partial quartet or unknown parent error", () => {
    const { parent, children } = quartet();
    expect(retain(children.slice(1), [parent])).toEqual(
      new Set(children.slice(1))
    );
    parent.traversal.error = Number.NaN;
    expect(retain(children, [parent])).toEqual(new Set(children));
  });

  it("keeps detail across repeated fallback proposals and accepts later refinement", () => {
    const { parent, children } = quartet(mesh(null, 16));
    let current = new Set(children);
    for (let frame = 0; frame < 10; frame++)
      current = retain([...current], [parent]);
    const finer = children.flatMap((child) => quartet(child).children);
    expect(retain([...current], finer)).toEqual(new Set(finer));
  });

  it("retains a still-visible omitted tile, but releases tiles leaving the view", () => {
    const tile = mesh();
    expect(retain([tile], [])).toEqual(new Set([tile]));
    tile.traversal.inFrustum = false;
    expect(retain([tile], [])).toEqual(new Set());
  });

  it("does not affect new coverage or unrelated visible regions", () => {
    const { parent, children } = quartet(mesh(null, 16));
    const entering = mesh();
    expect(retain(children, [parent, entering])).toEqual(
      new Set([...children, entering])
    );
    expect(retain([], [parent])).toEqual(new Set([parent]));
  });

  it("leaves additive meshes additive instead of treating their parent as a replacement", () => {
    const { parent, children } = quartet();
    parent.refine = "ADD";
    expect(retain(children, [parent, ...children])).toEqual(
      new Set([parent, ...children])
    );
  });
});
