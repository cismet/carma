import { describe, expect, it } from "vitest";

import {
  ERROR_TARGET_POLICY,
  TILES_CACHE_CEILING_BYTES,
  TILES_LOAD_POLICY,
  TILE_BYTES_PREDICTION,
  createEffectiveErrorTargetState,
  createTileBytesPredictor,
  deriveTilePriority,
  idleRingAllowedError,
  initialMeshLoadError,
  isExtentFloorTile,
  nextMemoryErrorTarget,
  tilesetMinResolutionGeometricError,
  resolveExtentGeometricError,
  meshShadowStageError,
  nextEffectiveErrorTarget,
  resolveRequestConcurrency,
  resolveTilesCacheBounds,
  resolveTilesCacheCeiling,
  shouldDeferTile,
} from "./three-tiles-load-policy";
import type {
  EffectiveErrorTargetState,
  ErrorTargetObservation,
} from "./three-tiles-load-policy";

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

const desktop = {
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140",
  platform: "MacIntel",
  maxTouchPoints: 0,
};

describe("meshShadowStageError", () => {
  it.each([
    [11.72, 1, 16],
    [13.15, 1, 16],
    [16, 1, 16],
    [1, 1, 1],
    [0.63, 0.5, 1],
    [0.49, 0.5, 0.5],
    [0, 1, 1],
    [33, 1, 64],
    [2.8, 3, 3],
  ])(
    "quantizes actual %s at target %s to shared stage %s",
    (actual, target, expected) => {
      expect(meshShadowStageError(actual, target)).toBe(expected);
    }
  );
  it("does not certify invalid error metrics", () => {
    expect(meshShadowStageError(Number.NaN, 1)).toBe(Infinity);
    expect(meshShadowStageError(Infinity, 1)).toBe(Infinity);
    expect(meshShadowStageError(1, 0)).toBe(Infinity);
  });
});

describe("resolveTilesCacheCeiling", () => {
  it("caps iOS and iPadOS devices, including touch Macs", () => {
    expect(
      resolveTilesCacheCeiling({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        platform: "iPhone",
        maxTouchPoints: 5,
      })
    ).toBe(TILES_CACHE_CEILING_BYTES.ios);
    expect(
      resolveTilesCacheCeiling({
        ...desktop,
        maxTouchPoints: 5,
        deviceMemoryGiB: 8,
      })
    ).toBe(TILES_CACHE_CEILING_BYTES.ios);
  });

  it("caps Android and other mobile devices", () => {
    expect(
      resolveTilesCacheCeiling({
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari",
        platform: "Linux armv8l",
        maxTouchPoints: 5,
        deviceMemoryGiB: 8,
      })
    ).toBe(TILES_CACHE_CEILING_BYTES.mobile);
  });

  it("scales Chromium desktops by device memory within bounds", () => {
    expect(resolveTilesCacheCeiling({ ...desktop, deviceMemoryGiB: 2 })).toBe(
      TILES_CACHE_CEILING_BYTES.desktopMinimum
    );
    expect(resolveTilesCacheCeiling({ ...desktop, deviceMemoryGiB: 4 })).toBe(
      4 * TILES_CACHE_CEILING_BYTES.perDeviceMemoryGiB
    );
    expect(resolveTilesCacheCeiling({ ...desktop, deviceMemoryGiB: 64 })).toBe(
      TILES_CACHE_CEILING_BYTES.desktopMaximum
    );
    expect(resolveTilesCacheCeiling(desktop)).toBe(
      TILES_CACHE_CEILING_BYTES.desktopDefault
    );
  });

  it("accepts explicit budgets up to 24 GiB, retaining the floor and safe defaults", () => {
    expect(
      resolveTilesCacheCeiling(desktop, {
        cacheBudgetBytes: 256 * MIB,
        cacheOverflowBytes: 256 * MIB,
      })
    ).toBe(512 * MIB);
    expect(
      resolveTilesCacheCeiling(desktop, {
        cacheBudgetBytes: 4 * GIB,
        cacheOverflowBytes: 4 * GIB,
      })
    ).toBe(8 * GIB);
    expect(
      resolveTilesCacheCeiling(desktop, {
        cacheBudgetBytes: 16 * MIB,
      })
    ).toBe(TILES_CACHE_CEILING_BYTES.floor);
    expect(
      resolveTilesCacheCeiling(desktop, {
        cacheBudgetBytes: 256 * MIB,
        cacheOverflowBytes: Number.POSITIVE_INFINITY,
      })
    ).toBe(TILES_CACHE_CEILING_BYTES.desktopDefault);
    expect(
      resolveTilesCacheCeiling(desktop, { cacheBudgetBytes: 24 * GIB })
    ).toBe(24 * GIB);
    expect(
      resolveTilesCacheCeiling(desktop, { cacheBudgetBytes: 128 * GIB })
    ).toBe(24 * GIB);
  });

  it("derives eviction bounds around the physical ceiling", () => {
    const bounds = resolveTilesCacheBounds({
      ceilingBytes: 1 * GIB,
      estimateBytes: 4 * MIB,
    });
    expect(bounds.minBytesSize).toBe(
      Math.floor(GIB * TILES_LOAD_POLICY.cacheRetentionFraction)
    );
    expect(bounds.maxBytesSize).toBe(
      GIB + TILES_LOAD_POLICY.cacheDriftSlackMinBytes
    );
    expect(
      resolveTilesCacheBounds({ ceilingBytes: GIB, estimateBytes: 16 * MIB })
        .maxBytesSize
    ).toBe(GIB + 8 * 16 * MIB);
  });
});

