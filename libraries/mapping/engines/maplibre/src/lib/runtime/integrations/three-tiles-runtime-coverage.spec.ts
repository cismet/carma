import type { Tile } from "3d-tiles-renderer/core";
import { describe, expect, it } from "vitest";

import {
  THREE_TILES_COVERAGE_EVIDENCE,
  estimateTileTargetSteps,
  collectTilesetFloorRoots,
  createThreeTilesRuntimeCoverageDiagnostics,
  getTilesetFloorContentRevision,
  type ThreeTilesRuntimeCoverageInput,
} from "./three-tiles-runtime-coverage";
import {
  FAILED_LOADING_STATE,
  LOADED_LOADING_STATE,
  UNLOADED_LOADING_STATE,
} from "./three-tiles-runtime-vendor";

describe("tile target step diagnostics", () => {
  const node = (error: number, children: Tile[] = [], content = true): Tile => {
    const result = {
      geometricError: error,
      children,
      refine: "REPLACE",
      internal: { hasRenderableContent: content },
    } as unknown as Tile;
    children.forEach((child) => {
      child.parent = result;
    });
    return result;
  };
  const read = (tile: Tile) => tile.geometricError;
  it("counts nonuniform known hierarchy, skipping metadata-only nodes", () => {
    const root = node(50, [node(3), node(15, [node(2)])]);
    expect(estimateTileTargetSteps(root, 4, read)).toEqual({
      minimum: 1,
      maximum: 2,
      estimated: false,
    });
    expect(
      estimateTileTargetSteps(node(50, [node(50, [node(3)], false)]), 4, read)
    ).toEqual({ minimum: 1, maximum: 1, estimated: false });
  });
  it("marks missing hierarchy and bounded audits as estimates", () => {
    expect(estimateTileTargetSteps(node(16), 4, read)).toEqual({
      minimum: 2,
      maximum: 2,
      estimated: true,
    });
    expect(
      estimateTileTargetSteps(node(16, [node(8, [node(4)])]), 4, read, {
        maxNodes: 1,
      })?.estimated
    ).toBe(true);
  });
  it("indicates excess detail only when an actual replaceable ancestor meets target", () => {
    const fine = node(1);
    node(8, [node(3, [fine])]);
    expect(estimateTileTargetSteps(fine, 4, read)).toEqual({
      minimum: -1,
      maximum: -1,
      estimated: false,
    });
    expect(estimateTileTargetSteps(node(1), 4, read)?.minimum).toBe(-0);
    fine.parent!.refine = "ADD";
    expect(estimateTileTargetSteps(fine, 4, read)?.minimum).toBe(-0);
  });
  it("uses tolerance and does not turn unknown errors into a target match", () => {
    expect(estimateTileTargetSteps(node(4.2), 4, read)?.maximum).toBe(-0);
    expect(estimateTileTargetSteps(node(8), 4, () => null)).toBeNull();
    expect(estimateTileTargetSteps(node(8), 0, read)).toBeNull();
  });
});

const tile = (
  loadingState: number,
  options: {
    renderable?: boolean;
    routing?: boolean;
    children?: Tile[];
  } = {}
): Tile =>
  ({
    internal: {
      loadingState,
      hasRenderableContent: options.renderable ?? false,
      hasUnrenderableContent: options.routing ?? false,
    },
    children: options.children ?? [],
  } as unknown as Tile);

const input = (
  floorRoots: readonly Tile[],
  overrides: Partial<ThreeTilesRuntimeCoverageInput> = {}
): ThreeTilesRuntimeCoverageInput => ({
  traversalRevision: 1,
  enabled: true,
  sourcePendingMetadata: false,
  floorArmed: true,
  visibleBaseReady: true,
  floorRoots,
  displayed: new Set(),
  pending: 0,
  queued: 0,
  downloading: 0,
  parsing: 0,
  requestedErrorTarget: 6,
  effectiveErrorTarget: 16,
  paused: false,
  cacheBytes: 10,
  ceilingBytes: 100,
  ...overrides,
});

