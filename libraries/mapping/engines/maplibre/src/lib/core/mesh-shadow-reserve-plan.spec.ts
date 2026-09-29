import { describe, expect, it } from "vitest";
import { mesh, quartet } from "./mesh-tile-test-fixtures";
import { isLoadedMesh } from "./mesh-tile-coverage";
import { planMeshShadowReserveStep } from "./mesh-shadow-reserve-plan";

describe("complete shadow reserve handover", () => {
  it("requires complete receiver and caster families before a ready reserve", () => {
    const receiver = quartet(mesh(null, 8));
    const caster = quartet(mesh(null, 8));
    // Known bounds can reject this coarse caster without downloading its mesh.
    caster.parent.internal.loadingState = 0;
    const roots = [receiver.parent, caster.parent];
    const refined = new Set([receiver.parent]);
    const demand = () => (tile: typeof caster.parent) =>
      tile === caster.parent ? 1 : 0;
    const first = planMeshShadowReserveStep(
      roots,
      refined,
      isLoadedMesh,
      demand
    );
    expect(first.ready).toBe(false);
    expect(first.support.size).toBe(0);
    expect(first.shadowReady).toBe(false);
    expect(first.advance).toBe(true);
    expect(first.refined.has(caster.parent)).toBe(true);
    expect(refined).toEqual(new Set([receiver.parent]));

    caster.children[3].internal.loadingState = 0;
    const waiting = planMeshShadowReserveStep(
      roots,
      first.refined,
      isLoadedMesh,
      demand
    );
    expect(waiting.ready).toBe(false);
    expect(waiting.shadowReady).toBe(false);
    expect(waiting.support.has(caster.children[3])).toBe(true);
    caster.children[3].internal.loadingState = 4;
    const complete = planMeshShadowReserveStep(
      roots,
      first.refined,
      isLoadedMesh,
      demand
    );
    expect(complete.shadowReady).toBe(true);
    expect(complete.frontier).toEqual(
      new Set([...receiver.children, ...caster.children])
    );
    expect(complete.frontier.has(receiver.parent)).toBe(false);
    expect(complete.frontier.has(caster.parent)).toBe(false);
  });

  it("waits for colour readiness and unopened metadata outside the viewport", () => {
    const parent = mesh(null, 8);
    const colourPending = planMeshShadowReserveStep(
      [parent],
      new Set(),
      () => false,
      () => () => 0
    );
    expect(colourPending.ready).toBe(false);
    expect(colourPending.support.has(parent)).toBe(true);
    parent.internal.hasRenderableContent = false;
    parent.internal.hasUnrenderableContent = true;
    parent.internal.loadingState = 0;
    const metadataPending = planMeshShadowReserveStep(
      [parent],
      new Set(),
      () => true,
      () => () => 0
    );
    expect(metadataPending.totalKnown).toBe(false);
    expect(metadataPending.shadowReady).toBe(false);
    // Upstream has not assigned parent/internal/traversal on unopened children.
    const unknownChild = { children: [] } as unknown as typeof parent;
    parent.internal.loadingState = 4;
    parent.children = [unknownChild];
    const unprepared = planMeshShadowReserveStep(
      [parent],
      new Set(),
      isLoadedMesh,
      () => () => 0
    );
    expect(unprepared.ready).toBe(false);
    expect(unprepared.unpreparedParents).toEqual(new Set([parent]));
  });

  it("reports an unsatisfiable leaf without pretending coverage is shadow-ready", () => {
    const leaf = mesh(null, 8);
    const result = planMeshShadowReserveStep(
      [leaf],
      new Set(),
      isLoadedMesh,
      () => () => 3
    );
    expect(result.ready).toBe(false);
    expect(result.shadowReady).toBe(false);
    expect(result.advance).toBe(false);
    expect(result.blocked).toEqual(new Set([leaf]));
  });
});