describe("createTileBytesPredictor", () => {
  it("pauses downloads under memory pressure even below the configured cache budget", () => {
    expect(
      resolveRequestConcurrency({
        configured: 16,
        ceilingBytes: 24 * GIB,
        cachedBytes: GIB,
        estimateBytes: MIB,
        memoryPressure: true,
      })
    ).toBe(0);
  });
  it("starts from the initial estimate and learns per url, level and globally", () => {
    const predictor = createTileBytesPredictor();
    const leaf = { url: "https://tiles.test/a.b3dm", geometricError: 0.5 };
    const coarse = { url: "https://tiles.test/b.b3dm", geometricError: 8 };

    expect(predictor.predict(leaf)).toBe(TILE_BYTES_PREDICTION.initialBytes);
    expect(predictor.globalEstimate()).toBe(TILE_BYTES_PREDICTION.initialBytes);

    predictor.observe(leaf, 3 * MIB);
    expect(predictor.predict(leaf)).toBe(3 * MIB);
    // same level, different url: the level average applies
    expect(
      predictor.predict({
        url: "https://tiles.test/c.b3dm",
        geometricError: 0.6,
      })
    ).toBe(3 * MIB);
    // different level: the global average with its safety multiplier
    expect(predictor.predict(coarse)).toBe(
      Math.round(3 * MIB * TILE_BYTES_PREDICTION.globalMultiplier)
    );
    expect(predictor.globalEstimate()).toBe(3 * MIB);

    predictor.observe(coarse, 5 * MIB);
    expect(predictor.globalEstimate()).toBe(
      Math.round(
        3 * MIB + (5 * MIB - 3 * MIB) * TILE_BYTES_PREDICTION.emaWeight
      )
    );
  });

  it("uses a small fixed size for external tilesets and ignores bad samples", () => {
    const predictor = createTileBytesPredictor();
    expect(
      predictor.predict({
        url: "https://tiles.test/sub/tileset.json",
        geometricError: 100,
        isExternalTileset: true,
      })
    ).toBe(TILE_BYTES_PREDICTION.externalTilesetBytes);
    predictor.observe({ url: null, geometricError: 1 }, 0);
    predictor.observe({ url: null, geometricError: 1 }, Number.NaN);
    expect(predictor.globalEstimate()).toBe(TILE_BYTES_PREDICTION.initialBytes);
  });

  it("bounds the url memo to the newest entries", () => {
    const predictor = createTileBytesPredictor();
    const first = { url: "https://tiles.test/0.b3dm", geometricError: 1 };
    predictor.observe(first, 1 * MIB);
    for (
      let index = 1;
      index <= TILE_BYTES_PREDICTION.urlMemoLimit;
      index += 1
    ) {
      predictor.observe(
        { url: `https://tiles.test/${index}.b3dm`, geometricError: 1 },
        2 * MIB
      );
    }
    // the oldest url fell out of the memo, so the level average applies
    expect(predictor.predict(first)).not.toBe(1 * MIB);
    expect(predictor.predict(first)).toBeGreaterThan(1.9 * MIB);
  });
});

