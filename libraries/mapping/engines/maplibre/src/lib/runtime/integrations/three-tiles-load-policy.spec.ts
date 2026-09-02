import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  ERROR_TARGET_POLICY,
  TILES_CACHE_CEILING_BYTES,
  TILES_LOAD_POLICY,
  TILE_BYTES_PREDICTION,
  createEffectiveErrorTargetState,
  createTileBytesPredictor,
  deriveTilePriority,
  nextEffectiveErrorTarget,
  resolveRequestConcurrency,
  resolveTilesCacheBounds,
  resolveTilesCacheCeiling,
  shadowFitChangedMaterially,
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

  it("lets a style only lower the ceiling, never below the floor", () => {
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
    ).toBe(TILES_CACHE_CEILING_BYTES.desktopDefault);
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

describe("shadowFitChangedMaterially", () => {
  const fit = {
    center: [0, 0, 0] as const,
    extent: [1_000, 800, 600] as const,
  };

  it("always applies the first fit and ignores small drift", () => {
    expect(shadowFitChangedMaterially(null, fit)).toBe(true);
    expect(
      shadowFitChangedMaterially(fit, {
        center: [50, -40, 30],
        extent: [1_050, 760, 620],
      })
    ).toBe(false);
  });

  it("detects a moved centre or a changed extent beyond the threshold", () => {
    expect(
      shadowFitChangedMaterially(fit, {
        center: [150, 0, 0],
        extent: fit.extent,
      })
    ).toBe(true);
    expect(
      shadowFitChangedMaterially(fit, {
        center: fit.center,
        extent: [1_000, 800, 480],
      })
    ).toBe(true);
    expect(
      shadowFitChangedMaterially(
        fit,
        { center: [150, 0, 0], extent: fit.extent },
        0.2
      )
    ).toBe(false);
  });

  it("treats a rotated view direction as a material change", () => {
    const lit = { ...fit, direction: [0, -1, 0] as const };
    const tilted = Math.sin(THREE.MathUtils.degToRad(1));
    expect(
      shadowFitChangedMaterially(lit, {
        ...fit,
        direction: [tilted, -Math.sqrt(1 - tilted ** 2), 0],
      })
    ).toBe(true);
    const nudged = Math.sin(THREE.MathUtils.degToRad(0.1));
    expect(
      shadowFitChangedMaterially(lit, {
        ...fit,
        direction: [nudged, -Math.sqrt(1 - nudged ** 2), 0],
      })
    ).toBe(false);
    // Without a direction on either side only the footprint counts.
    expect(shadowFitChangedMaterially(lit, fit)).toBe(false);
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
