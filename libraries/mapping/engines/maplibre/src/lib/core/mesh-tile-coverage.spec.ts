import type { Tile } from "3d-tiles-renderer/core";
import { describe, expect, it } from "vitest";
import {
  getReadyMeshRegionCut,
  hasLoadedExtentFloorAncestor,
  isMeshCoverageRemovalSafe,
} from "./mesh-tile-coverage";
import { mesh, quartet } from "./mesh-tile-test-fixtures";

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