describe("deriveTilePriority", () => {
  it("reaches initial visible quality ahead of caster and reserve work without delaying holes", () => {
    const base = {
      distanceFromCamera: 100,
      depth: 5,
      inMainFrustum: true,
      isExternalTileset: false,
      centerness: 0,
    };
    const initial = deriveTilePriority({ ...base, improvesInitialView: true });
    expect(initial).toBeGreaterThan(
      deriveTilePriority({
        ...base,
        inMainFrustum: false,
        shadowReceiverCenterness: 1,
      })
    );
    expect(initial).toBeGreaterThan(
      deriveTilePriority({ ...base, inMainFrustum: false, isExtentFloor: true })
    );
    expect(initial).toBeLessThan(
      deriveTilePriority({ ...base, fillsViewCoverage: true })
    );
  });
  it("puts offscreen baseline repair after visible detail regardless of distance", () => {
    const floor = {
      distanceFromCamera: 0,
      depth: 1,
      inMainFrustum: false,
      isExternalTileset: false,
      centerness: 1,
      isExtentFloor: true,
    };
    expect(deriveTilePriority(floor)).toBeLessThan(
      deriveTilePriority({
        ...floor,
        distanceFromCamera: 100_000,
        inMainFrustum: true,
        isExtentFloor: false,
      })
    );
    expect(
      deriveTilePriority({
        ...floor,
        inMainFrustum: true,
        fillsViewCoverage: true,
      })
    ).toBeGreaterThan(deriveTilePriority(floor));
  });
  it("prioritizes JSON, missing coverage, proven casters, then visible refinement", () => {
    const common = {
      distanceFromCamera: 1,
      depth: 30,
      inMainFrustum: true,
      isExternalTileset: false,
      centerness: 1,
    };
    const detail = deriveTilePriority(common);
    const coverage = deriveTilePriority({
      ...common,
      distanceFromCamera: 10_000,
      fillsViewCoverage: true,
    });
    const metadata = deriveTilePriority({
      ...common,
      distanceFromCamera: Infinity,
      inMainFrustum: false,
      isExternalTileset: true,
    });
    const caster = deriveTilePriority({
      ...common,
      distanceFromCamera: Infinity,
      inMainFrustum: false,
      shadowReceiverCenterness: 0,
    });
    expect(metadata).toBeGreaterThan(coverage);
    expect(coverage).toBeGreaterThan(detail);
    expect(coverage).toBeGreaterThan(caster);
    expect(caster).toBeGreaterThan(detail);
  });
  it("orders mesh requests by observer distance, ahead of offscreen casters", () => {
    const priority = (distance: number, depth: number, inMainFrustum = true) =>
      deriveTilePriority({
        distanceFromCamera: distance,
        depth,
        inMainFrustum,
        isExternalTileset: false,
        centerness: 0,
      });
    expect(priority(10, 30)).toBeGreaterThan(priority(100, 1));
    expect(priority(10000, 30)).toBeGreaterThan(priority(0, 1, false));
    expect(priority(Infinity, 0)).toBeLessThan(priority(10000, 30));
  });

  it("bootstraps coverage at 16 pixels without exceeding requested quality", () => {
    expect(initialMeshLoadError(0.25)).toBe(16);
    expect(initialMeshLoadError(32)).toBe(32);
  });
  it("orders the main view first, then hierarchy, external tilesets and centre", () => {
    const shallow = deriveTilePriority({
      depth: 3,
      inMainFrustum: false,
      isExternalTileset: false,
      centerness: 0,
    });
    const deepCentre = deriveTilePriority({
      depth: 4,
      inMainFrustum: true,
      isExternalTileset: true,
      centerness: 1,
    });
    expect(deepCentre).toBeGreaterThan(shallow);

    const external = deriveTilePriority({
      depth: 4,
      inMainFrustum: false,
      isExternalTileset: true,
      centerness: 0,
    });
    const mainCentre = deriveTilePriority({
      depth: 4,
      inMainFrustum: true,
      isExternalTileset: false,
      centerness: 1,
    });
    const mainEdge = deriveTilePriority({
      depth: 4,
      inMainFrustum: true,
      isExternalTileset: false,
      centerness: 0,
    });
    const margin = deriveTilePriority({
      depth: 4,
      inMainFrustum: false,
      isExternalTileset: false,
      centerness: 0,
    });
    expect(mainCentre).toBeGreaterThan(mainEdge);
    expect(mainEdge).toBeGreaterThan(external);
    expect(external).toBeGreaterThan(margin);
  });

  it("orders shadow-only tiles by receiver relevance and then light depth", () => {
    const edgeReceiver = deriveTilePriority({
      depth: 4,
      inMainFrustum: false,
      isExternalTileset: false,
      centerness: 0,
      shadowReceiverCenterness: 0.2,
      shadowLightFacing: 1,
    });
    const centreReceiverBehind = deriveTilePriority({
      depth: 4,
      inMainFrustum: false,
      isExternalTileset: false,
      centerness: 0,
      shadowReceiverCenterness: 0.9,
      shadowLightFacing: 0,
    });
    const centreReceiverLightFacing = deriveTilePriority({
      depth: 4,
      inMainFrustum: false,
      isExternalTileset: false,
      centerness: 0,
      shadowReceiverCenterness: 0.9,
      shadowLightFacing: 1,
    });

    expect(centreReceiverBehind).toBeGreaterThan(edgeReceiver);
    expect(centreReceiverLightFacing).toBeGreaterThan(centreReceiverBehind);
  });

  it("clamps depth and centerness", () => {
    expect(
      deriveTilePriority({
        depth: 500,
        inMainFrustum: false,
        isExternalTileset: false,
        centerness: 4,
      })
    ).toBe(
      deriveTilePriority({
        depth: 63,
        inMainFrustum: false,
        isExternalTileset: false,
        centerness: 1,
      })
    );
  });
});

