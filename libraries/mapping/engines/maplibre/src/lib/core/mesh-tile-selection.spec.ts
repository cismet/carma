import type { Tile } from "3d-tiles-renderer/core";
import { describe, expect, it } from "vitest";
import { isMeshCoverageRemovalSafe } from "./mesh-tile-coverage";
import { hasMeshRefinementContentInView } from "./mesh-tile-refinement";
import { selectMeshReceiverPlan } from "./mesh-tile-selection";
import { getRetainedMeshAncestors } from "./mesh-tile-retention";
import { mesh, quartet } from "./mesh-tile-test-fixtures";

describe("mesh receiver plan", () => {
  it("returns a fresh plan without modifying the tile graph or published inputs", () => {
    const { parent, children } = quartet(mesh(null, 16));
    children[1].internal.loadingState = 2;
    for (const tile of [parent, ...children]) {
      Object.freeze(tile.internal);
      Object.freeze(tile.traversal);
      Object.freeze(tile.children);
      Object.freeze(tile);
    }
    const published = new Set([parent]);
    const select = () =>
      selectMeshReceiverPlan(
        parent,
        1,
        Infinity,
        () => true,
        (tile) => tile.traversal.error,
        undefined,
        new Set(),
        { published }
      );
    const first = select();
    const expected = new Set([parent]);
    expect(first.tiles).toEqual(expected);
    first.tiles.clear();
    first.refinementSupport.clear();
    expect(select().tiles).toEqual(expected);
    expect([...published]).toEqual([parent]);
  });

  const receiverCut = (
    root: Tile,
    published: Tile[] = [],
    allowCoarseBootstrap = false
  ) =>
    selectMeshReceiverPlan(
      root,
      6,
      12,
      (tile) => tile.traversal?.inFrustum ?? true,
      (tile) => tile.traversal?.error ?? Infinity,
      undefined,
      new Set(),
      {
        published: new Set(published),
        allowCoarseBootstrap,
      }
    ).tiles;

  it("shows ready first-view children while coverage and quality are still incomplete", () => {
    const { parent, children } = quartet(mesh(null, 80));
    parent.internal.loadingState = 0;
    children.forEach((child) => (child.traversal.error = 10));
    children[3].internal.loadingState = 2;
    expect(receiverCut(parent)).toEqual(new Set(children.slice(0, 3)));
    children[3].internal.loadingState = 4;
    expect(receiverCut(parent)).toEqual(new Set(children));
  });

  it.each([64, 65, 500])(
    "limits the initial fallback to 64px without overlapping children (%s)",
    (error) => {
      const { parent, children } = quartet(mesh(null, error));
      children[3].internal.loadingState = 2;
      expect(receiverCut(parent)).toEqual(
        new Set(error <= 64 ? [parent] : children.slice(0, 3))
      );
      expect(receiverCut(parent, [parent])).toEqual(new Set([parent]));
      children[3].internal.loadingState = 4;
      expect(receiverCut(parent)).toEqual(new Set(children));
    }
  );

  it("keeps a coarse bootstrap alone until its child replacement is drawable", () => {
    const { parent, children } = quartet(mesh(null, 500));
    children.forEach((child) => (child.internal.loadingState = 2));
    expect(receiverCut(parent, [], true)).toEqual(new Set([parent]));
    children[0].internal.loadingState = 4;
    expect(receiverCut(parent, [], true)).toEqual(new Set([parent]));
    parent.internal.loadingState = 2;
    expect(receiverCut(parent, [], true)).toEqual(new Set([children[0]]));
  });

  it.each(["ready", "loading", "material-pending"])(
    "preserves ready detail while repairing a newly exposed sibling (%s)",
    (siblingState) => {
      const { parent, children } = quartet(mesh(null, 10));
      children.forEach((child) => (child.traversal.error = 3));
      const previous = new Set(children.slice(0, 3));
      if (siblingState === "loading") children[3].internal.loadingState = 2;
      const inView = (tile: Tile) => tile.traversal.inFrustum;
      const error = (tile: Tile) => tile.traversal.error;
      const proposed = selectMeshReceiverPlan(
        parent,
        12,
        12,
        inView,
        error,
        (tile) => siblingState !== "material-pending" || tile !== children[3],
        getRetainedMeshAncestors(previous, 4, inView, error),
        { published: previous }
      ).tiles;
      const expected = new Set(
        siblingState === "ready" ? children : children.slice(0, 3)
      );
      expect(proposed).toEqual(expected);
    }
  );

  it("keeps a loose visible fallback without requesting its offscreen children", () => {
    const { parent, children } = quartet(mesh(null, 40));
    const select = () =>
      selectMeshReceiverPlan(
        parent,
        6,
        12,
        (tile) => tile.traversal.inFrustum,
        (tile) => tile.traversal.error,
        undefined,
        new Set(),
        { published: new Set([parent]) }
      );
    children.forEach((child) => {
      child.traversal.inFrustum = false;
      child.internal.loadingState = 0;
    });
    expect(select().tiles).toEqual(new Set([parent]));
    expect(select().refinementSupport.size).toBe(0);
    children.forEach((child) => (child.internal.loadingState = 4));
    expect(select().tiles).toEqual(new Set([parent]));
    children[0].traversal.inFrustum = true;
    expect(select().tiles).toEqual(new Set([children[0]]));
    expect(
      [...select().refinementSupport].every((tile) => tile === children[0])
    ).toBe(true);
  });

  it.each(["missing", "material-pending", "unconditional"])(
    "does not request or prepare proven offscreen sibling support (%s)",
    (outsideState) => {
      const { parent, children } = quartet(mesh(null, 28));
      children.forEach((child) => (child.traversal.error = 10));
      const outside = children[3];
      if (outsideState === "missing") outside.internal.loadingState = 0;
      if (outsideState === "unconditional") {
        outside.traversal.unconditionallyRefine = true;
        outside.internal.loadingState = 0;
        quartet(outside).children.forEach(
          (tile) => (tile.internal.loadingState = 0)
        );
      }
      const materialChecks: Tile[] = [];
      const plan = selectMeshReceiverPlan(
        parent,
        4,
        Infinity,
        (tile) => tile === parent || tile === children[0],
        (tile) => tile.traversal.error,
        (tile) => {
          materialChecks.push(tile);
          return outsideState !== "material-pending" || tile !== outside;
        },
        new Set(),
        { published: new Set([parent]) }
      );
      const cut = plan.tiles;
      expect(cut).toEqual(new Set([children[0]]));
      for (const tile of [...children.slice(1), ...outside.children]) {
        expect(plan.refinementSupport.has(tile)).toBe(false);
        expect(materialChecks).not.toContain(tile);
      }
      // Visibility-relative publication cannot make full-extent eviction safe.
      expect(isMeshCoverageRemovalSafe(parent, cut)).toBe(false);
    }
  );

  it("holds the resident parent alone for an incomplete new demand", () => {
    const { parent, children } = quartet(mesh(null, 28));
    children[1].internal.loadingState = 0;
    const visible = new Set([parent, children[0]]);
    const select = () =>
      selectMeshReceiverPlan(
        parent,
        4,
        Infinity,
        (tile) => visible.has(tile),
        (tile) => tile.traversal.error
      ).tiles;
    expect(select()).toEqual(new Set([children[0]]));
    visible.add(children[1]);
    expect(select()).toEqual(new Set([parent]));
    children[1].internal.loadingState = 4;
    expect(select()).toEqual(new Set(children.slice(0, 2)));
  });

  it("prepares raw child topology without withholding drawable siblings", () => {
    const { parent, children } = quartet(mesh(null, 100));
    parent.internal.loadingState = 0;
    const unknown = { children: [] } as unknown as Tile;
    parent.children = [...children.slice(0, 3), unknown];
    const selected = selectMeshReceiverPlan(
      parent,
      8,
      96,
      (tile) => tile !== unknown,
      (tile) => tile.traversal?.error ?? Infinity,
      undefined,
      new Set(),
      { published: new Set() }
    );
    expect(selected.tiles).toEqual(new Set(children.slice(0, 3)));
    expect(selected.unpreparedParents).toEqual(new Set([parent]));
  });

  it("holds the material-ready parent alone and reports child material waits", () => {
    const { parent, children } = quartet(mesh(null, 16));
    const ready = new Set([parent, ...children.slice(1)]);
    const select = () =>
      selectMeshReceiverPlan(
        parent,
        1,
        Infinity,
        (tile) => tile.traversal.inFrustum,
        (tile) => tile.traversal.error,
        (tile) => ready.has(tile),
        new Set(),
        {
          published: new Set([parent]),
        }
      );
    expect(select().tiles).toEqual(new Set([parent]));
    expect(select().materialWaits).toEqual(new Set([children[0]]));
    ready.add(children[0]);
    expect(select().tiles).toEqual(new Set(children));
    expect(select().materialWaits.size).toBe(0);
  });

  it("does not display geometry whose material is unready when no fallback exists", () => {
    const { parent, children } = quartet(mesh(null, 16));
    parent.internal.loadingState = 0;
    const selected = selectMeshReceiverPlan(
      parent,
      1,
      Infinity,
      () => true,
      (tile) => tile.traversal.error,
      (tile) => tile !== children[0]
    ).tiles;
    expect(selected).toEqual(new Set(children.slice(1)));
  });
});

