import { describe, expect, it, vi } from "vitest";
import { mesh, quartet } from "./mesh-tile-test-fixtures";
import { selectMeshReceiverPlan } from "./mesh-tile-selection";
import { retainMeshDetailFrontier } from "./mesh-tile-retention";
import {
  selectShadowCasterPlan,
  selectShadowReadyReceivers,
} from "./mesh-shadow-publication";

describe("shadow receiver publication", () => {
  it("withholds initial receivers until coarse caster coverage is drawable", () => {
    const receiver = mesh();
    const ready = vi.fn(() => false);
    let plan = selectShadowReadyReceivers(
      receiver,
      new Set([receiver]),
      new Set(),
      () => true,
      ready
    );
    expect([...plan.receivers]).toEqual([]);
    expect([...plan.pending]).toEqual([receiver]);
    ready.mockReturnValue(true);
    plan = selectShadowReadyReceivers(
      receiver,
      new Set([receiver]),
      new Set(),
      () => true,
      ready
    );
    expect([...plan.receivers]).toEqual([receiver]);
    expect(plan.pending.size).toBe(0);
  });
  it("keeps a receiver parent alone until its relevant children are ready", () => {
    const parent = mesh(),
      first = mesh(parent),
      second = mesh(parent),
      outside = mesh(parent);
    parent.children = [first, second, outside];
    const visible = (tile: typeof parent) => tile !== outside;
    const proposed = new Set([first, second]);
    const previous = new Set([parent]);
    let plan = selectShadowReadyReceivers(
      parent,
      proposed,
      previous,
      visible,
      (tile) => tile === first
    );
    expect(plan.receivers).toEqual(new Set([parent]));
    expect(plan.pending).toEqual(new Set([second]));
    plan = selectShadowReadyReceivers(
      parent,
      proposed,
      plan.receivers,
      visible,
      () => true
    );
    expect(plan.receivers).toEqual(proposed);
    expect(plan.pending.size).toBe(0);
  });
  it("never replaces visible receiver detail with a newly eligible coarse parent", () => {
    const parent = mesh(),
      child = mesh(parent);
    parent.children = [child];
    expect(
      selectShadowReadyReceivers(
        parent,
        new Set([parent]),
        new Set([child]),
        () => true,
        () => true
      ).receivers
    ).toEqual(new Set([child]));
  });
  it("does not hide published receivers when independent caster detail is still improving", () => {
    const receiver = mesh(),
      previous = new Set([receiver]),
      ready = vi.fn(() => false);
    expect(
      selectShadowReadyReceivers(
        receiver,
        previous,
        previous,
        () => true,
        ready
      ).receivers
    ).toEqual(previous);
    expect(ready).not.toHaveBeenCalled();
    expect(previous.size).toBe(1);
  });
});

describe("resolved empty receiver regions", () => {
  it("releases a conservative receiver only after topology proves its observer region empty", () => {
    const root = mesh(null, 100),
      parent = mesh(root, 11),
      stable = mesh(root, 1),
      metadata = mesh(parent, 11),
      caster = mesh(metadata, 4);
    root.internal.hasRenderableContent = false;
    root.children = [parent, stable];
    parent.children = [metadata];
    metadata.internal.hasRenderableContent = false;
    metadata.internal.hasUnrenderableContent = true;
    metadata.internal.loadingState = 0;
    const previous = new Set([parent, stable]);
    const inView = (tile: typeof parent) => tile !== caster;
    const errorPixels = (tile: typeof parent) => tile.traversal.error;
    const receivers = () =>
      retainMeshDetailFrontier({
        previous,
        proposed: selectMeshReceiverPlan(
          root,
          6,
          Infinity,
          inView,
          errorPixels,
          undefined,
          new Set(),
          {
            published: previous,
            allowCoarseBootstrap: true,
            releaseEmptyReplacementRegions: true,
          }
        ).tiles,
        requestedError: 6,
        inView,
        errorPixels,
      });

    // Neither unfinished JSON nor loaded JSON without known children proves
    // empty space. Retention must preserve the original colour cut in both.
    expect(receivers()).toEqual(previous);
    metadata.internal.loadingState = 4;
    expect(receivers()).toEqual(previous);
    metadata.children = [caster];
    const proposedReceivers = receivers();
    expect(proposedReceivers).toEqual(new Set([stable]));

    // The released receiver lets the light refine the same REPLACE family.
    // Receiver readiness must not resurrect its conservative ancestor.
    const casters = selectShadowCasterPlan(
      new Set([parent, stable, caster]),
      previous,
      proposedReceivers,
      inView,
      () => true,
      errorPixels,
      6
    );
    expect(casters).toEqual(new Set([stable, caster]));
    const ready = selectShadowReadyReceivers(
      root,
      new Set([...casters].filter(inView)),
      previous,
      inView,
      () => true
    );
    expect(ready.receivers).toEqual(new Set([stable]));
    expect(ready.pending.size).toBe(0);
    expect(previous).toEqual(new Set([parent, stable]));
  });

  it("keeps additive parent content when all resolved children miss the observer", () => {
    const parent = mesh(null, 11),
      child = mesh(parent, 4);
    parent.refine = "ADD";
    parent.children = [child];
    const previous = new Set([parent]);
    expect(
      selectMeshReceiverPlan(
        parent,
        6,
        Infinity,
        (tile) => tile !== child,
        (tile) => tile.traversal.error,
        undefined,
        new Set(),
        { published: previous, releaseEmptyReplacementRegions: true }
      ).tiles
    ).toEqual(previous);
  });
});