describe("shouldDeferTile", () => {
  const displayable = {
    displayable: true,
    inView: false,
    inMargin: false,
    loadingState: 0,
    isDeferred: false,
  };

  it("defers unloaded displayable tiles outside the view and margin", () => {
    expect(shouldDeferTile(displayable)).toBe("defer");
  });

  it("keeps tiles that are in view, in the margin, loading or not displayable", () => {
    expect(shouldDeferTile({ ...displayable, inView: true })).toBe("keep");
    expect(shouldDeferTile({ ...displayable, inMargin: true })).toBe("keep");
    expect(shouldDeferTile({ ...displayable, loadingState: 2 })).toBe("keep");
    expect(shouldDeferTile({ ...displayable, displayable: false })).toBe(
      "keep"
    );
    expect(shouldDeferTile({ ...displayable, isDeferred: true })).toBe("keep");
  });

  it("releases deferred tiles once they enter the view or margin", () => {
    expect(
      shouldDeferTile({ ...displayable, isDeferred: true, inView: true })
    ).toBe("undefer");
    expect(
      shouldDeferTile({ ...displayable, isDeferred: true, inMargin: true })
    ).toBe("undefer");
  });
});

describe("nextEffectiveErrorTarget", () => {
  const ceiling = 1 * GIB;
  const baseObservation: ErrorTargetObservation = {
    now: 10_000,
    physicallyFull: true,
    pipelineIdle: true,
    mainConverged: false,
    usedBytesMain: ceiling,
    cachedBytes: ceiling,
    ceiling,
    zoom: 17,
    pitch: 45,
    unusedEvictable: false,
    lastProgressAt: 0,
  };
  const step = (
    state: EffectiveErrorTargetState,
    patch: Partial<ErrorTargetObservation>
  ) => nextEffectiveErrorTarget(state, { ...baseObservation, ...patch });

  it("relaxes once the stall held for the hold time and remembers the failure", () => {
    let state = createEffectiveErrorTargetState(0.25, 10_000);
    let result = step(state, { now: 10_000 });
    expect(result.changed).toBe(false);
    expect(result.retryInMs).toBe(ERROR_TARGET_POLICY.relaxHoldMs);
    state = result.state;

    result = step(state, { now: 10_500 });
    expect(result.changed).toBe(false);
    state = result.state;

    result = step(state, { now: 11_000 });
    expect(result.changed).toBe(true);
    expect(result.state.effective).toBe(0.5);
    expect(result.state.failedTarget).toBe(0.25);
    expect(result.state.failedView).toEqual({ zoom: 17, pitch: 45, ceiling });
    state = result.state;

    // a second stall relaxes again up to the cap of 4x the requested target
    result = step(state, { now: 11_000 });
    expect(result.changed).toBe(false);
    result = step(result.state, { now: 12_000 });
    expect(result.state.effective).toBe(1);
    result = step(result.state, { now: 13_000 });
    expect(result.changed).toBe(false);
    expect(result.state.effective).toBe(1);
  });

  it("restarts the hold on progress but not on its own evictions", () => {
    let state = createEffectiveErrorTargetState(1, 10_000);
    state = step(state, { now: 10_000 }).state;
    // eviction dip: not full, something evictable, still unconverged
    state = step(state, {
      now: 10_400,
      physicallyFull: false,
      unusedEvictable: true,
    }).state;
    let result = step(state, { now: 11_000 });
    expect(result.changed).toBe(true);
    expect(result.state.effective).toBe(2);

    // progress at 11_600 restarts the hold
    state = result.state;
    state = step(state, { now: 11_100 }).state;
    result = step(state, { now: 12_100, lastProgressAt: 11_600 });
    expect(result.changed).toBe(false);
    result = step(result.state, { now: 12_600, lastProgressAt: 11_600 });
    expect(result.changed).toBe(true);
    expect(result.state.effective).toBe(4);
  });

  it("does not relax while something can still be evicted or the pipeline is busy", () => {
    const state = createEffectiveErrorTargetState(1, 10_000);
    let result = step(state, { now: 10_000, unusedEvictable: true });
    result = step(result.state, { now: 12_000, unusedEvictable: true });
    expect(result.changed).toBe(false);
    result = step(result.state, { now: 14_000, pipelineIdle: false });
    expect(result.changed).toBe(false);
    result = step(result.state, { now: 16_000, physicallyFull: false });
    expect(result.changed).toBe(false);
  });

  it("does not re-tighten into the failed target in the same view class", () => {
    let state = createEffectiveErrorTargetState(0.25, 10_000);
    state = step(state, { now: 10_000 }).state;
    state = step(state, { now: 11_000 }).state;
    expect(state.effective).toBe(0.5);

    // converged with plenty of headroom after eviction, cooldown elapsed
    const result = step(state, {
      now: 20_000,
      physicallyFull: false,
      mainConverged: true,
      usedBytesMain: 64 * MIB,
      cachedBytes: 64 * MIB,
    });
    expect(result.changed).toBe(false);
    expect(result.state.effective).toBe(0.5);
    expect(result.retryInMs).toBeNull();
  });

  it("clears the failure memory after a zoom change and tightens stepwise", () => {
    let state = createEffectiveErrorTargetState(0.25, 10_000);
    state = step(state, { now: 10_000 }).state;
    state = step(state, { now: 11_000 }).state;
    state = step(state, { now: 11_000 }).state;
    state = step(state, { now: 12_000 }).state;
    expect(state.effective).toBe(1);

    const zoomedIn = {
      zoom: 17.6,
      physicallyFull: false,
      mainConverged: true,
      usedBytesMain: 64 * MIB,
      cachedBytes: 64 * MIB,
    };
    let result = step(state, { ...zoomedIn, now: 12_500 });
    expect(result.changed).toBe(false);
    expect(result.retryInMs).toBe(1_000);
    result = step(result.state, { ...zoomedIn, now: 13_500 });
    expect(result.changed).toBe(true);
    expect(result.state.effective).toBe(0.5);
    expect(result.state.failedTarget).toBeNull();
    expect(result.state.tightenBaselineBytes).toBe(64 * MIB);

    // converging after the step teaches the growth ratio
    result = step(result.state, {
      ...zoomedIn,
      now: 14_000,
      usedBytesMain: 192 * MIB,
    });
    expect(result.state.tightenBaselineBytes).toBeNull();
    expect(result.state.growthRatio).toBeCloseTo(
      4 + (3 - 4) * ERROR_TARGET_POLICY.growthRatioWeight
    );
    result = step(result.state, {
      ...zoomedIn,
      now: 15_000,
      usedBytesMain: 192 * MIB,
    });
    expect(result.changed).toBe(true);
    expect(result.state.effective).toBe(0.25);
  });

  it("does not tighten without headroom for the predicted growth", () => {
    let state = createEffectiveErrorTargetState(0.25, 10_000);
    state = step(state, { now: 10_000 }).state;
    state = step(state, { now: 11_000 }).state;
    const result = step(state, {
      now: 20_000,
      zoom: 18,
      physicallyFull: false,
      mainConverged: true,
      usedBytesMain: 300 * MIB,
      cachedBytes: 300 * MIB,
    });
    expect(result.changed).toBe(false);
    expect(result.retryInMs).toBeNull();
  });

  it("treats a pan without a zoom or pitch change as the same view class", () => {
    let state = createEffectiveErrorTargetState(0.25, 10_000);
    state = step(state, { now: 10_000 }).state;
    state = step(state, { now: 11_000 }).state;
    const result = step(state, {
      now: 20_000,
      zoom: 17.2,
      pitch: 55,
      physicallyFull: false,
      mainConverged: true,
      usedBytesMain: 64 * MIB,
    });
    expect(result.state.failedTarget).toBe(0.25);
    expect(result.changed).toBe(false);
  });

  it("clears the failure memory when the ceiling grows", () => {
    let state = createEffectiveErrorTargetState(0.25, 10_000);
    state = step(state, { now: 10_000 }).state;
    state = step(state, { now: 11_000 }).state;
    const result = step(state, {
      now: 20_000,
      ceiling: 2 * GIB,
      physicallyFull: false,
      mainConverged: true,
      usedBytesMain: 64 * MIB,
    });
    expect(result.changed).toBe(true);
    expect(result.state.effective).toBe(0.25);
  });

  it("still relaxes a zero requested target", () => {
    let state = createEffectiveErrorTargetState(0, 10_000);
    state = step(state, { now: 10_000 }).state;
    const result = step(state, { now: 11_000 });
    expect(result.changed).toBe(true);
    expect(result.state.effective).toBe(
      2 * ERROR_TARGET_POLICY.minimumRelaxBase
    );
  });
});