describe("three tiles runtime coverage diagnostics", () => {
  it("keeps a loaded fallback at an uneven floor boundary", () => {
    const fineUnknown = { geometricError: 10 } as Tile;
    const coarseUnknown = { geometricError: 40 } as Tile;
    const parent = tile(LOADED_LOADING_STATE, {
      renderable: true,
      children: [fineUnknown, coarseUnknown],
    });
    parent.geometricError = 80;
    const roots = collectTilesetFloorRoots(parent, 20);
    expect(roots).toEqual([parent]);
    expect(
      createThreeTilesRuntimeCoverageDiagnostics().update(input(roots))
    ).toMatchObject({
      floorReady: true,
      uncoveredFallbackRoots: 0,
      cameraCoverageCertified: false,
    });
    parent.internal.loadingState = UNLOADED_LOADING_STATE;
    expect(
      createThreeTilesRuntimeCoverageDiagnostics().update(input(roots))
    ).toMatchObject({ floorReady: false, unknownFallbackRoots: 1 });
  });

  it("keeps an unknown sibling as uncovered floor evidence", () => {
    const west = tile(LOADED_LOADING_STATE, { renderable: true });
    west.geometricError = 40;
    const eastUnknown = { geometricError: 40 } as Tile;
    const root = tile(LOADED_LOADING_STATE, {
      routing: true,
      children: [west, eastUnknown],
    });
    root.geometricError = 100;
    const floorRoots = collectTilesetFloorRoots(root, 40);
    expect(floorRoots).toEqual([west, eastUnknown]);
    expect(
      createThreeTilesRuntimeCoverageDiagnostics().update(input(floorRoots))
    ).toMatchObject({
      evidence: THREE_TILES_COVERAGE_EVIDENCE.FLOOR_INCOMPLETE,
      floorReady: false,
      floorLoaded: 1,
      floorTotal: 2,
      unknownFallbackRoots: 1,
    });
  });

  it("changes the content revision when loading settles without a new frame", () => {
    const root = tile(UNLOADED_LOADING_STATE, { renderable: true });
    const before = getTilesetFloorContentRevision([root]);
    root.internal.loadingState = LOADED_LOADING_STATE;
    expect(getTilesetFloorContentRevision([root])).not.toBe(before);
  });

  it("reports a loaded fallback root as floor evidence, not camera certification", () => {
    const diagnostics = createThreeTilesRuntimeCoverageDiagnostics();
    const status = diagnostics.update(
      input([tile(LOADED_LOADING_STATE, { renderable: true })])
    );
    expect(status).toMatchObject({
      evidence: THREE_TILES_COVERAGE_EVIDENCE.FLOOR_CUT_COVERED,
      floorReady: true,
      cameraCoverageCertified: false,
      floorLoaded: 1,
      floorTotal: 1,
      uncoveredFallbackRoots: 0,
    });
    expect(diagnostics.getCoverageStatus()).toBe(status);
  });

  it("routes a failed fallback subtree to incomplete failure evidence", () => {
    const diagnostics = createThreeTilesRuntimeCoverageDiagnostics();
    const root = tile(LOADED_LOADING_STATE, {
      routing: true,
      children: [tile(FAILED_LOADING_STATE, { renderable: true })],
    });
    expect(diagnostics.update(input([root]))).toMatchObject({
      evidence: THREE_TILES_COVERAGE_EVIDENCE.FLOOR_INCOMPLETE,
      floorReady: false,
      failedFallbackRoots: 1,
      unknownFallbackRoots: 0,
      uncoveredFallbackRoots: 1,
    });
  });

  it("distinguishes parked native FAILED from real failures without certifying missing coverage", () => {
    const diagnostics = createThreeTilesRuntimeCoverageDiagnostics();
    const parked = tile(FAILED_LOADING_STATE, { renderable: true });
    const failed = tile(FAILED_LOADING_STATE, { renderable: true });
    const routing = tile(LOADED_LOADING_STATE, {
      routing: true,
      children: [parked],
    });
    const roots = [routing, failed];
    const deferredTiles = new Set([parked]);
    const stamp = getTilesetFloorContentRevision(roots, deferredTiles);
    expect(diagnostics.update(input(roots, { deferredTiles }))).toMatchObject({
      floorReady: false,
      failedFallbackRoots: 1,
      unknownFallbackRoots: 1,
      uncoveredFallbackRoots: 2,
      baseCoverage: { ready: false, covered: 0 },
    });
    // Membership is diagnostic evidence even if native state and frame do not change.
    deferredTiles.add(failed);
    expect(getTilesetFloorContentRevision(roots, deferredTiles)).not.toBe(
      stamp
    );
    expect(
      diagnostics.update(
        input(roots, {
          deferredTiles,
          traversalRevision: 2,
        })
      )
    ).toMatchObject({
      floorReady: false,
      failedFallbackRoots: 0,
      unknownFallbackRoots: 2,
      uncoveredFallbackRoots: 2,
      baseCoverage: { ready: false, covered: 0 },
    });
    // Real descendant geometry may cover a parked parent; parking itself cannot.
    parked.children = [tile(LOADED_LOADING_STATE, { renderable: true })];
    expect(
      diagnostics.update(
        input(roots, {
          deferredTiles,
          traversalRevision: 3,
        })
      )
    ).toMatchObject({
      floorReady: false,
      failedFallbackRoots: 0,
      unknownFallbackRoots: 1,
      uncoveredFallbackRoots: 1,
    });
  });

  it("keeps unprocessed metadata and an empty floor unknown instead of 0/0 ready", () => {
    const diagnostics = createThreeTilesRuntimeCoverageDiagnostics();
    const unknown = tile(UNLOADED_LOADING_STATE, { routing: true });
    expect(diagnostics.update(input([unknown]))).toMatchObject({
      evidence: THREE_TILES_COVERAGE_EVIDENCE.FLOOR_INCOMPLETE,
      floorReady: false,
      failedFallbackRoots: 0,
      unknownFallbackRoots: 1,
    });
    expect(
      diagnostics.update(input([], { traversalRevision: 2 }))
    ).toMatchObject({
      evidence: THREE_TILES_COVERAGE_EVIDENCE.FLOOR_UNKNOWN,
      floorReady: false,
      floorTotal: 0,
      uncoveredFallbackRoots: 0,
    });
  });

  it("updates queue metrics without rescanning floor evidence at the same revision", () => {
    const diagnostics = createThreeTilesRuntimeCoverageDiagnostics();
    const root = tile(LOADED_LOADING_STATE, { renderable: true });
    diagnostics.update(input([root]));
    root.internal.loadingState = FAILED_LOADING_STATE;
    const sameTraversal = diagnostics.update(
      input([root], { queued: 3, downloading: 2 })
    );
    expect(sameTraversal.floorReady).toBe(true);
    expect(sameTraversal.queued).toBe(3);
    expect(sameTraversal.downloading).toBe(2);
    expect(
      diagnostics.update(input([root], { traversalRevision: 2 }))
    ).toMatchObject({
      floorReady: false,
      failedFallbackRoots: 1,
    });
  });

  it("does not infer readiness from idle queues while source metadata is pending", () => {
    const diagnostics = createThreeTilesRuntimeCoverageDiagnostics();
    expect(
      diagnostics.update(
        input([tile(LOADED_LOADING_STATE, { renderable: true })], {
          sourcePendingMetadata: true,
        })
      )
    ).toMatchObject({
      evidence: THREE_TILES_COVERAGE_EVIDENCE.SOURCE_PENDING,
      floorReady: false,
      queued: 0,
      downloading: 0,
      parsing: 0,
    });
  });

  it("keeps whole-base totals unknown despite observer readiness and empty queues", () => {
    const loaded = tile(LOADED_LOADING_STATE, { renderable: true });
    const metadata = tile(UNLOADED_LOADING_STATE, { routing: true });
    const status = createThreeTilesRuntimeCoverageDiagnostics().update(
      input([loaded, metadata])
    );
    expect(status.visibleBaseReady).toBe(true);
    expect(status.baseCoverage).toMatchObject({
      known: 2,
      covered: 1,
      totalKnown: false,
      ratio: null,
      ready: false,
    });
    expect(status.waitingForBase).toBe(true);
  });

  it("requires actual residency and material readiness and refreshes them without traversal", () => {
    const loaded = tile(LOADED_LOADING_STATE, { renderable: true });
    const diagnostics = createThreeTilesRuntimeCoverageDiagnostics();
    const resident = new Set<Tile>();
    const renderable = new Set<Tile>();
    const update = () =>
      diagnostics.update(
        input([loaded], {
          isResident: (node) => resident.has(node),
          isRenderable: (node) => renderable.has(node),
          isDemanded: () => true,
        })
      );
    expect(update().baseCoverage).toMatchObject({
      known: 1,
      demanded: 1,
      resident: 0,
      renderable: 0,
      ratio: 0,
    });
    resident.add(loaded);
    expect(update().baseCoverage).toMatchObject({
      resident: 1,
      renderable: 0,
      ratio: 0,
    });
    renderable.add(loaded);
    expect(update()).toMatchObject({
      baseCoverage: { resident: 1, renderable: 1, ratio: 1, ready: true },
      waitingForBase: false,
    });
    expect(
      diagnostics.update(input([loaded], { floorArmed: false })).waitingForBase
    ).toBe(true);
  });

  it("counts a complete finer cut as base geometry but not a conflicting pan reserve", () => {
    const left = tile(LOADED_LOADING_STATE, { renderable: true });
    const right = tile(LOADED_LOADING_STATE, { renderable: true });
    const parent = tile(UNLOADED_LOADING_STATE, {
      renderable: true,
      children: [left, right],
    });
    parent.refine = "REPLACE";
    const resident = new Set([left, right]);
    const diagnostics = createThreeTilesRuntimeCoverageDiagnostics();
    const status = diagnostics.update(
      input([parent], {
        isResident: (node) => resident.has(node),
        closureCoverage: {
          known: 1,
          covered: 0,
          totalKnown: true,
          ready: false,
        },
      })
    );
    expect(status.baseCoverage).toMatchObject({
      resident: 0,
      renderable: 0,
      covered: 1,
      ratio: 1,
    });
    expect(status.closureCoverage).toMatchObject({ ratio: 0, ready: false });
    expect(status.waitingForBase).toBe(true);
    resident.delete(right);
    expect(
      diagnostics.update(
        input([parent], {
          isResident: (node) => resident.has(node),
        })
      ).baseCoverage.ratio
    ).toBe(0);
  });

  it("reports known transition payload demand without claiming a whole-ring denominator", () => {
    const loaded = tile(LOADED_LOADING_STATE, { renderable: true });
    const pending = tile(UNLOADED_LOADING_STATE, { renderable: true });
    const status = createThreeTilesRuntimeCoverageDiagnostics().update(
      input([loaded], {
        seamTiles: [loaded, pending],
        isDemanded: () => true,
      })
    );
    expect(status.seamCoverage).toEqual({
      known: 2,
      demanded: 2,
      resident: 1,
      renderable: 1,
      covered: 1,
      totalKnown: false,
      ratio: null,
      ready: false,
    });
  });

  it("uses base geometry for exclusive mesh mode but waits for an initialized shadow certificate", () => {
    const roots = [tile(LOADED_LOADING_STATE, { renderable: true })];
    const diagnostics = createThreeTilesRuntimeCoverageDiagnostics();
    expect(diagnostics.update(input(roots))).toMatchObject({
      presentationMode: "exclusive-mesh",
      baseCoverage: { ready: true, ratio: 1 },
      waitingForBase: false,
    });
    expect(
      diagnostics.update(
        input(roots, {
          closureCoverage: {
            known: 0,
            covered: 0,
            totalKnown: false,
            ready: false,
          },
        })
      )
    ).toMatchObject({
      presentationMode: "exclusive-shadow",
      baseCoverage: { ready: true, ratio: 1 },
      closureCoverage: { ratio: null, ready: false },
      waitingForBase: true,
    });
  });

  it("knows a resolved container region but leaves unopened descendant metadata unknown", () => {
    const left = tile(LOADED_LOADING_STATE, { renderable: true });
    const right = tile(LOADED_LOADING_STATE, { renderable: true });
    const wrapper = tile(LOADED_LOADING_STATE, {
      routing: true,
      children: [left, right],
    });
    wrapper.refine = "REPLACE";
    const diagnostics = createThreeTilesRuntimeCoverageDiagnostics();
    expect(diagnostics.update(input([wrapper]))).toMatchObject({
      baseCoverage: {
        known: 1,
        covered: 1,
        renderable: 0,
        totalKnown: true,
        ratio: 1,
        ready: true,
      },
      waitingForBase: false,
    });
    wrapper.children![1] = tile(UNLOADED_LOADING_STATE, { routing: true });
    expect(
      diagnostics.update(input([wrapper], { traversalRevision: 2 }))
    ).toMatchObject({
      baseCoverage: {
        known: 1,
        covered: 0,
        totalKnown: false,
        ratio: null,
        ready: false,
      },
      waitingForBase: true,
    });
  });
});
