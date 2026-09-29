import { describe, expect, it } from "vitest";
import {
  canCoarsenMeshCut,
  collectResidentAncestors,
  getRetainedMeshAncestors,
} from "./mesh-tile-retention";
import { mesh, quartet } from "./mesh-tile-test-fixtures";

describe("retained mesh ancestry", () => {
  it("uses current camera SSE, never stale traversal error, for a complete cut", () => {
    const { parent, children } = quartet(mesh(null, 0.25));
    const previous = new Set(children);
    expect(canCoarsenMeshCut(parent, previous, 2, () => 12)).toBe(false);
    parent.traversal.error = 64;
    expect(canCoarsenMeshCut(parent, previous, 2, () => 1.9)).toBe(true);
    expect(canCoarsenMeshCut(parent, previous, 2, () => NaN)).toBe(false);
  });

  it("supports complete cuts across skipped generations", () => {
    const { parent, children } = quartet();
    const fine = new Set(children.flatMap((child) => quartet(child).children));
    expect(canCoarsenMeshCut(parent, fine, 1)).toBe(true);
    fine.delete([...fine][0]);
    expect(canCoarsenMeshCut(parent, fine, 1)).toBe(false);
    parent.refine = "ADD";
    expect(canCoarsenMeshCut(parent, new Set(children), 1)).toBe(false);
  });

  it.each([-1, 0, 1, 2, 3])(
    "does not count loading state %s as ready coverage",
    (state) => {
      const { parent, children } = quartet();
      children[0].internal.loadingState = state;
      expect(canCoarsenMeshCut(parent, new Set(children), 1)).toBe(false);
    }
  );

  it("retains visible ancestry during motion and releases eligible cuts at rest", () => {
    const { parent, children } = quartet(mesh(null, 1));
    const previous = new Set(children);
    const error = () => 1;
    expect(
      getRetainedMeshAncestors(previous, 4, () => true, error, false)
    ).toEqual(new Set([parent]));
    expect(getRetainedMeshAncestors(previous, 4, () => true, error)).toEqual(
      new Set()
    );
    expect(
      getRetainedMeshAncestors(previous, 4, () => false, error, false)
    ).toEqual(new Set());
  });

  it("keeps resident ancestors below the extent floor without including the floor", () => {
    const root = mesh();
    root.geometricError = 16;
    const parent = mesh(root);
    parent.geometricError = 4;
    const children = quartet(parent).children;
    expect(collectResidentAncestors(new Set(children), 16)).toEqual(
      new Set([parent])
    );
  });
});
