import { describe, expect, it } from "vitest";
import {
  shouldDeferMeshRefinement,
  isPublishedMeshRefinementLevel,
} from "./mesh-tile-refinement";
import { mesh } from "./mesh-tile-test-fixtures";

describe("mesh refinement admission", () => {
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

  it("evaluates local ancestor readiness independently of the traversal family barrier", () => {
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