describe("resolveRequestConcurrency", () => {
  it("never keeps more requests in flight than the cache headroom admits", () => {
    expect(
      resolveRequestConcurrency({
        configured: 64,
        ceilingBytes: GIB,
        cachedBytes: GIB - 40 * MIB,
        estimateBytes: 4 * MIB,
      })
    ).toBe(10);
    expect(
      resolveRequestConcurrency({
        configured: 64,
        ceilingBytes: GIB,
        cachedBytes: GIB,
        estimateBytes: 4 * MIB,
      })
    ).toBe(TILES_LOAD_POLICY.minimumRequestConcurrency);
    expect(
      resolveRequestConcurrency({
        configured: 256,
        ceilingBytes: GIB,
        cachedBytes: 0,
        estimateBytes: 1,
      })
    ).toBe(TILES_LOAD_POLICY.maximumRequestConcurrency);
  });

  it("respects a caller limit below the floor and a cooldown of zero", () => {
    expect(
      resolveRequestConcurrency({
        configured: 2,
        ceilingBytes: GIB,
        cachedBytes: 0,
        estimateBytes: 4 * MIB,
      })
    ).toBe(2);
    expect(
      resolveRequestConcurrency({
        configured: 0,
        ceilingBytes: GIB,
        cachedBytes: 0,
        estimateBytes: 4 * MIB,
      })
    ).toBe(0);
  });
});

