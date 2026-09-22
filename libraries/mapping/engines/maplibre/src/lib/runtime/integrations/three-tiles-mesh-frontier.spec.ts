import type { Tile } from "3d-tiles-renderer/core";
import { describe, expect, it } from "vitest";
import {
  isMeshCoveredByLoadedChildren,
  getRetainedMeshAncestors,
  hasDisplayedAncestor,
  canCoarsenMeshCut,
  retainMeshDetailFrontier,
  shouldDeferMeshRefinement,
  isPublishedMeshRefinementLevel,
  refineLoadedMeshFrontier,
  getReadyMeshRegionCut,
  advanceMeshCorridorFrontier,
  collectLoadedMeshReceiverCandidates,
  selectMeshReceiverCut,
  selectMeshUnderlayParents,
  isMeshRefinementBeyondStage,
  hasMeshRefinementContentInView,
  hasLoadedExtentFloorAncestor,
  isMeshCoverageRemovalSafe,
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

describe("local progressive mesh admission", () => {
  it("advances one drawable level after initial coverage, without treating JSON routes as a LOD", () => {
    const parent = mesh(null, 10);
    const route = mesh(parent);
    route.internal.hasRenderableContent = false;
    const child = mesh(route, 5);
    const grandchild = mesh(child, 2.5);
    const displayed = new Set([parent]);
    expect(isPublishedMeshRefinementLevel(child, displayed)).toBe(true);
    expect(isPublishedMeshRefinementLevel(grandchild, displayed)).toBe(false);
    displayed.clear();
    displayed.add(child);
    expect(isPublishedMeshRefinementLevel(grandchild, displayed)).toBe(true);
    parent.traversal.error = 500; // Zoom-in after a zoom-out and pan.
    displayed.clear();
    displayed.add(parent);
    expect(isPublishedMeshRefinementLevel(child, displayed)).toBe(true);
    expect(isPublishedMeshRefinementLevel(grandchild, displayed)).toBe(false);
    displayed.clear();
    expect(isPublishedMeshRefinementLevel(child, displayed)).toBe(false);
  });

  it("bounds request discovery to two payload levels across pending parents and JSON routes", () => {
    const parent = mesh(null, 40);
    const child = mesh(parent, 20);
    child.internal.loadingState = 2;
    const route = mesh(child);
    route.internal.hasRenderableContent = false;
    const grandchild = mesh(route, 10);
    const deeper = mesh(grandchild, 5);
    const displayed = new Set([parent]);
    expect(isPublishedMeshRefinementLevel(child, displayed)).toBe(true);
    expect(isPublishedMeshRefinementLevel(child, displayed, 2)).toBe(false);
    expect(isPublishedMeshRefinementLevel(grandchild, displayed, 2)).toBe(true);
    expect(isPublishedMeshRefinementLevel(deeper, displayed, 2)).toBe(false);
    child.refine = "ADD";
    expect(isPublishedMeshRefinementLevel(grandchild, displayed, 2)).toBe(
      false
    );
    child.refine = "REPLACE";
    parent.internal.loadingState = 0;
    expect(isPublishedMeshRefinementLevel(grandchild, displayed, 2)).toBe(
      false
    );
  });

  it("includes both prefetch levels but excludes immediate support and deeper descendants", () => {
    const root = mesh(null, 64);
    const immediate = mesh(root, 32);
    const first = mesh(immediate, 16);
    const route = mesh(first);
    route.internal.hasRenderableContent = false;
    const second = mesh(route, 8);
    const third = mesh(second, 4);
    immediate.internal.loadingState = first.internal.loadingState = 2;
    const published = new Set([root]);
    for (const count of [0, 1, 2]) {
      const selected = [immediate, first, second, third].filter((tile) =>
        isPublishedMeshRefinementLevel(tile, published, 2, 1 + count)
      );
      expect(selected).toEqual([first, second].slice(0, count));
    }
  });

  const atomicCut = (
    root: Tile,
    published: Tile[] = [],
    allowCoarseBootstrap = false
  ) =>
    collectLoadedMeshReceiverCandidates(
      root,
      6,
      12,
      (tile) => tile.traversal.inFrustum,
      (tile) => tile.traversal.error,
      undefined,
      undefined,
      () => true,
      new Set(),
      {
        published: new Set(published),
        support: new Set(),
        atomic: true,
        allowCoarseBootstrap,
      }
    );

  it("publishes the first acceptable viewport cut together, never detail islands", () => {
    const { parent, children } = quartet(mesh(null, 80));
    parent.internal.loadingState = 0;
    for (const child of children) child.traversal.error = 10;
    children[3].internal.loadingState = 2;
    expect(atomicCut(parent)).toEqual(new Set());
    children[3].internal.loadingState = 4;
    expect(atomicCut(parent)).toEqual(new Set(children));
  });

  it("keeps an already published coarse surface until all replacements are ready", () => {
    const { parent, children } = quartet(mesh(null, 30));
    children[3].internal.loadingState = 2;
    expect(atomicCut(parent, [parent])).toEqual(new Set([parent]));
    children[3].internal.loadingState = 4;
    expect(atomicCut(parent, [parent])).toEqual(new Set(children));
  });

  it("shows complete coarse coverage before the initial quality target is ready", () => {
    const { parent, children } = quartet(mesh(null, 64));
    children[3].internal.loadingState = 2;
    expect(atomicCut(parent)).toEqual(new Set([parent]));
    children[3].internal.loadingState = 4;
    expect(atomicCut(parent)).toEqual(new Set(children));
  });

  it("keeps 500px reserves hidden on startup, but available for later gapless zooms", () => {
    const { parent, children } = quartet(mesh(null, 500));
    children.forEach((child) => {
      child.traversal.error = 64;
    });
    children[3].internal.loadingState = 2;
    expect(atomicCut(parent)).toEqual(new Set());
    children[3].internal.loadingState = 4;
    expect(atomicCut(parent)).toEqual(new Set(children));
    expect(atomicCut(mesh(null, 65))).toEqual(new Set());
    children.forEach((child) => {
      child.internal.loadingState = 2;
    });
    expect(atomicCut(parent, [parent])).toEqual(new Set([parent]));
  });

  it("publishes complete coarse hard-shadow coverage before finer LODs arrive", () => {
    const { parent, children } = quartet(mesh(null, 500));
    children.forEach((child) => {
      child.internal.loadingState = 2;
    });
    expect(atomicCut(parent, [], true)).toEqual(new Set([parent]));
    parent.internal.loadingState = 2;
    children[0].internal.loadingState = 4;
    // No partial islands while the first full surface is still missing.
    expect(atomicCut(parent, [], true)).toEqual(new Set());
    children.forEach((child) => {
      child.internal.loadingState = 4;
    });
    expect(atomicCut(parent, [], true)).toEqual(new Set(children));
  });

  it("does not open the non-atomic shadow admission gate for coarse startup tiles", () => {
    const { parent, children } = quartet(mesh(null, 80));
    for (const child of children) child.internal.loadingState = 2;
    expect(
      collectLoadedMeshReceiverCandidates(
        parent,
        6,
        12,
        () => true,
        (tile) => tile.traversal.error
      )
    ).toEqual(new Set());
  });

  it.each(["ready", "loading", "material-pending"])(
    "checks resident siblings before motion-stage coarsening (%s)",
    (siblingState) => {
      const { parent, children } = quartet(mesh(null, 10));
      children.forEach((child) => (child.traversal.error = 3));
      const previous = new Set(children.slice(0, 3));
      if (siblingState === "loading") children[3].internal.loadingState = 2;
      const inView = (tile: Tile) => tile.traversal.inFrustum;
      const error = (tile: Tile) => tile.traversal.error;
      const retained = getRetainedMeshAncestors(previous, 4, inView, error);
      const proposed = collectLoadedMeshReceiverCandidates(
        parent,
        12,
        12,
        inView,
        error,
        undefined,
        undefined,
        (tile) => siblingState !== "material-pending" || tile !== children[3],
        retained,
        { published: previous, support: new Set(), atomic: true }
      );
      // All ready siblings can publish immediately, despite the previously
      // partial view. An unfinished sibling still requires the gapless parent.
      const expected = new Set(siblingState === "ready" ? children : [parent]);
      expect(proposed).toEqual(expected);
      expect(
        retainMeshDetailFrontier({
          previous,
          proposed,
          requestedError: 4,
          inView,
          errorPixels: error,
        })
      ).toEqual(expected);
    }
  );

  it("promotes an unpublished coarse reserve immediately when a pan exposes missing children", () => {
    const { parent, children } = quartet(mesh(null, 80));
    children[3].internal.loadingState = 2;
    // The parent was prefetched, not published; the old view only saw three children.
    const proposed = atomicCut(parent, children.slice(0, 3));
    expect(proposed).toEqual(new Set([parent]));
    expect(retain(children.slice(0, 3), [...proposed], 6)).toEqual(
      new Set([parent])
    );
    children[3].internal.loadingState = 4;
    expect(atomicCut(parent, [parent])).toEqual(new Set(children));
  });

  it("finishes immediate offscreen siblings before publishing a finer family on repeated drags", () => {
    const { parent, children } = quartet(mesh(null, 10));
    children.forEach((child) => (child.traversal.error = 3));
    const { children: grandchildren } = quartet(children[3]);
    grandchildren.forEach((child) => (child.internal.loadingState = 0));
    children[3].internal.loadingState = 2;
    const support = new Set<Tile>();
    const inView = (tile: Tile) => tile.traversal.inFrustum;
    const error = (tile: Tile) => tile.traversal.error;
    children[3].traversal.inFrustum = false;
    const select = (published: Set<Tile>, target: number) =>
      collectLoadedMeshReceiverCandidates(
        parent,
        target,
        12,
        inView,
        error,
        undefined,
        undefined,
        () => true,
        getRetainedMeshAncestors(published, 4, inView, error),
        { published, support, atomic: true }
      );
    expect(select(new Set([parent]), 4)).toEqual(new Set([parent]));
    // Visible prerequisites must compete equally with their offscreen sibling.
    expect(support).toEqual(new Set(children));
    // Sibling support must stop at its first payload, not request offscreen
    // grandchildren or wait for their ideal detail.
    children[3].internal.loadingState = 4;
    let published = select(new Set([parent]), 4);
    expect(published).toEqual(new Set(children));
    for (let drag = 0; drag < 8; drag++) {
      children.forEach(
        (child, index) => (child.traversal.inFrustum = index !== drag % 4)
      );
      published = retainMeshDetailFrontier({
        previous: published,
        proposed: select(published, 12),
        requestedError: 4,
        inView,
        errorPixels: error,
      });
      expect(published).toEqual(new Set(children));
      expect([...support].some((tile) => grandchildren.includes(tile))).toBe(
        false
      );
    }
  });

  it("fills only intersecting cold branches, then completes offscreen residency without coarsening the view", () => {
    const { parent, children } = quartet(mesh(null, 40));
    children.forEach((child) => (child.traversal.error = 6));
    children[3].traversal.inFrustum = false;
    children[3].internal.loadingState = 0;
    const support = new Set<Tile>();
    const published = new Set([parent]);
    const select = (completeOffscreenFamilies: boolean) =>
      collectLoadedMeshReceiverCandidates(
        parent,
        8,
        96,
        (tile) => tile.traversal.inFrustum,
        (tile) => tile.traversal.error,
        undefined,
        undefined,
        () => true,
        new Set(),
        { published, support, atomic: true, completeOffscreenFamilies }
      );
    const visible = new Set(children.slice(0, 3));
    expect(select(false)).toEqual(visible);
    expect(support).toEqual(visible);
    // The unused region still needs its resident parent for a subsequent pan.
    expect(isMeshCoverageRemovalSafe(parent, visible)).toBe(false);
    children[2].internal.loadingState = 0;
    expect(select(false)).toEqual(new Set([parent]));
    children[2].internal.loadingState = 4;
    // Handover restores whole-family support without discarding visible detail.
    const proposed = select(true);
    expect(proposed).toEqual(new Set([parent]));
    expect(support).toEqual(new Set(children));
    expect(retain([...visible], [...proposed], 8)).toEqual(visible);
    // Moving across the previously unseen boundary reuses the complete parent.
    children[3].traversal.inFrustum = true;
    expect(retain([...visible], [...select(false)], 8)).toEqual(
      new Set([parent])
    );
    children[3].internal.loadingState = 4;
    expect(select(true)).toEqual(new Set(children));
  });

  it("does not treat raw topology as offscreen during cold first fill", () => {
    const { parent, children } = quartet(mesh(null, 100));
    parent.internal.loadingState = 0;
    const unknown = { children: [] } as unknown as Tile;
    parent.children = [...children.slice(0, 3), unknown];
    const unpreparedParents = new Set<Tile>();
    const selected = collectLoadedMeshReceiverCandidates(
      parent,
      8,
      96,
      (tile) => tile !== unknown,
      (tile) => tile.traversal.error,
      undefined,
      undefined,
      () => true,
      new Set(),
      {
        published: new Set(),
        support: new Set(),
        unpreparedParents,
        atomic: true,
        completeOffscreenFamilies: false,
      }
    );
    expect(selected.size).toBe(0);
    expect(unpreparedParents).toEqual(new Set([parent]));
  });

  it("does not withhold resident newly exposed branches behind a distant unloaded branch", () => {
    const { parent, children } = quartet(mesh(null, 80));
    parent.internal.loadingState = 0;
    children[3].internal.loadingState = 2;
    expect(atomicCut(parent, [children[0]])).toEqual(
      new Set(children.slice(0, 3))
    );
  });

  it("accepts known empty branches but waits for unknown topology in the first cut", () => {
    const { parent, children } = quartet(mesh(null, 80));
    parent.internal.loadingState = 0;
    const empty = children[3];
    empty.internal.hasContent = false;
    empty.internal.hasRenderableContent = false;
    empty.internal.loadingState = 0;
    expect(atomicCut(parent)).toEqual(new Set(children.slice(0, 3)));
    empty.internal.hasUnrenderableContent = true;
    expect(atomicCut(parent)).toEqual(new Set());
  });

  it("repairs an incomplete previous cut with a ready parent instead of keeping a hole", () => {
    const { parent, children } = quartet(mesh(null, 10));
    children[3].internal.loadingState = 2;
    expect(retain(children.slice(0, 3), [parent], 6)).toEqual(
      new Set([parent])
    );
    children[3].internal.loadingState = 4;
    expect(retain(children, [parent], 6)).toEqual(new Set(children));
  });

  it("accepts proven empty children, but not unknown or external metadata", () => {
    const { parent, children } = quartet(mesh(null, 16));
    const empty = children[0];
    empty.internal.hasContent = false;
    empty.internal.hasRenderableContent = false;
    empty.internal.loadingState = 0;
    const select = () =>
      refineLoadedMeshFrontier(new Set([parent]), 1, () => true);
    expect(select()).toEqual(new Set(children.slice(1)));
    expect(hasMeshRefinementContentInView(empty, () => true)).toBe(false);
    empty.internal.hasContent = true;
    empty.internal.hasUnrenderableContent = true;
    expect(select()).toEqual(new Set([parent]));
    expect(hasMeshRefinementContentInView(empty, () => true)).toBe(true);
  });

  it("keeps the textured parent until all visible geometry-only children are promoted", () => {
    const { parent, children } = quartet(mesh(null, 16));
    const ready = new Set([parent, ...children.slice(1)]);
    const select = () =>
      collectLoadedMeshReceiverCandidates(
        parent,
        1,
        Infinity,
        (tile) => tile.traversal.inFrustum,
        (tile) => tile.traversal.error,
        undefined,
        undefined,
        (tile) => ready.has(tile)
      );
    expect(select()).toEqual(new Set([parent]));
    ready.add(children[0]);
    expect(select()).toEqual(new Set(children));
  });
  it("retains a shared chimney parent until its offscreen caster child is loaded", () => {
    const { parent, children } = quartet(mesh(null, 16));
    const [receiver, chimney, unrelatedA, unrelatedB] = children;
    chimney.traversal.inFrustum = false;
    chimney.internal.loadingState = 2;
    const demand = (tile: Tile) => tile !== unrelatedA && tile !== unrelatedB;
    const select = () =>
      collectLoadedMeshReceiverCandidates(
        parent,
        1,
        Infinity,
        demand,
        (tile) => tile.traversal.error
      );
    expect(select()).toEqual(new Set([parent]));
    chimney.internal.loadingState = 4;
    expect(select()).toEqual(new Set([receiver, chimney]));
    // Unrelated children need not load, and the parent never overlaps children.
    unrelatedA.internal.loadingState = 2;
    unrelatedB.internal.loadingState = 2;
    expect(select()).toEqual(new Set([receiver, chimney]));
  });
  it("replaces complete local families atomically for every partial child arrival order", () => {
    const root = mesh(null, 64);
    const a = mesh(root, 8);
    const b = mesh(root, 8);
    root.children = [a, b];
    const readyFamily = quartet(a).children;
    const streamingFamily = quartet(b).children;
    for (let mask = 0; mask < 16; mask += 1) {
      streamingFamily.forEach((tile, index) => {
        tile.internal.loadingState = mask & (1 << index) ? 4 : 2;
      });
      const proposed = collectLoadedMeshReceiverCandidates(
        root,
        1,
        Infinity,
        () => true,
        (tile) => tile.traversal.error
      );
      const published = retain([a, b], [...proposed]);
      expect(published).toEqual(
        new Set([...readyFamily, ...(mask === 15 ? streamingFamily : [b])])
      );
      for (const tile of published) {
        for (let parent = tile.parent; parent; parent = parent.parent) {
          expect(published.has(parent)).toBe(false);
        }
      }
    }
  });
  it("holds each loaded stage until its own hard presentation, independently of other families", () => {
    const root = mesh(null, 64);
    const a16 = mesh(root, 16);
    const b16 = mesh(root, 16);
    const a8 = mesh(a16, 8);
    const b8 = mesh(b16, 8);
    const a4 = mesh(a8, 4);
    root.children = [a16, b16];
    a16.children = [a8];
    b16.children = [b8];
    a8.children = [a4];
    const select = (committed: Tile[], presented: Tile[]) =>
      collectLoadedMeshReceiverCandidates(
        root,
        1,
        16,
        () => true,
        (tile) => tile.traversal.error,
        new Set(committed),
        new Set(presented)
      );
    expect(select([], [])).toEqual(new Set([a16, b16]));
    expect(select([a16, b16], [])).toEqual(new Set([a16, b16]));
    expect(select([a16, b16], [a16])).toEqual(new Set([a8, b16]));
    expect(select([a8, b16], [a16])).toEqual(new Set([a8, b16]));
    expect(select([a8, b16], [a8])).toEqual(new Set([a4, b16]));
  });

  it("admits a direct caster dependency beneath an unpublished receiver without releasing unnecessary descendants", () => {
    const pendingReceiver = mesh(null, 16);
    pendingReceiver.geometricError = 16;
    const requiredCaster = mesh(pendingReceiver, 4);
    requiredCaster.geometricError = 4;
    const unnecessaryChild = mesh(requiredCaster, 1);
    unnecessaryChild.geometricError = 1;
    const frontier = new Set([pendingReceiver]);
    const committed = new Set<Tile>();

    expect(
      isMeshRefinementBeyondStage(requiredCaster, frontier, committed)
    ).toBe(true);
    // A second receiver's intersecting corridor requires 4m caster error.
    // The pending 16m receiver cannot stand in for this direct dependency.
    expect(
      isMeshRefinementBeyondStage(requiredCaster, frontier, committed, 4)
    ).toBe(false);
    expect(
      isMeshRefinementBeyondStage(unnecessaryChild, frontier, committed, 4)
    ).toBe(true);
    // No overlap, or a parent already meeting the actual matched budget,
    // must retain coarse-first admission rather than opening the whole tree.
    expect(
      isMeshRefinementBeyondStage(requiredCaster, frontier, committed, 16)
    ).toBe(true);
  });

  it("starts each family coarse, refines after publication and never regresses a committed fine cut", () => {
    const root = mesh(null, 64);
    const coarse = mesh(root, 16);
    const middle = mesh(coarse, 8);
    const fine = mesh(middle, 1);
    root.children = [coarse];
    coarse.children = [middle];
    middle.children = [fine];
    const select = (committed: Tile[]) =>
      collectLoadedMeshReceiverCandidates(
        root,
        1,
        16,
        () => true,
        (tile) => tile.traversal.error,
        new Set(committed)
      );
    expect(select([])).toEqual(new Set([coarse]));
    expect(select([coarse])).toEqual(new Set([middle]));
    expect(select([middle])).toEqual(new Set([fine]));
    expect(select([fine])).toEqual(new Set([fine]));
    expect(
      isMeshRefinementBeyondStage(middle, new Set([coarse]), new Set())
    ).toBe(true);
    expect(
      isMeshRefinementBeyondStage(middle, new Set([coarse]), new Set([coarse]))
    ).toBe(false);
    expect(
      isMeshRefinementBeyondStage(fine, new Set([coarse]), new Set([coarse]))
    ).toBe(true);
    // A missing next-stage child must remain admissible, not deadlock behind
    // the published parent that is supplying current coverage.
    middle.internal.loadingState = 2;
    fine.internal.loadingState = 2;
    expect(select([coarse])).toEqual(new Set([coarse]));
    expect(
      isMeshRefinementBeyondStage(middle, new Set([coarse]), new Set([coarse]))
    ).toBe(false);
  });

  it("finds a complete <=16px family below a city fallback while its sibling loads", () => {
    const root = mesh(null, 64);
    const ready = mesh(root, 8);
    const pending = mesh(root, 8);
    pending.internal.loadingState = 2;
    root.children = [ready, pending];
    expect(
      collectLoadedMeshReceiverCandidates(
        root,
        1,
        16,
        (tile) => tile.traversal.inFrustum,
        (tile) => tile.traversal.error
      )
    ).toEqual(new Set([ready]));
  });

  it("publishes only the intersected part of a historical refinement", () => {
    const { parent, children } = quartet(mesh(null, 28));
    children.forEach((child) => (child.traversal.error = 10));
    const inViewChild = children[0];
    const support = new Set<Tile>();
    const cut = collectLoadedMeshReceiverCandidates(
      parent,
      4,
      Number.POSITIVE_INFINITY,
      (tile) => tile === parent || tile === inViewChild,
      (tile) => tile.traversal.error,
      undefined,
      undefined,
      () => true,
      new Set(),
      { published: new Set([parent]), support }
    );
    expect(cut).toEqual(new Set([inViewChild]));
    expect(support).toEqual(new Set());
  });

  it("does not download missing offscreen siblings", () => {
    const { parent, children } = quartet(mesh(null, 28));
    children.forEach((child) => (child.traversal.error = 10));
    const missing = children[2];
    missing.internal.loadingState = 0;
    const support = new Set<Tile>();
    const cut = collectLoadedMeshReceiverCandidates(
      parent,
      4,
      Number.POSITIVE_INFINITY,
      (tile) => tile === parent || tile === children[0],
      (tile) => tile.traversal.error,
      undefined,
      undefined,
      () => true,
      new Set(),
      { published: new Set([parent]), support }
    );
    expect(cut).toEqual(new Set([children[0]]));
    expect(support).toEqual(new Set());
  });

  it("uses the resident parent on pan until the newly intersected sibling is ready", () => {
    const { parent, children } = quartet(mesh(null, 28));
    children.forEach((child) => (child.traversal.error = 10));
    children[1].internal.loadingState = 0;
    let visible = children[0];
    const select = () =>
      collectLoadedMeshReceiverCandidates(
        parent,
        4,
        Number.POSITIVE_INFINITY,
        (tile) => tile === parent || tile === visible,
        (tile) => tile.traversal.error
      );
    expect(select()).toEqual(new Set([children[0]]));
    visible = children[1];
    expect(select()).toEqual(new Set([parent]));
    children[1].internal.loadingState = 4;
    expect(select()).toEqual(new Set([children[1]]));
  });

  it("does not prepare materials for offscreen sibling support", () => {
    const { parent, children } = quartet(mesh(null, 28));
    children.forEach((child) => (child.traversal.error = 10));
    const unready = children[3];
    const support = new Set<Tile>();
    const cut = collectLoadedMeshReceiverCandidates(
      parent,
      4,
      Number.POSITIVE_INFINITY,
      (tile) => tile === parent || tile === children[0],
      (tile) => tile.traversal.error,
      undefined,
      undefined,
      (tile) => tile !== unready,
      new Set(),
      { published: new Set([parent]), support }
    );
    expect(cut).toEqual(new Set([children[0]]));
    expect(support).toEqual(new Set());
  });

  it("does not descend into unconditional offscreen siblings", () => {
    const { parent, children } = quartet(mesh(null, 28));
    children.forEach((child) => (child.traversal.error = 10));
    const unconditional = children[2];
    unconditional.traversal.unconditionallyRefine = true;
    unconditional.internal.loadingState = 0;
    const grandchildren = quartet(unconditional).children;
    const missingGrandchild = grandchildren[1];
    missingGrandchild.internal.loadingState = 0;
    const support = new Set<Tile>();
    const select = () =>
      collectLoadedMeshReceiverCandidates(
        parent,
        4,
        Number.POSITIVE_INFINITY,
        (tile) => tile === parent || tile === children[0],
        (tile) => tile.traversal.error,
        undefined,
        undefined,
        () => true,
        new Set(),
        { published: new Set([parent]), support }
      );
    expect(select()).toEqual(new Set([children[0]]));
    expect(support).toEqual(new Set());
    expect(support.has(unconditional)).toBe(false);

    support.clear();
    missingGrandchild.internal.loadingState = 4;
    expect(select()).toEqual(new Set([children[0]]));
    expect(support).toEqual(new Set());
  });

  it("retains a bounded parent when its own fine family is incomplete", () => {
    const { parent, children } = quartet(mesh(null, 16));
    children[1].internal.loadingState = 2;
    expect(
      collectLoadedMeshReceiverCandidates(
        parent,
        1,
        16,
        () => true,
        (tile) => tile.traversal.error
      )
    ).toEqual(new Set([parent]));
    parent.traversal.error = Number.POSITIVE_INFINITY;
    for (const child of children) child.internal.loadingState = 2;
    expect(
      collectLoadedMeshReceiverCandidates(
        parent,
        1,
        16,
        () => true,
        (tile) => tile.traversal.error
      ).size
    ).toBe(0);
  });

  it("never turns a direct caster into another receiver and transitive caster demand", () => {
    const root = mesh(null, 64);
    const receiver = mesh(root, 8);
    const receiverFine = mesh(receiver, 1);
    const directCaster = mesh(root, 1);
    const casterOfCaster = mesh(root, 1);
    // All can be in the camera frustum, but only the original receiver family
    // owns receiver demand. A->B does not imply another B->C shadow corridor.
    expect(
      selectMeshReceiverCut(
        [receiverFine, directCaster, casterOfCaster],
        new Set([receiver])
      )
    ).toEqual(new Set([receiverFine]));
  });

  it("advances each loaded branch while an unrelated sibling remains pending", () => {
    const root = mesh(null, 64);
    const ready = mesh(root, 8);
    const slow = mesh(root, 8);
    slow.internal.loadingState = 2;
    root.children = [ready, slow];
    const next = mesh(ready, 4);
    next.internal.loadingState = 0;
    expect(shouldDeferMeshRefinement(next, 1)).toBe(false);
    expect(shouldDeferMeshRefinement(mesh(slow, 4), 1)).toBe(true);
    expect(shouldDeferMeshRefinement(mesh(next, 2), 1)).toBe(true);
    next.internal.loadingState = 4;
    expect(shouldDeferMeshRefinement(mesh(next, 2), 1)).toBe(false);
    expect(slow.internal.loadingState).toBe(2);
  });

  it("does not wait for coarse ancestors or reload evicted redundant ancestors", () => {
    const coarse = mesh(null, 64);
    coarse.internal.loadingState = 0;
    expect(shouldDeferMeshRefinement(mesh(coarse, 16), 1)).toBe(false);
    coarse.traversal.error = 16;
    const ready = mesh(coarse, 4);
    expect(shouldDeferMeshRefinement(mesh(ready, 2), 1)).toBe(false);
  });

  it("respects the current target and skips metadata or unconditional parents", () => {
    const ready = mesh(null, 4);
    const metadata = mesh(ready, 2);
    metadata.internal.hasRenderableContent = false;
    expect(shouldDeferMeshRefinement(mesh(metadata), 1)).toBe(false);
    expect(shouldDeferMeshRefinement(mesh(metadata), 4)).toBe(true);
    metadata.internal.hasRenderableContent = true;
    metadata.traversal.unconditionallyRefine = true;
    metadata.internal.loadingState = 0;
    expect(shouldDeferMeshRefinement(mesh(metadata), 1)).toBe(false);
  });

  it.each([-1, 0, 1, 2, 3])(
    "keeps the local fallback for non-ready state %s",
    (state) => {
      const parent = mesh(null, 8);
      parent.internal.loadingState = state;
      expect(shouldDeferMeshRefinement(mesh(parent), 1)).toBe(true);
    }
  );
});

describe("regional mesh coverage", () => {
  const demand = (tile: Tile) => ({
    intersects: tile.traversal?.inFrustum ?? true,
    errorPixels: tile.traversal?.error ?? Number.POSITIVE_INFINITY,
  });

  it("accepts a complete coarse published stage but not an unfinished target stage", () => {
    const root = mesh(null, 16);
    const { children } = quartet(root);
    children[2].internal.loadingState = 2;
    expect(getReadyMeshRegionCut(root, new Set([root]), 16, demand)).toEqual([
      root,
    ]);
    expect(
      getReadyMeshRegionCut(root, new Set([root, ...children]), 1, demand)
    ).toBeNull();
    children[2].internal.loadingState = 4;
    expect(getReadyMeshRegionCut(root, new Set(children), 1, demand)).toEqual(
      children
    );
  });

  it("checks pending invisible caster branches but ignores unrelated queued siblings", () => {
    const root = mesh(null, 16);
    const { children } = quartet(root);
    children[0].internal.loadingState = 2;
    const published = new Set(children.slice(1));
    expect(getReadyMeshRegionCut(root, published, 1, demand)).toBeNull();
    children[0].traversal.inFrustum = false;
    expect(getReadyMeshRegionCut(root, published, 1, demand)).toEqual(
      children.slice(1)
    );
  });

  it.each([-1, 0, 1, 2, 3, 4])(
    "fails closed for unknown external metadata without descendants (%s)",
    (state) => {
      const metadata = mesh();
      metadata.internal.hasRenderableContent = false;
      metadata.internal.hasUnrenderableContent = true;
      metadata.internal.loadingState = state;
      expect(getReadyMeshRegionCut(metadata, new Set(), 1, demand)).toBeNull();
    }
  );

  it("does not infer readiness from a hidden loaded payload or missing ADD caster", () => {
    const root = mesh();
    expect(getReadyMeshRegionCut(root, new Set(), 1, demand)).toBeNull();
    root.refine = "ADD";
    root.children = [mesh(root)];
    expect(
      getReadyMeshRegionCut(root, new Set(root.children), 1, demand)
    ).toBeNull();
  });
});

describe("atomic progressive mesh corridors", () => {
  it("does not let shared caster closure replace an unpresented receiver", () => {
    const a = mesh(null, 16);
    const b = mesh(null, 16);
    const c = mesh(null, 16);
    const fineA = mesh(a, 8);
    const fineB = mesh(b, 8);
    const fineC = mesh(c, 8);
    const resolveCasters = (receivers: ReadonlySet<Tile>) => {
      const cut = new Set(receivers);
      if (cut.has(fineB)) {
        cut.delete(a);
        cut.add(fineA);
      }
      return { receivers: cut, casters: [...cut] };
    };
    const initial = {
      receivers: new Set([a, b, c]),
      casters: new Set([a, b, c]),
    };
    const held = advanceMeshCorridorFrontier({
      ...initial,
      proposed: new Set([a, fineB, fineC]),
      presented: new Set([b, c]),
      resolveCasters,
    });
    expect(held.receivers).toEqual(new Set([a, b, fineC]));
    expect(held.pending).toBe(true);
    const shown = advanceMeshCorridorFrontier({
      ...held,
      proposed: new Set([a, fineB, fineC]),
      presented: new Set([a, b, fineC]),
      resolveCasters,
    });
    expect(shown.receivers).toEqual(new Set([fineA, fineB, fineC]));
    expect(shown.pending).toBe(false);
  });

  it("uses main-camera error rather than combined shadow traversal error for cold fallback", () => {
    const coarse = mesh(null, 128);
    const fine = mesh(coarse, 1);
    const result = advanceMeshCorridorFrontier({
      receivers: new Set(),
      casters: new Set(),
      proposed: new Set([fine]),
      errorPixels: (tile) => (tile === coarse ? 16 : 1),
      resolveCasters: (receivers) =>
        receivers.has(fine) ? null : { receivers, casters: [...receivers] },
    });
    expect(result.receivers).toEqual(new Set([coarse]));
    expect(result.pending).toBe(true);
  });

  it("retains coarse receiver and caster together while fine casters load, and advances an independent family", () => {
    const coarseA = mesh(null, 16);
    const coarseB = mesh(null, 16);
    const fineA = mesh(coarseA, 1);
    const fineB = mesh(coarseB, 1);
    const casterA = mesh(null, 16);
    const casterB = mesh(null, 16);
    const fineCasterA = mesh(casterA, 1);
    const fineCasterB = mesh(casterB, 1);
    fineCasterA.internal.loadingState = 2;
    const resolveCasters = (receivers: ReadonlySet<Tile>) => {
      if (receivers.has(fineA) && fineCasterA.internal.loadingState !== 4)
        return null;
      return {
        receivers,
        casters: [
          ...receivers,
          receivers.has(fineA) ? fineCasterA : casterA,
          receivers.has(fineB) ? fineCasterB : casterB,
        ],
      };
    };
    const initial = {
      receivers: new Set([coarseA, coarseB]),
      casters: new Set([coarseA, coarseB, casterA, casterB]),
    };
    const proposed = new Set([fineA, fineB]);
    const first = advanceMeshCorridorFrontier({
      ...initial,
      proposed,
      resolveCasters,
    });
    expect(first.receivers).toEqual(new Set([coarseA, fineB]));
    expect(first.casters).toEqual(
      new Set([coarseA, fineB, casterA, fineCasterB])
    );
    expect(first.pending).toBe(true);
    fineCasterA.internal.loadingState = 4;
    const final = advanceMeshCorridorFrontier({
      ...first,
      proposed,
      resolveCasters,
    });
    expect(final.receivers).toEqual(new Set([fineA, fineB]));
    expect(final.casters).toEqual(
      new Set([fineA, fineB, fineCasterA, fineCasterB])
    );
    expect(final.pending).toBe(false);
  });

  it("does not publish a cold receiver without its complete corridor", () => {
    const receiver = mesh();
    const result = advanceMeshCorridorFrontier({
      receivers: new Set(),
      casters: new Set(),
      proposed: new Set([receiver]),
      resolveCasters: () => null,
    });
    expect(result.receivers.size).toBe(0);
    expect(result.casters.size).toBe(0);
    expect(result.pending).toBe(true);
  });
});

describe("progressive loaded mesh display", () => {
  it("uses displayed descendants as minimum caster detail without partial families", () => {
    const { parent, children } = quartet(mesh(null, 0.5));
    const displayed = new Set(children.slice(0, 3));
    const proposed = new Set([parent, ...children]);
    const select = () =>
      refineLoadedMeshFrontier(
        proposed,
        1,
        () => true,
        () => 0.5,
        displayed
      );
    children[3].internal.loadingState = 2;
    expect([...select()]).toEqual([parent]);
    children[3].internal.loadingState = 4;
    const casters = select();
    expect([...casters]).toEqual(children);
    for (const receiver of displayed) expect(casters.has(receiver)).toBe(true);
    expect(casters.has(parent)).toBe(false);
    // Mere cache residency is not a reason to over-refine unrelated casters.
    expect([
      ...refineLoadedMeshFrontier(
        proposed,
        1,
        () => true,
        () => 0.5
      ),
    ]).toEqual([parent]);
  });

  it("rechecks resident error and releases loose parent bounds with no intersecting children", () => {
    const { parent, children } = quartet(mesh(null, 0));
    const proposed = new Set([parent, ...children]);
    const currentError = (tile: Tile) => (tile === parent ? 16 : 0.5);
    expect([
      ...refineLoadedMeshFrontier(proposed, 1, () => true, currentError),
    ]).toEqual(children);
    expect([
      ...refineLoadedMeshFrontier(
        proposed,
        1,
        (tile) => tile === parent,
        currentError
      ),
    ]).toEqual([]);
    children[0].internal.loadingState = 2;
    expect([
      ...refineLoadedMeshFrontier(proposed, 1, () => true, currentError),
    ]).toEqual([parent]);
  });

  it("reports the missing sibling without changing receiver or caster publication", () => {
    const { parent, children } = quartet(mesh(null, 16));
    children[3].internal.loadingState = 2;
    const receiverWaits: Tile[] = [];
    const support = new Set<Tile>();
    const receiverCut = collectLoadedMeshReceiverCandidates(
      parent,
      1,
      Infinity,
      () => true,
      (tile) => tile.traversal.error,
      undefined,
      undefined,
      () => true,
      new Set(),
      {
        published: new Set([parent]),
        support,
        atomic: true,
        onWait: (tile, reason, blocker) => {
          expect(reason).toBe("replacement-family");
          expect(blocker).toBe(children[3]);
          receiverWaits.push(tile);
        },
      }
    );
    expect(receiverCut).toEqual(new Set([parent]));
    expect(receiverWaits).toEqual(children.slice(0, 3));
    const casterWaits: Tile[] = [];
    const casterCut = refineLoadedMeshFrontier(
      new Set([parent, ...children]),
      1,
      () => true,
      (tile) => tile.traversal.error,
      new Set(),
      (tile, blocker) => {
        expect(blocker).toBe(children[3]);
        casterWaits.push(tile);
      }
    );
    expect(casterCut).toEqual(receiverCut);
    expect(casterWaits).toEqual(receiverWaits);
  });

  it("never publishes a partial child set over a retained parent", () => {
    const { parent, children } = quartet(mesh(null, 16));
    children[3].internal.loadingState = 2;
    const proposed = new Set([parent, ...children.slice(0, 3)]);
    expect([...refineLoadedMeshFrontier(proposed, 1, () => true)]).toEqual([
      parent,
    ]);
    children[3].internal.loadingState = 4;
    expect([...refineLoadedMeshFrontier(proposed, 1, () => true)]).toEqual(
      children
    );
  });

  const refine = (root: Tile) => [
    ...refineLoadedMeshFrontier(
      new Set([root]),
      1,
      (tile) => tile.traversal?.inFrustum ?? true
    ),
  ];

  it("shows ready grandchildren alongside a coarse sibling without waiting for the viewport", () => {
    const root = mesh(null, 64);
    const a = mesh(root, 8);
    const b = mesh(root, 8);
    root.children = [a, b];
    const aChildren = quartet(a).children;
    const bChildren = quartet(b).children;
    bChildren[0].internal.loadingState = 2;
    expect(refine(root)).toEqual([...aChildren, b]);
    bChildren[0].internal.loadingState = 4;
    expect(refine(root)).toEqual([...aChildren, ...bChildren]);
  });

  it("does not let a pending offscreen external sibling hold the whole view", () => {
    const root = mesh(null, 64);
    const metadata = mesh(root, 64);
    metadata.internal.hasRenderableContent = false;
    metadata.internal.hasUnrenderableContent = true;
    const local = mesh(metadata, 8);
    metadata.children = [local];
    const outside = mesh(root, 64);
    outside.traversal.inFrustum = false;
    outside.internal.loadingState = 2;
    root.children = [metadata, outside];
    expect(refine(root)).toEqual([local]);
    outside.traversal.inFrustum = true;
    expect(refine(root)).toEqual([root]);
  });

  it.each([-1, 0, 1, 2, 3])(
    "retains coverage for an incomplete visible child (%s)",
    (state) => {
      const root = mesh(null, 64);
      const children = quartet(root).children;
      children[0].internal.loadingState = state;
      expect(refine(root)).toEqual([root]);
    }
  );

  it("does not refine past the target or rewrite ADD families", () => {
    const root = mesh(null, 1);
    quartet(root);
    expect(refine(root)).toEqual([root]);
    root.traversal.error = 64;
    root.refine = "ADD";
    expect(refine(root)).toEqual([root]);
  });
});

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
    const cut = collectLoadedMeshReceiverCandidates(
      root,
      2,
      Infinity,
      () => true,
      (tile) => tile.traversal.error,
      undefined,
      undefined,
      () => true,
      retained
    );
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
      // The incomplete previous cut is not coverage. Use the ready fallback,
      // without mistaking the unfinished child for a loaded replacement.
      expect(retain(children.slice(1), [parent])).toEqual(new Set([parent]));
    }
  );

  it("repairs a partial quartet but retains complete detail with unknown parent error", () => {
    const { parent, children } = quartet();
    expect(retain(children.slice(1), [parent])).toEqual(new Set([parent]));
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

  it("rejects a partial descendant cut over historical coverage", () => {
    const parent = mesh();
    parent.traversal.inFrustum = false;
    const children = quartet(parent).children;
    expect(retain([parent], children.slice(0, 3))).toEqual(new Set([parent]));
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
    expect(retain([parent], visible)).toEqual(new Set([parent]));
    delete (children[3] as { traversal?: unknown }).traversal;
    expect(
      retainMeshDetailFrontier({
        previous: new Set([parent]),
        proposed: new Set(visible),
        requestedError: 4,
        inView: (tile) => !!tile.traversal?.inFrustum,
      })
    ).toEqual(new Set([parent]));
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

describe("coverage-safe cache removal", () => {
  it("does not replace demanded detail with a loaded but inadequate ancestor", () => {
    const { parent, children } = quartet();
    const child = children[0];
    const resident = new Set([parent, child]);
    expect(isMeshCoverageRemovalSafe(child, resident, () => false)).toBe(false);
    expect(isMeshCoverageRemovalSafe(child, resident, () => true)).toBe(true);
    const finer = quartet(child).children;
    finer.forEach((tile) => resident.add(tile));
    expect(isMeshCoverageRemovalSafe(child, resident, () => false)).toBe(true);
  });
  it("protects offscreen coverage until a loaded ancestor exists", () => {
    const { parent, children } = quartet();
    const child = children[0];
    parent.internal.loadingState = 0;
    expect(isMeshCoverageRemovalSafe(child, new Set([child]))).toBe(false);
    parent.internal.loadingState = 4;
    expect(isMeshCoverageRemovalSafe(child, new Set([parent, child]))).toBe(
      true
    );
  });

  it("requires a complete loaded replacement cut", () => {
    const { parent, children } = quartet();
    const resident = new Set([parent, ...children.slice(0, 3)]);
    expect(isMeshCoverageRemovalSafe(parent, resident)).toBe(false);
    resident.add(children[3]);
    expect(isMeshCoverageRemovalSafe(parent, resident)).toBe(true);
  });

  it("accepts a complete deeper cut but not an additive ancestor", () => {
    const { parent, children } = quartet();
    const grandchildren = quartet(children[0]).children;
    const resident = new Set([...children.slice(1), ...grandchildren]);
    expect(isMeshCoverageRemovalSafe(parent, resident)).toBe(true);
    parent.refine = "ADD";
    expect(isMeshCoverageRemovalSafe(parent, resident)).toBe(false);
  });
});

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

describe("hasLoadedExtentFloorAncestor", () => {
  const withError = (tile: Tile, geometricError: number): Tile =>
    Object.assign(tile, { geometricError });

  it("looks through external metadata pages to resident floor geometry", () => {
    const floor = withError(mesh(), 908.22);
    const page = withError(mesh(floor), 908.22);
    page.internal.hasRenderableContent = false;
    const fine = withError(mesh(page), 454);
    expect(hasLoadedExtentFloorAncestor(fine, 908.2)).toBe(true);
    floor.internal.loadingState = 0;
    expect(hasLoadedExtentFloorAncestor(fine, 908.2)).toBe(false);
  });

  it("is the loaded state of the nearest ancestor at or above the floor", () => {
    const floor = withError(mesh(), 50);
    const mid = withError(mesh(floor), 24);
    const fine = withError(mesh(mid), 6);
    expect(hasLoadedExtentFloorAncestor(fine, 42)).toBe(true);
    floor.internal.loadingState = 0;
    expect(hasLoadedExtentFloorAncestor(fine, 42)).toBe(false);
  });

  it("ignores loaded ancestors above the floor tile", () => {
    const root = withError(mesh(), 900);
    const floor = withError(mesh(root), 50);
    floor.internal.loadingState = 0;
    const fine = withError(mesh(floor), 6);
    expect(hasLoadedExtentFloorAncestor(fine, 42)).toBe(false);
    expect(hasLoadedExtentFloorAncestor(withError(mesh(), 6), 42)).toBe(false);
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