describe("caster LOD ownership", () => {
  it("reuses the exact viewport cut instead of independently selecting finer visible payloads", () => {
    const parent = mesh(null, 16),
      child = mesh(parent, 1);
    parent.children = [child];
    const receiverError = vi.fn(() => 100);
    const cut = selectShadowCasterPlan(
      new Set([parent, child]),
      new Set(),
      new Set([parent]),
      () => true,
      () => true,
      receiverError,
      1
    );
    expect(cut).toEqual(new Set([parent]));
    expect(receiverError).not.toHaveBeenCalled();
  });
  it("keeps finer shared casters when one receiver corridor drops its finer error demand", () => {
    const parent = mesh(null, 16),
      a = mesh(parent, 1),
      b = mesh(parent, 1);
    parent.children = [a, b];
    const available = new Set([parent, a, b]);
    const needed = (t: typeof parent) => t !== b;
    const first = selectShadowCasterPlan(
      available,
      new Set(),
      new Set(),
      () => false,
      needed,
      (t) => t.traversal.error,
      1
    );
    expect(first).toEqual(new Set([a]));
    const relaxed = selectShadowCasterPlan(
      available,
      first,
      new Set(),
      () => false,
      needed,
      () => 0.1,
      6
    );
    expect(relaxed).toEqual(first);
  });
});

describe("exclusive replacement caster depth", () => {
  const plan = (
    available: Set<ReturnType<typeof mesh>>,
    previous = new Set<ReturnType<typeof mesh>>(),
    receivers = new Set<ReturnType<typeof mesh>>(),
    needed = (_tile: ReturnType<typeof mesh>) => true
  ) =>
    selectShadowCasterPlan(
      available,
      previous,
      receivers,
      (tile) => receivers.has(tile),
      needed,
      (tile) => tile.traversal.error,
      1
    );

  it.each([0, 5])(
    "holds a parent alone while a relevant sibling is not drawable (state %i)",
    (state) => {
      const {
        parent,
        children: [a, b, outside, empty],
      } = quartet(mesh(null, 16));
      b.internal.loadingState = state;
      outside.internal.loadingState = 0;
      empty.internal.hasContent = false;
      empty.internal.hasRenderableContent = false;
      const available = new Set([parent, a]);
      const previous = new Set([parent]);
      const needed = (tile: typeof parent) => tile !== outside;
      // A ready colour receiver must not bypass the caster family handover.
      expect(plan(available, previous, new Set([a]), needed)).toEqual(previous);
      b.internal.loadingState = 4;
      available.add(b);
      expect(plan(available, previous, new Set([a]), needed)).toEqual(
        new Set([a, b])
      );
    }
  );

  it("keeps ready sibling branches independent and permits a mixed-depth complete cut", () => {
    const {
      parent,
      children: [a, b, c, d],
    } = quartet(mesh(null, 16));
    const [a1, a2] = [mesh(a), mesh(a)];
    a.children = [a1, a2];
    a.traversal.error = 8;
    a2.internal.loadingState = 0;
    const first = plan(new Set([parent, a, b, c, d, a1]), new Set([parent]));
    expect(first).toEqual(new Set([a, b, c, d]));
    a2.internal.loadingState = 4;
    const second = plan(new Set([...first, parent, a1, a2]), first);
    expect(second).toEqual(new Set([a1, a2, b, c, d]));
  });

  it("keeps live fine casters when a corridor expands into an unloaded sibling", () => {
    const parent = mesh(null, 16),
      a = mesh(parent),
      b = mesh(parent);
    parent.children = [a, b];
    b.internal.loadingState = 0;
    const previous = new Set([a]);
    expect(plan(new Set([parent, a]), previous)).toEqual(previous);
    b.internal.loadingState = 4;
    expect(plan(new Set([parent, a, b]), previous)).toEqual(new Set([a, b]));
  });

  it("waits for unknown external topology and then ignores its outside descendants", () => {
    const parent = mesh(null, 16),
      a = mesh(parent),
      metadata = mesh(parent);
    parent.children = [a, metadata];
    metadata.internal.hasRenderableContent = false;
    metadata.internal.hasUnrenderableContent = true;
    metadata.internal.loadingState = 0;
    const available = new Set([parent, a]);
    expect(plan(available)).toEqual(new Set([parent]));
    const outside = mesh(metadata);
    metadata.children = [outside];
    metadata.internal.loadingState = 4;
    expect(
      plan(available, new Set([parent]), new Set(), (t) => t !== outside)
    ).toEqual(new Set([a]));
  });

  it("preserves additive content instead of treating it as replacement overlap", () => {
    const parent = mesh(null, 16),
      child = mesh(parent);
    parent.children = [child];
    parent.refine = "ADD";
    expect(plan(new Set([parent, child]))).toEqual(new Set([parent, child]));
  });
});
