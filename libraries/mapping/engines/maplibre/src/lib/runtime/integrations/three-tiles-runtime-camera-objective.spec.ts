import { describe, expect, it, vi } from "vitest";
import { Box3, Group, OrthographicCamera, Vector3 } from "three";
import { createMeshCameraObjectives } from "./three-tiles-runtime-camera-objective";
import { createThreeTilesRetryController } from "./three-tiles-retry-controller";
import {
  createTileCameraDemand,
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
  TILE_MAIN_OBSERVER_ID,
} from "../../core/tile-camera-demand";
import type { RuntimeTile } from "./three-tiles-runtime-types";
import type { ThreeTilesRuntimeState } from "./three-tiles-runtime-context";

const fixture = () => {
  const camera = new OrthographicCamera(-10, 10, 10, -10, 1, 100);
  const views = [TILE_MAIN_OBSERVER_ID, "second"].map((id) => ({
    id,
    camera,
    viewport: [200, 200] as const,
    errorTargetPixels: 2,
    role: TILE_CAMERA_ROLE.RECEIVER,
  }));
  const state = {
    tileCameraDemand: createTileCameraDemand(snapshotTileCameraViews(views)),
    tileRetries: createThreeTilesRetryController(() => null, vi.fn()),
    tiles: { group: new Group(), visibleTiles: new Set(), frameCount: 1 },
    displayedMeshFrontier: new Set(),
    committedMeshCasterFrontier: new Set(),
    shadowReceiverMask: null,
    meshContentRevision: 0,
    requestedErrorTarget: 2,
    memoryErrorTarget: 2,
    effectiveErrorTarget: 2,
  } as unknown as ThreeTilesRuntimeState;
  const tile = (
    error: number,
    parent: RuntimeTile | null = null,
    x1 = -5,
    x2 = 5
  ): RuntimeTile => {
    const box = new Box3(new Vector3(x1, -5, -21), new Vector3(x2, 5, -20));
    const result = {
      geometricError: error,
      parent,
      children: [],
      refine: "REPLACE",
      internal: { hasRenderableContent: true, loadingState: 4 },
      traversal: {},
      engineData: { boundingVolume: { getAABB: (out: Box3) => out.copy(box) } },
    } as unknown as RuntimeTile;
    parent?.children.push(result);
    return result;
  };
  return { state, views, tile, objective: createMeshCameraObjectives(state) };
};

