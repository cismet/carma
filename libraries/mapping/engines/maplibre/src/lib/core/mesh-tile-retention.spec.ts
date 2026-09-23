import type { Tile } from "3d-tiles-renderer/core";
import { describe, expect, it } from "vitest";
import {
  hasDisplayedAncestor,
  isMeshCoveredByLoadedChildren,
  isMeshCoverageRemovalSafe,
} from "./mesh-tile-coverage";
import { shouldDeferMeshRefinement } from "./mesh-tile-refinement";
import { selectMeshReceiverPlan } from "./mesh-tile-selection";
import {
  canCoarsenMeshCut,
  getRetainedMeshAncestors,
  retainMeshDetailFrontier,
} from "./mesh-tile-retention";
import { mesh, quartet, retain } from "./mesh-tile-test-fixtures";

describe("mesh detail frontier", () => {
  it("indexes proposed ancestry once instead of rescanning it for every offscreen family", () => {
    const root = mesh();
    const families = Array.from({ length: 128 }, () => quartet(mesh(root)));
    const visible = Array.from({ length: 128 }, () => mesh(root));
    root.children = [...families.map((f) => f.parent), ...visible];
    const all = [
      root,
      ...visible,
      ...families.flatMap((f) => [f.parent, ...f.children]),
    ];
    let parentReads = 0;
    for (const tile of all) {
      const parent = tile.parent;
      Object.defineProperty(tile, "parent", {
        get: () => {
          parentReads += 1;
          return parent;
        },
      });
    }
    const visibleSet = new Set(visible);
    let viewChecks = 0;
    const previous = new Set(families.flatMap((f) => f.children.slice(0, 2)));
    const result = retainMeshDetailFrontier({
      previous,
      proposed: visibleSet,
      requestedError: 1,
      inView: (tile) => {
        viewChecks += 1;
        return visibleSet.has(tile);
      },
    });
    const expected = new Set([...visible, ...families.map((f) => f.parent)]);
    expect(result.size).toBe(expected.size);
    expect([...result].every((tile) => expected.has(tile))).toBe(true);
    expect(viewChecks).toBeLessThanOrEqual(all.length);
    expect(parentReads).toBeLessThan(all.length * 12);
    // No persistent ancestry/visibility cache: the next camera can need detail again.
    const refined = new Set(families.flatMap((f) => f.children));
    const next = retainMeshDetailFrontier({
      previous: result,
      proposed: refined,
      requestedError: 1,
      inView: () => true,
    });
    const expectedNext = new Set([...refined, ...visible]);
    expect(next.size).toBe(expectedNext.size);
    expect([...next].every((tile) => expectedNext.has(tile))).toBe(true);
  });

  it("uses current camera SSE, never stale traversal/light error, when coarsening", () => {
    const { parent, children } = quartet(mesh(null, 0.25));
    const select = (cameraError: number) =>
      retainMeshDetailFrontier({
        previous: new Set(children),
        proposed: new Set([parent]),
        requestedError: 2,
        inView: () => true,
        errorPixels: () => cameraError,
      });
    expect(select(12)).toEqual(new Set(children));
    parent.traversal.error = 64;
    expect(select(1.9)).toEqual(new Set([parent]));
  });

  it("fills a mixed 3/2 cut around retained detail instead of reloading a level-1 parent", () => {
    const { parent: root, children: level2 } = quartet(mesh(null, 8));
    const level3 = quartet(level2[0]).children;
    level2[0].traversal.error = 4;
    const previous = new Set(level3);
    const retained = getRetainedMeshAncestors(
      previous,
      2,
      () => true,
      (tile) => (tile === root ? 8 : tile.traversal.error)
    );
    // A fine branch is already visible. The other siblings supply coverage,
    // despite the root meeting the relaxed 16px admission target.
    level2[1].internal.loadingState = 0;
    expect(
      shouldDeferMeshRefinement(
        level2[1],
        16,
        (tile) => tile.traversal.error,
        retained
      )
    ).toBe(false);
    expect(hasDisplayedAncestor(level2[1], previous)).toBe(false);
    expect(hasDisplayedAncestor(mesh(level3[0]), previous)).toBe(true);
    level2[1].internal.loadingState = 4;
    const cut = selectMeshReceiverPlan(
      root,
      2,
      Infinity,
      () => true,
      (tile) => tile.traversal.error,
      () => true,
      retained
    ).tiles;
    // The retained branch's parent still exceeds the final 2px display target.
    expect(cut.has(root)).toBe(false);
    expect(cut).toEqual(new Set([...level3, ...level2.slice(1)]));
  });
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
  it("keeps visible detail while moving, admits new coverage and resumes normal selection at rest", () => {
    const { parent, children } = quartet(mesh(null, 1));
    const newRegion = mesh(null, 16);
    const previous = new Set(children);
    const inView = () => true;
    const error = (tile: Tile) => tile.traversal.error;
    expect(getRetainedMeshAncestors(previous, 4, inView, error, false)).toEqual(
      new Set([parent])
    );
    expect(getRetainedMeshAncestors(previous, 4, inView, error)).toEqual(
      new Set()
    );
    const moving = retainMeshDetailFrontier({
      previous,
      proposed: new Set([parent, newRegion]),
      requestedError: 4,
      inView,
      allowInViewCoarsening: false,
    });
    expect(moving).toEqual(new Set([...children, newRegion]));
    expect(
      retainMeshDetailFrontier({
        previous: moving,
        proposed: new Set([parent, newRegion]),
        requestedError: 4,
        inView,
      })
    ).toEqual(new Set([parent, newRegion]));
  });

  it("still releases complete offscreen families during motion", () => {
    const { parent, children } = quartet(mesh(null, 1));
    expect(
      retainMeshDetailFrontier({
        previous: new Set(children),
        proposed: new Set([parent]),
        requestedError: 4,
        inView: () => false,
        allowInViewCoarsening: false,
      })
    ).toEqual(new Set([parent]));
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

  it("coarsens directly to a loaded superparent when its error meets the target", () => {
    const { parent: grandparent, children: parents } = quartet();
    const fine = parents.flatMap((parent) => quartet(parent).children);
    expect(retain(fine, [grandparent])).toEqual(new Set([grandparent]));
    grandparent.traversal.error = 2;
    expect(retain(fine, [grandparent])).toEqual(new Set(fine));
  });

  it.each([-1, 0, 1, 2, 3])(
    "does not count loading state %s as a ready child",
    (loadingState) => {
      const { parent, children } = quartet();
      children[0].internal.loadingState = loadingState;
      expect(canCoarsenMeshCut(parent, new Set(children), 1)).toBe(false);
      expect(retain(children.slice(1), [parent])).toEqual(
        new Set([parent, ...children.slice(1)])
      );
    }
  );

  it("retains complete detail with unknown parent error", () => {
    const { parent, children } = quartet();
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

  it("retains omitted published coverage after it leaves the view", () => {
    const tile = mesh();
    expect(retain([tile], [])).toEqual(new Set([tile]));
    tile.traversal.inFrustum = false;
    expect(retain([tile], [])).toEqual(new Set([tile]));
  });

  it("keeps pan history on return until a selected fallback replaces it", () => {
    const { parent, children } = quartet();
    const entering = mesh();
    children.forEach((child) => (child.traversal.inFrustum = false));
    let current = retain(children, [entering]);
    expect(current).toEqual(new Set([...children, entering]));

    entering.traversal.inFrustum = false;
    children.forEach((child) => (child.traversal.inFrustum = true));
    current = retain([...current], []);
    expect(current).toEqual(new Set([...children, entering]));

    children.forEach((child) => (child.traversal.inFrustum = false));
    current = retain([...current], [parent]);
    expect(current).toEqual(new Set([parent, entering]));
  });

  it("keeps a historical parent alongside a partial descendant cut", () => {
    const parent = mesh();
    parent.traversal.inFrustum = false;
    const children = quartet(parent).children;
    expect(retain([parent], children.slice(0, 3))).toEqual(
      new Set([parent, ...children.slice(0, 3)])
    );
    expect(retain([parent], children)).toEqual(new Set(children));
  });

  it("publishes a complete view cut without permitting eviction of its fallback", () => {
    const { parent, children } = quartet(mesh(null, 100));
    const visible = children.slice(0, 3);
    children[3].traversal.inFrustum = false;
    children[3].internal.loadingState = 0;
    const cut = retainMeshDetailFrontier({
      previous: new Set([parent]),
      proposed: new Set(visible),
      requestedError: 4,
      inView: (tile) => tile.traversal.inFrustum,
    });
    expect(cut).toEqual(new Set(visible));
    expect(isMeshCoverageRemovalSafe(parent, cut)).toBe(false);
    // On a pan into the missing quadrant, the complete-view test fails again.
    children[3].traversal.inFrustum = true;
    expect(retain([parent], visible)).toEqual(new Set([parent, ...visible]));
    delete (children[3] as { traversal?: unknown }).traversal;
    expect(
      retainMeshDetailFrontier({
        previous: new Set([parent]),
        proposed: new Set(visible),
        requestedError: 4,
        inView: (tile) => !!tile.traversal?.inFrustum,
      })
    ).toEqual(new Set([parent, ...visible]));
  });

  it("publishes the coarsest loaded fallback for a wholly offscreen family", () => {
    const grandparent = mesh();
    const { parent, children } = quartet(mesh(grandparent));
    grandparent.children = [parent];
    grandparent.traversal.inFrustum = false;
    parent.traversal.inFrustum = false;
    children.forEach((child) => (child.traversal.inFrustum = false));
    expect(retain(children, [])).toEqual(new Set([grandparent]));
  });

  it("de-densifies an offscreen branch only to its permitted reserve level", () => {
    const { parent: root, children: middle } = quartet();
    const fine = middle.flatMap((tile) => quartet(tile).children);
    for (const tile of [root, ...middle, ...fine])
      tile.traversal.inFrustum = false;
    const nearby = retainMeshDetailFrontier({
      previous: new Set(fine),
      proposed: new Set(),
      requestedError: 1,
      inView: () => false,
      acceptsOffscreenFallback: (tile) => tile !== root,
    });
    expect(nearby).toEqual(new Set(middle));
    // When that same branch is farther away, its superparent becomes sufficient.
    expect(retain([...nearby], [])).toEqual(new Set([root]));
    middle[0].internal.loadingState = 2;
    const missingReplacement = retainMeshDetailFrontier({
      previous: new Set(fine),
      proposed: new Set(),
      requestedError: 1,
      inView: () => false,
      acceptsOffscreenFallback: (tile) => tile !== root,
    });
    expect(missingReplacement).toEqual(
      new Set([...middle.slice(1), ...middle[0].children])
    );
  });

  it("does not coarsen a family containing an in-view proposed tile", () => {
    const { parent, children } = quartet();
    parent.traversal.inFrustum = false;
    children.forEach((child) => (child.traversal.inFrustum = false));
    children[0].traversal.inFrustum = true;
    expect(retain(children, [children[0]])).toEqual(new Set(children));
  });

  it("keeps offscreen history when no loaded fallback exists", () => {
    const { parent, children } = quartet();
    parent.internal.loadingState = 0;
    parent.traversal.inFrustum = false;
    children.forEach((child) => (child.traversal.inFrustum = false));
    expect(retain(children, [])).toEqual(new Set(children));
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