describe("idleRingAllowedError", () => {
  it("steps one level per ring from the base error target", () => {
    expect(idleRingAllowedError(20, 1, 0)).toBe(20);
    expect(idleRingAllowedError(20, 2, 0)).toBe(40);
    expect(idleRingAllowedError(20, 4, 0)).toBe(160);
  });

  it("refines the cascade by the refined levels, never below the anchor", () => {
    expect(idleRingAllowedError(20, 3, 1)).toBe(40);
    expect(idleRingAllowedError(20, 3, 2)).toBe(20);
    expect(idleRingAllowedError(20, 3, 5)).toBe(20);
  });
});

describe("extent floor", () => {
  const levels = [
    { level: 0, geometricError: 900, bytes: 1e6 },
    { level: 3, geometricError: 100, bytes: 16e6 },
    { level: 4, geometricError: 42, bytes: 21e6 },
    { level: 5, geometricError: 20, bytes: 52e6 },
    { level: 6, geometricError: 10, bytes: 220e6 },
  ];

  it("picks the deepest level whose resident bytes fit the memory share", () => {
    const share = TILES_LOAD_POLICY.extentMemoryShare;
    const resident = TILES_LOAD_POLICY.extentResidentBytesPerTransferByte;
    const throughLevel4 = (1e6 + 16e6 + 21e6) * resident;
    expect(resolveExtentGeometricError(levels, throughLevel4 / share)).toBe(42);
    expect(resolveExtentGeometricError(levels, 1e12)).toBe(10);
  });

  it("falls back above the entry hint when its resident floor cannot fit", () => {
    expect(resolveExtentGeometricError(levels, 1)).toBe(900);
    // 2024 mesh: the hinted L3 floor consumes more than this entire story cache.
    const meshLevels = [
      { level: 0, geometricError: 908.2, bytes: 17541680 },
      { level: 1, geometricError: 453.9, bytes: 7572336 },
      { level: 2, geometricError: 204.5, bytes: 12552584 },
      { level: 3, geometricError: 97.3, bytes: 15919395 },
    ];
    expect(resolveExtentGeometricError(meshLevels, 384 * MIB)).toBe(908.2);
    expect(resolveExtentGeometricError(meshLevels, 6 * GIB)).toBe(97.3);
  });

  it("classifies tiles at or above the floor level", () => {
    expect(isExtentFloorTile({ geometricError: 42 }, 42)).toBe(true);
    expect(isExtentFloorTile({ geometricError: 100 }, 42)).toBe(true);
    expect(isExtentFloorTile({ geometricError: 20 }, 42)).toBe(false);
    expect(isExtentFloorTile({ geometricError: 20 }, Infinity)).toBe(false);
  });
});