describe("mesh camera objectives", () => {
  it("loads the first drawable coverage before descending to final detail", () => {
    const f = fixture();
    const coarse = f.tile(20);
    const child = f.tile(10, coarse);
    coarse.internal!.loadingState = 0;
    child.internal!.loadingState = 0;
    const missing = f.objective.demand(coarse, true);
    expect(missing.errorRatio).toBe(100);
    expect(missing.refinementErrorRatio).toBe(1);
    expect(f.objective.objective(coarse).priority).toBe(4);
    coarse.internal!.loadingState = 4;
    f.state.displayedMeshFrontier = new Set([coarse]);
    f.state.tiles!.visibleTiles = new Set([coarse]);
    const published = f.objective.demand(coarse, true);
    expect(published.errorRatio).toBe(missing.errorRatio);
    expect(published.refinementErrorRatio).toBeGreaterThan(1);
    expect(
      f.objective.demand(child, true).refinementErrorRatio
    ).toBeLessThanOrEqual(1);
  });

  it("traverses healthy replacement children after coarse retries are exhausted", () => {
    const f = fixture();
    const coarse = f.tile(0.1);
    const child = f.tile(0.05, coarse);
    const uri = "https://example.com/mesh/coarse.b3dm";
    coarse.content = { uri };
    coarse.internal!.loadingState = 0;
    child.internal!.loadingState = 0;
    const retries = f.state.tileRetries;
    try {
      expect(retries.handleFailure(coarse, uri, new Error("status 503"))).toBe(
        "scheduled"
      );
      expect(retries.isBlocked(coarse)).toBe(true);
      expect(retries.isExhausted(coarse)).toBe(false);
      expect(
        f.objective.demand(coarse, true).refinementErrorRatio
      ).toBeLessThanOrEqual(1);

      retries.handleSuccess(coarse, uri);
      expect(retries.handleFailure(coarse, uri, new Error("status 404"))).toBe(
        "exhausted"
      );
      // Cache removal leaves the failed coarse payload UNLOADED. Its error
      // already meets the target, but missing coverage still needs child traversal.
      const repair = f.objective.demand(coarse, true);
      expect(repair.errorRatio).toBeLessThan(1);
      expect(repair.refinementErrorRatio).toBeGreaterThan(1);
      expect(f.objective.demand(child, true)).toMatchObject({
        required: true,
        receiver: true,
      });
      expect(
        f.objective.demand(child, true).refinementErrorRatio
      ).toBeLessThanOrEqual(1);
      expect(f.objective.objective(child).priority).toBe(4);

      coarse.refine = "ADD";
      expect(
        f.objective.demand(coarse, true).refinementErrorRatio
      ).toBeLessThanOrEqual(1);
    } finally {
      retries.dispose();
    }
  });

  it("does not let missing prefetch coverage stop active-camera refinement", () => {
    const f = fixture();
    f.state.tileCameraDemand = createTileCameraDemand(
      snapshotTileCameraViews([f.views[0], { ...f.views[1], priority: -1 }])
    );
    const coarse = f.tile(20);
    f.state.displayedMeshFrontier.add(coarse);
    const active = f.objective.demand(coarse, true);
    expect(active.refinementErrorRatio).toBeGreaterThan(1);
    expect(f.objective.objective(coarse).priority).toBe(-Infinity);
  });

  it("traverses metadata and keeps published finer descendants instead of covering them", () => {
    const f = fixture();
    const metadata = f.tile(0);
    metadata.internal!.hasRenderableContent = false;
    metadata.internal!.hasUnrenderableContent = true;
    const route = f.objective.demand(metadata, true);
    expect(route.errorRatio).toBe(0);
    expect(route.refinementErrorRatio).toBeGreaterThan(1);
    const parent = f.tile(20);
    const ready = f.tile(1, parent, -5, 0);
    const missing = f.tile(1, parent, 0, 5);
    missing.internal!.loadingState = 0;
    f.state.displayedMeshFrontier = new Set([ready]);
    f.state.tiles!.visibleTiles = new Set([ready]);
    expect(
      f.objective.demand(parent, true).refinementErrorRatio
    ).toBeGreaterThan(1);
    expect(f.objective.demand(missing, true).refinementErrorRatio).toBe(1);
    missing.internal!.loadingState = 4;
    f.state.displayedMeshFrontier = new Set([ready, missing]);
    f.state.tiles!.visibleTiles = new Set([ready, missing]);
    expect(
      f.objective.demand(parent, true).refinementErrorRatio
    ).toBeGreaterThan(1);
    expect(f.objective.objective(parent).priority).toBe(-Infinity);
  });

  it("loads an additive parent's missing own content without replacing its children", () => {
    const f = fixture();
    const parent = f.tile(20);
    parent.refine = "ADD";
    parent.internal!.loadingState = 0;
    const child = f.tile(1, parent);
    f.state.displayedMeshFrontier.add(child);
    f.state.tiles!.visibleTiles.add(child);
    expect(f.objective.demand(parent, true).refinementErrorRatio).toBe(1);
  });

  it("resamples mutable published cuts for an explicit scoring pass", () => {
    const f = fixture();
    const parent = f.tile(2);
    const child = f.tile(1, parent);
    expect(f.objective.objective(child).priority).toBe(4);
    f.state.displayedMeshFrontier.add(parent);
    f.state.tiles!.visibleTiles.add(parent);
    f.objective.reset();
    expect(f.objective.objective(child).priority).toBe(1);
  });

  it("refreshes benefit when final targets change within the same camera snapshot", () => {
    const f = fixture();
    const parent = f.tile(2);
    const child = f.tile(1, parent);
    f.state.displayedMeshFrontier.add(parent);
    f.state.tiles!.visibleTiles.add(parent);
    expect(f.objective.objective(child).benefit).toBeCloseTo(5);
    f.state.requestedErrorTarget = 15;
    // Only main changed; the independently configured second camera stays at 2px.
    expect(f.objective.objective(child).benefit).toBeCloseTo(3.75);
  });

  it("projects area lazily once for repeated request ranking", () => {
    const f = fixture();
    const parent = f.tile(2);
    const child = f.tile(1, parent);
    f.state.displayedMeshFrontier.add(parent);
    f.state.tiles!.visibleTiles.add(parent);
    const evaluations = vi.spyOn(f.state.tileCameraDemand, "evaluate");
    expect(f.objective.demand(child, true).required).toBe(true);
    expect(evaluations).toHaveBeenCalledTimes(1);
    expect(evaluations.mock.calls[0][3]).toBe(false);
    expect(f.objective.objective(child).benefit).toBeGreaterThan(0);
    expect(evaluations).toHaveBeenCalledTimes(2);
    expect(evaluations.mock.calls[1][3]).toBe(true);
    f.objective.objective(child);
    f.objective.demand(child, true);
    expect(evaluations).toHaveBeenCalledTimes(2);
  });

  it("reuses exact projection through rescoring and content arrivals", () => {
    const f = fixture();
    const parent = f.tile(2);
    const child = f.tile(1, parent);
    f.state.displayedMeshFrontier.add(parent);
    f.state.tiles!.visibleTiles.add(parent);
    const evaluations = vi.spyOn(f.state.tileCameraDemand, "evaluate");
    const boundsReads = vi.spyOn(child.engineData!.boundingVolume!, "getAABB");
    expect(f.objective.objective(child).benefit).toBeCloseTo(5);
    f.objective.reset();
    expect(f.objective.objective(child).benefit).toBeCloseTo(5);
    expect(boundsReads).toHaveBeenCalledTimes(1);
    f.state.meshContentRevision++;
    expect(f.objective.objective(child).benefit).toBeCloseTo(5);
    expect(boundsReads).toHaveBeenCalledTimes(2);
    expect(evaluations).toHaveBeenCalledTimes(1);
    child.engineData!.boundingVolume!.getAABB = (out: Box3) =>
      out.set(new Vector3(100, 0, -20), new Vector3(101, 1, -19));
    f.state.meshContentRevision++;
    expect(f.objective.objective(child).priority).toBe(-Infinity);
    expect(evaluations).toHaveBeenCalledTimes(2);
  });

  it("keeps excluded-observer demand empty without affecting subsequent all-camera demand", () => {
    const f = fixture();
    f.state.tileCameraDemand = createTileCameraDemand(
      snapshotTileCameraViews([f.views[0]])
    );
    const candidate = f.tile(1);
    expect(f.objective.demand(candidate, false)).toEqual({
      required: false,
      receiver: false,
      errorRatio: 0,
      refinementErrorRatio: 0,
      priority: -Infinity,
    });
    expect(f.objective.demand(candidate, true)).toMatchObject({
      required: true,
      receiver: true,
      priority: 1,
    });
  });

  it("invalidates cached bounds on content changes and placement on the next frame", () => {
    const f = fixture();
    const candidate = f.tile(1);
    expect(f.objective.demand(candidate, true).required).toBe(true);
    f.state.tiles!.group.position.x = 100;
    f.state.tiles!.group.updateMatrixWorld(true);
    f.state.tiles!.frameCount++;
    expect(f.objective.demand(candidate, true).required).toBe(false);
    f.state.tiles!.group.position.x = 0;
    f.state.tiles!.group.updateMatrixWorld(true);
    f.state.tiles!.frameCount++;
    expect(f.objective.demand(candidate, true).required).toBe(true);
    candidate.engineData!.boundingVolume!.getAABB = (out: Box3) =>
      out.set(new Vector3(100, 0, -20), new Vector3(101, 1, -19));
    f.state.meshContentRevision++;
    expect(f.objective.demand(candidate, true).required).toBe(false);
  });

  it("does not use an additive parent's content as replacement coverage", () => {
    const f = fixture();
    const parent = f.tile(2);
    parent.refine = "ADD";
    const child = f.tile(1, parent);
    f.state.displayedMeshFrontier.add(parent);
    f.state.tiles!.visibleTiles.add(parent);
    expect(f.objective.objective(child).priority).toBe(4);
  });

  it("keeps unknown child bounds unresolved in an otherwise covered subtree", () => {
    const f = fixture();
    const parent = f.tile(2);
    const loaded = f.tile(1, parent);
    const unknown = f.tile(1, parent);
    unknown.internal!.loadingState = 0;
    Reflect.deleteProperty(unknown, "engineData");
    f.state.displayedMeshFrontier.add(loaded);
    f.state.tiles!.visibleTiles.add(loaded);
    expect(f.objective.objective(parent).priority).toBe(4);
  });

  it("uses the outermost shared replacement family independent of camera order", () => {
    const f = fixture();
    const outer = f.tile(4);
    const inner = f.tile(2, outer);
    const child = f.tile(1, inner);
    f.state.displayedMeshFrontier.add(outer);
    f.state.tiles!.visibleTiles.add(inner);
    expect(f.objective.objective(child).group).toBe(outer);
    f.state.tileCameraDemand = createTileCameraDemand(
      snapshotTileCameraViews([...f.views].reverse())
    );
    expect(f.objective.objective(child).group).toBe(outer);
  });

  it("sums paired improvements over the clipped share of each viewport", () => {
    const f = fixture();
    const parent = f.tile(2);
    const child = f.tile(1, parent, 5, 15);
    f.state.displayedMeshFrontier.add(parent);
    f.state.tiles!.visibleTiles.add(parent);
    // Only x=5..10 and y=-5..5 project inside each 20x20 viewport.
    const result = f.objective.objective(child);
    expect(result.priority).toBe(1);
    expect(result.visibleAreaFraction).toBeCloseTo((2 * 50) / 400);
    expect(result.benefit).toBeCloseTo((2 * (20 - 10) * 50) / 400);
  });

  it("distinguishes main fill, second-camera fill and equal refinement", () => {
    const f = fixture();
    const parent = f.tile(2);
    const child = f.tile(1, parent);
    expect(f.objective.objective(child).priority).toBe(4);
    f.state.displayedMeshFrontier = new Set([parent]);
    expect(f.objective.objective(child).priority).toBe(3);
    f.state.tiles!.visibleTiles.add(parent);
    f.state.tiles!.frameCount++;
    expect(f.objective.objective(child).priority).toBe(1);
  });

  it("advances each published region through its own power-of-two target", () => {
    const f = fixture();
    const parent = f.tile(2.4);
    const child = f.tile(1.2, parent);
    f.state.displayedMeshFrontier.add(parent);
    f.state.tiles!.visibleTiles.add(parent);
    const before = f.objective.demand(child, true);
    expect(before.errorRatio).toBeCloseTo(6);
    expect(before.refinementErrorRatio).toBeCloseTo(12 / 16);
    f.state.displayedMeshFrontier = new Set([child]);
    f.state.tiles!.visibleTiles = new Set([child]);
    f.state.tiles!.frameCount++;
    const after = f.objective.demand(child, true);
    expect(after.errorRatio).toBe(before.errorRatio);
    expect(after.refinementErrorRatio).toBeCloseTo(12 / 8);
  });

  it("does not turn a fully covered ancestor into a new gap request", () => {
    const f = fixture();
    const parent = f.tile(2);
    const child = f.tile(1, parent);
    f.state.displayedMeshFrontier.add(child);
    f.state.tiles!.visibleTiles.add(child);
    expect(f.objective.objective(parent).priority).toBe(-Infinity);
  });

  it("uses the published observer fallback and normalizes footprint by viewport area", () => {
    const f = fixture();
    f.state.tileCameraDemand = createTileCameraDemand(
      snapshotTileCameraViews([f.views[0]])
    );
    const parent = f.tile(2);
    const child = f.tile(1, parent);
    f.state.displayedMeshFrontier.add(parent);
    f.state.tiles!.visibleTiles.add(parent);
    const observer = f.objective.objective(child);
    expect(observer.priority).toBe(1);
    expect(observer.visibleAreaFraction).toBeCloseTo(0.25);
    expect(observer.benefit).toBeCloseTo(2.5);
    f.state.tileCameraDemand = createTileCameraDemand(
      snapshotTileCameraViews([{ ...f.views[0], viewport: [400, 400] }])
    );
    expect(f.objective.objective(child).visibleAreaFraction).toBeCloseTo(
      observer.visibleAreaFraction
    );
  });
});