describe("exclusive receiver coverage", () => {
  const select = (root: Tile, inView: (tile: Tile) => boolean) =>
    selectMeshReceiverPlan(
      root,
      1,
      Infinity,
      inView,
      (tile) => tile.traversal?.error ?? Infinity
    ).tiles;
  const inView = (tile: Tile) => tile.traversal?.inFrustum ?? true;

  it.each([0, 1, 7, 15])(
    "replaces the parent only when the demanded family is complete (mask %s)",
    (mask) => {
      const { parent, children } = quartet(mesh(null, 16));
      children.forEach((tile, index) => {
        tile.internal.loadingState = mask & (1 << index) ? 4 : 2;
      });
      const ready = children.filter((tile) => tile.internal.loadingState === 4);
      expect(select(parent, inView)).toEqual(
        new Set(mask === 15 ? ready : [parent])
      );
    }
  );

  it.each([-1, 0, 1, 2, 3])(
    "waits for child state %s before replacing the parent",
    (state) => {
      const { parent, children } = quartet(mesh(null, 16));
      children[0].internal.loadingState = state;
      expect(select(parent, inView)).toEqual(new Set([parent]));
      parent.internal.loadingState = 0;
      expect(select(parent, inView)).toEqual(new Set(children.slice(1)));
    }
  );

  it("drops the fallback for complete domain coverage and restores it when demand expands", () => {
    const { parent, children } = quartet(mesh(null, 16));
    children[3].internal.loadingState = 2;
    children[3].traversal.inFrustum = false;
    expect(select(parent, inView)).toEqual(new Set(children.slice(0, 3)));
    children[3].traversal.inFrustum = true;
    expect(select(parent, inView)).toEqual(new Set([parent]));
    children[3].internal.loadingState = 4;
    expect(select(parent, inView)).toEqual(new Set(children));
  });

  it("progresses independently within nested branches", () => {
    const root = mesh(null, 64);
    const a = mesh(root, 8);
    const b = mesh(root, 8);
    root.children = [a, b];
    const ready = quartet(a).children;
    const streaming = quartet(b).children;
    streaming[0].internal.loadingState = 2;
    expect(select(root, inView)).toEqual(new Set([...ready, b]));
    streaming[0].internal.loadingState = 4;
    expect(select(root, inView)).toEqual(new Set([...ready, ...streaming]));
  });

  it("respects the target while keeping ADD parents alongside finer children", () => {
    const { parent, children } = quartet(mesh(null, 1));
    expect(select(parent, inView)).toEqual(new Set([parent]));
    parent.traversal.error = 64;
    parent.refine = "ADD";
    expect(select(parent, inView)).toEqual(new Set([parent, ...children]));
  });

  it("traverses unloaded unconditional content even below the requested target", () => {
    const { parent, children } = quartet(mesh(null, 16));
    const route = children[0];
    route.traversal.error = 0;
    route.traversal.unconditionallyRefine = true;
    route.internal.loadingState = 0;
    const deeper = quartet(route).children;
    expect(select(parent, inView)).toEqual(
      new Set([...deeper, ...children.slice(1)])
    );
  });

  it("distinguishes proven empty branches from unknown external metadata", () => {
    const { parent, children } = quartet(mesh(null, 16));
    const empty = children[0];
    empty.internal.hasContent = false;
    empty.internal.hasRenderableContent = false;
    empty.internal.loadingState = 0;
    expect(select(parent, inView)).toEqual(new Set(children.slice(1)));
    expect(hasMeshRefinementContentInView(empty, inView)).toBe(false);
    empty.internal.hasContent = true;
    empty.internal.hasUnrenderableContent = true;
    expect(select(parent, inView)).toEqual(new Set([parent]));
    expect(hasMeshRefinementContentInView(empty, inView)).toBe(true);
  });

  it("routes through external metadata without waiting for unrelated offscreen content", () => {
    const root = mesh(null, 64);
    const metadata = mesh(root, 64);
    metadata.internal.hasRenderableContent = false;
    metadata.internal.hasUnrenderableContent = true;
    const local = mesh(metadata, 0.5);
    metadata.children = [local];
    const outside = mesh(root, 64);
    outside.traversal.inFrustum = false;
    outside.internal.loadingState = 2;
    root.children = [metadata, outside];
    expect(select(root, inView)).toEqual(new Set([local]));
    outside.traversal.inFrustum = true;
    expect(select(root, inView)).toEqual(new Set([root]));
  });
});