describe("residual resolution floor", () => {
  it("is the base error scaled by the extent's longest axis over the resolution", () => {
    // 12 km across 1024 px at 20 px base error: 234 m of geometric error.
    expect(tilesetMinResolutionGeometricError(20, 12_000, 1024)).toBeCloseTo(
      234.4,
      1
    );
    expect(tilesetMinResolutionGeometricError(20, Number.NaN, 1024)).toBe(0);
    expect(tilesetMinResolutionGeometricError(20, 12_000, 0)).toBe(0);
  });

  it("stops the floor at the first level finer than the residual error", () => {
    const levels = [
      { level: 3, geometricError: 100, bytes: 16e6 },
      { level: 4, geometricError: 42, bytes: 21e6 },
      { level: 5, geometricError: 20, bytes: 52e6 },
    ];
    expect(resolveExtentGeometricError(levels, 1e12, 30)).toBe(42);
    expect(resolveExtentGeometricError(levels, 1e12, 0)).toBe(20);
    expect(resolveExtentGeometricError([], 1e12, 30)).toBe(30);
  });
});

describe("foveated priority", () => {
  const base = {
    depth: 8,
    inMainFrustum: true,
    isExternalTileset: false,
    fillsViewCoverage: false,
  };

  it("keeps nearest-first order without a weight", () => {
    const near = deriveTilePriority({
      ...base,
      distanceFromCamera: 100,
      centerness: 0,
    });
    const far = deriveTilePriority({
      ...base,
      distanceFromCamera: 200,
      centerness: 1,
    });
    expect(near).toBeGreaterThan(far);
  });

  it("lets a centred tile overtake a nearer edge tile with a weight", () => {
    const edgeNear = deriveTilePriority({
      ...base,
      distanceFromCamera: 100,
      centerness: 0,
      foveationWeight: 4,
    });
    const centreFar = deriveTilePriority({
      ...base,
      distanceFromCamera: 200,
      centerness: 1,
      foveationWeight: 4,
    });
    expect(centreFar).toBeGreaterThan(edgeNear);
  });
});

