import type { Tile } from "3d-tiles-renderer/core";
import { describe, expect, it } from "vitest";
import {
  isMeshCoveredByLoadedChildren,
  canCoarsenMeshQuartet,
  retainMeshDetailFrontier,
  shouldDeferMeshRefinement,
  refineLoadedMeshFrontier,
  getReadyMeshRegionCut,
  advanceMeshCorridorFrontier,
  collectLoadedMeshReceiverCandidates,
  selectMeshReceiverCut,
  isMeshRefinementBeyondStage,
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
  it("retains a shared chimney parent until its offscreen caster child is loaded", () => {
    const { parent, children } = quartet(mesh(null, 16));
    const [receiver, chimney, unrelatedA, unrelatedB] = children;
    chimney.traversal.inFrustum = false;
    chimney.internal.loadingState = 2;
    const demand = (tile: Tile) => tile !== unrelatedA && tile !== unrelatedB;
    const select = () => collectLoadedMeshReceiverCandidates(
      parent, 1, Infinity, demand, (tile) => tile.traversal.error
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
        root, 1, Infinity, () => true, (tile) => tile.traversal.error
      );
      const published = retain([a, b], [...proposed]);
      expect(published).toEqual(new Set([
        ...readyFamily,
        ...(mask === 15 ? streamingFamily : [b]),
      ]));
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
