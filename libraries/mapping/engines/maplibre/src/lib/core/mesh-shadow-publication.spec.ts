import { describe, expect, it, vi } from "vitest";
import { mesh } from "./mesh-tile-test-fixtures";
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
  it("keeps a fallback with ready children and replaces it only after demanded coverage is ready", () => {
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
    expect(plan.receivers).toEqual(new Set([parent, first]));
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