describe("nextMemoryErrorTarget", () => {
  const base = { requested: 6, base: 20, cachedBytes: 0, ceilingBytes: 1e9 };

  it("can release a stalled base cut, bounded by current root SSE", () => {
    const input = {
      ...base,
      current: 20,
      maximum: 40,
      cacheFull: true,
      viewConverged: false,
      now: 10_000,
      changedAt: 0,
    };
    expect(nextMemoryErrorTarget(input).target).toBe(30);
    expect(nextMemoryErrorTarget({ ...input, current: 35 }).target).toBe(40);
    expect(nextMemoryErrorTarget({ ...input, maximum: Infinity }).target).toBe(
      20
    );
  });

  it("rises at the ceiling with an unconverged view, never above the base error", () => {
    const raised = nextMemoryErrorTarget({
      ...base,
      current: 6,
      cacheFull: true,
      viewConverged: false,
      cachedBytes: 1e9,
      now: 10_000,
      changedAt: 0,
    });
    expect(raised.target).toBe(9);
    expect(raised.changedAt).toBe(10_000);
    const capped = nextMemoryErrorTarget({
      ...base,
      current: 18,
      cacheFull: true,
      viewConverged: false,
      cachedBytes: 1e9,
      now: 20_000,
      changedAt: 0,
    });
    expect(capped.target).toBe(20);
    const tooSoon = nextMemoryErrorTarget({
      ...base,
      current: 6,
      cacheFull: true,
      viewConverged: false,
      cachedBytes: 1e9,
      now: 1_000,
      changedAt: 0,
    });
    expect(tooSoon.target).toBe(6);
    expect(tooSoon.retryInMs).toBe(
      TILES_LOAD_POLICY.memoryTargetRaiseAfterMs - 1_000 + 1
    );
  });

  it("relaxes towards the requested target once memory frees", () => {
    const relaxed = nextMemoryErrorTarget({
      ...base,
      current: 9,
      cacheFull: false,
      viewConverged: true,
      cachedBytes: 1e8,
      now: 30_000,
      changedAt: 0,
    });
    expect(relaxed.target).toBe(6);
    const held = nextMemoryErrorTarget({
      ...base,
      current: 9,
      cacheFull: false,
      viewConverged: true,
      cachedBytes: 9e8,
      now: 30_000,
      changedAt: 0,
    });
    expect(held.target).toBe(9);
    expect(held.retryInMs).toBeNull();
  });

  it("schedules only the remaining strict relaxation deadline", () => {
    const pending = nextMemoryErrorTarget({
      ...base,
      current: 9,
      cacheFull: false,
      viewConverged: true,
      cachedBytes: 1e8,
      now: 5_999,
      changedAt: 0,
    });
    expect(pending.target).toBe(9);
    expect(pending.retryInMs).toBe(2);
    const noLongerEligible = nextMemoryErrorTarget({
      ...base,
      current: 6,
      cacheFull: false,
      viewConverged: true,
      cachedBytes: 1e8,
      now: 5_999,
      changedAt: 0,
    });
    expect(noLongerEligible.retryInMs).toBeNull();
  });

  it("does not let unused LRU retention permanently prevent quality recovery", () => {
    const input = {
      ...base,
      current: 9,
      cacheFull: false,
      viewConverged: true,
      cachedBytes: 7.5e8,
      usedBytes: 5.5e8,
      now: 30_000,
      changedAt: 0,
    };
    expect(nextMemoryErrorTarget(input).target).toBe(6);
    expect(nextMemoryErrorTarget({ ...input, usedBytes: 7e8 }).target).toBe(9);
    expect(nextMemoryErrorTarget({ ...input, cacheFull: true }).target).toBe(9);
    expect(
      nextMemoryErrorTarget({ ...input, usedBytes: undefined }).target
    ).toBe(9);
  });
});
