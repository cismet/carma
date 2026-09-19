import { clamp } from "@carma-commons/math";

/**
 * Pure loading policy for the 3D Tiles runtime: cache ceilings, byte
 * prediction, download priorities, sibling deferral, the effective error
 * target with hysteresis and request concurrency. No renderer references, no
 * side effects; the runtime orchestrates.
 */

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

const FAILED_LOADING_STATE = -1;
const UNLOADED_LOADING_STATE = 0;
export const TILE_MEMORY_ALLOCATION_ERROR =
  /out of memory|allocation failed|failed to allocate|cannot allocate memory/i;

/**
 * Decision: TILES_COVERAGE.md#resident-cache-ceiling-policy-2026-09-18.
 * Desktops start optimistically at 6 GiB (scaled down only when the browser
 * reports little memory); phones and tablets have hard caps that no consumer
 * budget can raise; a learned ceiling from an allocation failure, a lost
 * context or a session that never ended cleanly lowers all of them.
 */
export const TILES_CACHE_CEILING_BYTES = {
  configuredMaximum: 24 * GIB,
  ios: 384 * MIB,
  mobile: 512 * MIB,
  desktopDefault: 6 * GIB,
  desktopMinimum: 768 * MIB,
  desktopMaximum: 6 * GIB,
  perDeviceMemoryGiB: 768 * MIB,
  floor: 128 * MIB,
} as const;

export const TILES_LOAD_POLICY = {
  /** First visible complete cut; coarser payloads are resident reserves only. */
  firstImageMaxErrorPixels: 64,
  memoryCheckIntervalMs: 1_000,
  heapPauseFraction: 0.8,
  heapResumeFraction: 0.65,
  /** Fov multiplier of the prefetch margin around the main view. */
  prefetchMarginFovFactor: 1.25,
  /**
   * Idle rings around the view, as multipliers of tan(fov / 2): ring k spans
   * that many times the view's half extent and may hold tiles up to
   * base error × 2^(k-1). Once the view converged, the skip strategy fills
   * the rings from the inside out until the outermost covers the model, so
   * a pan or a zoom-out step finds coarse coverage instead of blank ground.
   * The largest ring keeps a perspective frustum: 43 × tan(18.4°) is 172°;
   * beyond it one more ring holds the whole model at the next coarser level.
   */
  idleRingTanMultipliers: [2.25, 4.3, 8.2, 17, 43],
  /**
   * The cascade in levels: ring k may hold tiles up to
   * anchor × 2^(step × (k-1)), one level coarser per ring by default. The
   * anchor is the base error target (the level the view itself falls back
   * to while it moves) unless idleRingAnchorPixels sets another.
   */
  idleRingLevelStep: 1,
  idleRingAnchorPixels: null as number | null,
  /**
   * Ancestors of the extent floor report at least this multiple of the
   * error target so the traversal reaches the floor tiles every frame,
   * whatever the target: a visited tile is used, and a used tile is never
   * an eviction candidate.
   */
  extentFloorAncestorErrorFactor: 4,
  /**
   * The rings admit new tiles only while the cache stays under this share of
   * the LRU retention floor, so loaded ring tiles are never the ones the LRU
   * has to evict; loaded ones stay pinned regardless.
   */
  idleRingBudgetFraction: 0.9,
  /**
   * Once every ring is loaded and the queues are idle, the cascade refines
   * one level per pass while memory stays within the budget and a traversal
   * costs less than this many milliseconds; a camera move restarts from the
   * coarse cascade so the inner rings always come first.
   */
  idleRingRefineTraversalBudgetMs: 6,
  idleRingRefineIntervalMs: 1_500,
  /**
   * Whole-extent residency from an entry hint: the deepest level whose
   * cumulative payload bytes × this resident factor (decoded textures and
   * geometry, measured ≈7.6× the transfer size) stays within this share of
   * the cache ceiling, never above the hinted level.
   */
  extentResidentBytesPerTransferByte: 7.6,
  extentMemoryShare: 0.35,
  /**
   * Memory-adaptive error target: at the admission ceiling with an
   * unconverged view the effective target rises by this factor (never above
   * the base error target) after the raise delay; it relaxes one step once
   * the cache is below this share of the ceiling for the relax delay.
   */
  memoryTargetStep: 1.5,
  memoryTargetRaiseAfterMs: 2_000,
  memoryTargetRelaxAfterMs: 6_000,
  memoryTargetRelaxBelow: 0.6,
  /** CPU copies of textures/geometry stay alive next to the GPU upload. */
  residentOverhead: 1.5,
  /** Drift slack above the ceiling before the over-max abort loop may run. */
  cacheDriftSlackMinBytes: 64 * MIB,
  cacheDriftSlackEstimates: 8,
  /** Fraction of the ceiling retained by the asynchronous eviction. */
  cacheRetentionFraction: 0.75,
  cacheUnloadPercent: 0.05,
  /** Cache bound change that warrants re-applying the cache configuration. */
  cacheBoundsReapplyBytes: 8 * MIB,
  minimumRequestConcurrency: 4,
  maximumRequestConcurrency: 64,
} as const;

export const TILE_BYTES_PREDICTION = {
  externalTilesetBytes: 16 * 1024,
  initialBytes: 4 * MIB,
  globalMultiplier: 1.25,
  emaWeight: 0.2,
  urlMemoLimit: 20_000,
} as const;

export const TILE_PRIORITY = {
  maxDepth: 63,
  depthStep: 1_000,
  externalTilesetBonus: 500,
  centernessWeight: 100,
  shadowLightFacingWeight: 50,
} as const;

const MAIN_FRUSTUM_PRIORITY_BONUS =
  (TILE_PRIORITY.maxDepth + 1) * TILE_PRIORITY.depthStep +
  TILE_PRIORITY.externalTilesetBonus +
  TILE_PRIORITY.centernessWeight +
  TILE_PRIORITY.shadowLightFacingWeight;

export const ERROR_TARGET_POLICY = {
  relaxFactor: 2,
  relaxHoldMs: 1_000,
  maxRelaxMultiplier: 4,
  maxErrorTarget: 50,
  /** Base used for the relax cap when the requested target is (near) zero. */
  minimumRelaxBase: 0.125,
  tightenFactor: 2,
  tightenCooldownMs: 1_500,
  tightenHeadroomFraction: 0.8,
  growthRatioInitial: 4,
  growthRatioMinimum: 2,
  growthRatioMaximum: 8,
  growthRatioWeight: 0.5,
  failedViewZoomDelta: 0.5,
  failedViewPitchDeltaDeg: 20,
} as const;

// D3 — cache ceiling per device

export type TilesDeviceProfile = Readonly<{
  deviceMemoryGiB?: number;
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}>;

export type TilesCacheStyleLimits = Readonly<{
  cacheBudgetBytes?: number;
  cacheOverflowBytes?: number;
}>;

const isIosDevice = (device: TilesDeviceProfile): boolean =>
  /iPhone|iPad|iPod/i.test(device.userAgent) ||
  (device.platform === "MacIntel" && device.maxTouchPoints > 1);

const isMobileDevice = (device: TilesDeviceProfile): boolean =>
  /Android|Mobile/i.test(device.userAgent);

export const resolveTilesCacheCeiling = (
  device: TilesDeviceProfile,
  style?: TilesCacheStyleLimits,
  /** A ceiling learned from an earlier failure; only ever lowers the result. */
  learnedCeilingBytes?: number | null
): number => {
  let ceiling: number;
  // A consumer budget may raise a desktop up to the configured maximum, a
  // phone or tablet never: its class ceiling is the hard cap.
  let hardCap: number = TILES_CACHE_CEILING_BYTES.configuredMaximum;
  if (isIosDevice(device)) {
    ceiling = TILES_CACHE_CEILING_BYTES.ios;
    hardCap = ceiling;
  } else if (isMobileDevice(device)) {
    ceiling = TILES_CACHE_CEILING_BYTES.mobile;
    hardCap = ceiling;
  } else if (
    device.deviceMemoryGiB !== undefined &&
    Number.isFinite(device.deviceMemoryGiB) &&
    device.deviceMemoryGiB > 0
  ) {
    ceiling = clamp(
      device.deviceMemoryGiB * TILES_CACHE_CEILING_BYTES.perDeviceMemoryGiB,
      TILES_CACHE_CEILING_BYTES.desktopMinimum,
      TILES_CACHE_CEILING_BYTES.desktopMaximum
    );
  } else {
    ceiling = TILES_CACHE_CEILING_BYTES.desktopDefault;
  }

  const budget = style?.cacheBudgetBytes;
  if (budget !== undefined && Number.isFinite(budget)) {
    const overflow = style?.cacheOverflowBytes ?? 0;
    const styleCeiling = Number.isFinite(overflow)
      ? Math.max(0, budget) + Math.max(0, overflow)
      : Number.POSITIVE_INFINITY;
    if (Number.isFinite(styleCeiling))
      ceiling = Math.min(styleCeiling, hardCap);
  }
  if (
    learnedCeilingBytes !== undefined &&
    learnedCeilingBytes !== null &&
    Number.isFinite(learnedCeilingBytes)
  )
    ceiling = Math.min(ceiling, learnedCeilingBytes);
  return Math.max(TILES_CACHE_CEILING_BYTES.floor, Math.floor(ceiling));
};

export type TilesCacheBounds = Readonly<{
  minBytesSize: number;
  maxBytesSize: number;
}>;

/** Eviction bounds of the LRU around a physical admission ceiling. */
export const resolveTilesCacheBounds = (input: {
  ceilingBytes: number;
  estimateBytes: number;
}): TilesCacheBounds => ({
  minBytesSize: Math.floor(
    input.ceilingBytes * TILES_LOAD_POLICY.cacheRetentionFraction
  ),
  maxBytesSize:
    input.ceilingBytes +
    Math.max(
      TILES_LOAD_POLICY.cacheDriftSlackMinBytes,
      TILES_LOAD_POLICY.cacheDriftSlackEstimates * input.estimateBytes
    ),
});

// D2 — byte prediction for admission

export type TileBytesSample = Readonly<{
  url: string | null;
  geometricError: number;
  isExternalTileset?: boolean;
}>;

export interface TileBytesPredictor {
  predict: (tile: TileBytesSample) => number;
  observe: (tile: TileBytesSample, bytes: number) => void;
  globalEstimate: () => number;
}

const resolveTileLevel = (geometricError: number): number => {
  const level = Math.log2(Math.max(geometricError, Number.EPSILON));
  return Number.isFinite(level) ? Math.round(level) : Number.MIN_SAFE_INTEGER;
};

const blend = (previous: number | undefined, sample: number): number =>
  previous === undefined
    ? sample
    : previous + (sample - previous) * TILE_BYTES_PREDICTION.emaWeight;

export const createTileBytesPredictor = (): TileBytesPredictor => {
  const urlMemo = new Map<string, number>();
  const levelEstimates = new Map<number, number>();
  let globalEstimate: number | undefined;

  const rememberUrl = (url: string, bytes: number) => {
    if (urlMemo.has(url)) urlMemo.delete(url);
    urlMemo.set(url, bytes);
    if (urlMemo.size > TILE_BYTES_PREDICTION.urlMemoLimit) {
      const oldest = urlMemo.keys().next().value;
      if (oldest !== undefined) urlMemo.delete(oldest);
    }
  };

  return {
    predict(tile) {
      if (tile.isExternalTileset) {
        return TILE_BYTES_PREDICTION.externalTilesetBytes;
      }
      const remembered = tile.url === null ? undefined : urlMemo.get(tile.url);
      if (remembered !== undefined) return remembered;
      const levelEstimate = levelEstimates.get(
        resolveTileLevel(tile.geometricError)
      );
      if (levelEstimate !== undefined) return Math.round(levelEstimate);
      if (globalEstimate !== undefined) {
        return Math.round(
          globalEstimate * TILE_BYTES_PREDICTION.globalMultiplier
        );
      }
      return TILE_BYTES_PREDICTION.initialBytes;
    },
    observe(tile, bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return;
      if (tile.url !== null) rememberUrl(tile.url, bytes);
      const level = resolveTileLevel(tile.geometricError);
      levelEstimates.set(level, blend(levelEstimates.get(level), bytes));
      globalEstimate = blend(globalEstimate, bytes);
    },
    globalEstimate: () =>
      Math.round(globalEstimate ?? TILE_BYTES_PREDICTION.initialBytes),
  };
};

// D6 — download order

export type TilePriorityInput = Readonly<{
  /** Mesh admission: distance to the camera in the current traversal, in metres. */
  distanceFromCamera?: number;
  depth: number;
  inMainFrustum: boolean;
  isExternalTileset: boolean;
  /** Missing viewport coverage, ahead of detail upgrades and caster-only work. */
  fillsViewCoverage?: boolean;
  /** Visible refinement needed to reach the first usable quality target. */
  improvesInitialView?: boolean;
  /** Extent floor reserve; outside the view it follows visible refinement. */
  isExtentFloor?: boolean;
  /** 1 at the view centre, 0 at the edge (or unknown). */
  centerness: number;
  /**
   * Foveation: within a lane a tile sorts as if `1 + weight × (1 − centerness)`
   * times farther, so the view centre refines first (Cesium's foveated error,
   * applied to the order of requests, not to what is loaded).
   */
  foveationWeight?: number;
  /** View-centre relevance of the visible receiver for a shadow-only tile. */
  shadowReceiverCenterness?: number;
  /** 1 at the light-facing end of the relevant receiver sweep. */
  shadowLightFacing?: number;
}>;

/** Higher values download first (upstream pops from the end of the queue). */
export const deriveTilePriority = (input: TilePriorityInput): number => {
  if (input.distanceFromCamera !== undefined) {
    const distance = Number.isFinite(input.distanceFromCamera)
      ? Math.max(0, input.distanceFromCamera)
      : Number.MAX_VALUE;
    // Metadata and missing visible coverage first. A proven sun-corridor
    // dependency comes before cosmetic receiver refinement, otherwise detail
    // can starve the offscreen geometry needed for the first correct shadow.
    // Within a lane, keep nearest-first ordering independent of tree depth.
    const lane = input.isExternalTileset
      ? 6
      : input.inMainFrustum
      ? input.fillsViewCoverage
        ? 5
        : input.improvesInitialView
        ? 4
        : 2
      : Number.isFinite(input.shadowReceiverCenterness)
      ? 3
      : input.isExtentFloor
      ? 1
      : 0;
    const foveation = Math.max(0, input.foveationWeight ?? 0);
    const centered = clamp(
      Number.isFinite(input.centerness) ? input.centerness : 0,
      0,
      1
    );
    return lane + 1 / (1 + distance * (1 + foveation * (1 - centered)));
  }
  const depth = clamp(Math.floor(input.depth), 0, TILE_PRIORITY.maxDepth);
  const requestedCenterness = input.inMainFrustum
    ? input.centerness
    : input.shadowReceiverCenterness ?? input.centerness;
  const centerness = clamp(
    Number.isFinite(requestedCenterness) ? requestedCenterness : 0,
    0,
    1
  );
  const shadowLightFacing = clamp(
    Number.isFinite(input.shadowLightFacing) ? input.shadowLightFacing ?? 0 : 0,
    0,
    1
  );
  return (
    (TILE_PRIORITY.maxDepth + 1 - depth) * TILE_PRIORITY.depthStep +
    (input.isExternalTileset ? TILE_PRIORITY.externalTilesetBonus : 0) +
    (input.inMainFrustum ? MAIN_FRUSTUM_PRIORITY_BONUS : 0) +
    centerness * TILE_PRIORITY.centernessWeight +
    (input.inMainFrustum
      ? 0
      : shadowLightFacing * TILE_PRIORITY.shadowLightFacingWeight)
  );
};

export const DEFAULT_MESH_BASE_ERROR_PIXELS = 16;

/**
 * Error target of the first pass over a terrain-providing tileset: coarse
 * coverage before refinement to the requested target. Cesium's equivalent is
 * its progressive-resolution pass, maximum error / progressiveResolutionHeightFraction.
 */
export const initialMeshLoadError = (
  requested: number,
  base: number = DEFAULT_MESH_BASE_ERROR_PIXELS
): number => Math.max(base, requested);

/** Shared hard-shadow stages; final target readiness is tested separately. */
export const meshShadowStageError = (
  actualErrorPixels: number,
  targetErrorPixels: number
): number => {
  if (
    !Number.isFinite(actualErrorPixels) ||
    !Number.isFinite(targetErrorPixels) ||
    targetErrorPixels <= 0
  )
    return Number.POSITIVE_INFINITY;
  return actualErrorPixels <= targetErrorPixels
    ? targetErrorPixels
    : Math.max(targetErrorPixels, 2 ** Math.ceil(Math.log2(actualErrorPixels)));
};

export type MeshLoadStage = Readonly<{
  current: number;
  total: number;
  stable: boolean;
}>;

/** 16 px, 8 px, ... target define the user-visible progressive mesh stages. */
export const getMeshLoadStage = (
  actualErrorPixels: number,
  targetErrorPixels: number
): MeshLoadStage => {
  if (
    !Number.isFinite(actualErrorPixels) ||
    !Number.isFinite(targetErrorPixels) ||
    targetErrorPixels <= 0
  ) {
    return { current: 0, total: 0, stable: false };
  }
  const initialError = initialMeshLoadError(targetErrorPixels);
  const total = Math.ceil(Math.log2(initialError / targetErrorPixels)) + 1;
  const remaining = Math.max(
    0,
    Math.ceil(
      Math.log2(
        Math.max(actualErrorPixels, targetErrorPixels) / targetErrorPixels
      )
    )
  );
  const stable = actualErrorPixels <= targetErrorPixels;
  return {
    current: stable ? total : Math.max(0, total - remaining),
    total,
    stable,
  };
};

// D1 — off-frustum sibling deferral

export type TileDeferralDecision = "defer" | "undefer" | "keep";

export type TileDeferralInput = Readonly<{
  /** Renderable REPLACE content that is not unconditionally refined. */
  displayable: boolean;
  inView: boolean;
  inMargin: boolean;
  loadingState: number;
  isDeferred: boolean;
}>;

export const shouldDeferTile = (
  input: TileDeferralInput
): TileDeferralDecision => {
  if (input.inView || input.inMargin) {
    return input.isDeferred ? "undefer" : "keep";
  }
  if (
    input.displayable &&
    input.loadingState === UNLOADED_LOADING_STATE &&
    !input.isDeferred
  ) {
    return "defer";
  }
  return "keep";
};

/** Loading state that makes a deferred tile count as finished for its parent. */
export const DEFERRED_TILE_LOADING_STATE = FAILED_LOADING_STATE;

// D5 — effective error target with hysteresis

export type ErrorTargetFailedView = Readonly<{
  zoom: number;
  pitch: number;
  ceiling: number;
}>;

export type EffectiveErrorTargetState = Readonly<{
  requested: number;
  effective: number;
  lastChangeAt: number;
  /** Start of the current full-idle-unconverged stall, if any. */
  stallSince: number | null;
  failedTarget: number | null;
  failedView: ErrorTargetFailedView | null;
  growthRatio: number;
  /** Main-view bytes before the last tighten step, until it converged. */
  tightenBaselineBytes: number | null;
}>;

export type ErrorTargetObservation = Readonly<{
  now: number;
  physicallyFull: boolean;
  pipelineIdle: boolean;
  mainConverged: boolean;
  usedBytesMain: number;
  cachedBytes: number;
  ceiling: number;
  zoom: number;
  pitch: number;
  unusedEvictable: boolean;
  /** Timestamp of the last loaded model (progress); 0 when none. */
  lastProgressAt: number;
}>;

export type EffectiveErrorTargetResult = Readonly<{
  state: EffectiveErrorTargetState;
  changed: boolean;
  /** Delay until a time-gated decision may flip without new frames. */
  retryInMs: number | null;
}>;

export const createEffectiveErrorTargetState = (
  requested: number,
  now: number
): EffectiveErrorTargetState => ({
  requested,
  effective: requested,
  lastChangeAt: now,
  stallSince: null,
  failedTarget: null,
  failedView: null,
  growthRatio: ERROR_TARGET_POLICY.growthRatioInitial,
  tightenBaselineBytes: null,
});

const resolveRelaxCap = (requested: number): number =>
  Math.min(
    ERROR_TARGET_POLICY.maxErrorTarget,
    ERROR_TARGET_POLICY.maxRelaxMultiplier *
      Math.max(requested, ERROR_TARGET_POLICY.minimumRelaxBase)
  );

const hasFailedViewExpired = (
  failedView: ErrorTargetFailedView,
  observation: ErrorTargetObservation
): boolean =>
  Math.abs(observation.zoom - failedView.zoom) >=
    ERROR_TARGET_POLICY.failedViewZoomDelta ||
  Math.abs(observation.pitch - failedView.pitch) >=
    ERROR_TARGET_POLICY.failedViewPitchDeltaDeg ||
  observation.ceiling > failedView.ceiling;

export const nextEffectiveErrorTarget = (
  state: EffectiveErrorTargetState,
  observation: ErrorTargetObservation
): EffectiveErrorTargetResult => {
  const { now } = observation;
  let next: EffectiveErrorTargetState = state;
  const assign = (patch: Partial<EffectiveErrorTargetState>) => {
    next = { ...next, ...patch };
  };

  // Failure memory only applies to the view class it was recorded in.
  if (next.failedView && hasFailedViewExpired(next.failedView, observation)) {
    assign({ failedTarget: null, failedView: null });
  }

  // Learn how much the used set grows per tighten step once it converged.
  if (
    next.tightenBaselineBytes !== null &&
    observation.pipelineIdle &&
    observation.mainConverged &&
    now > next.lastChangeAt
  ) {
    const baseline = next.tightenBaselineBytes;
    if (baseline > 0 && observation.usedBytesMain > 0) {
      const ratio = observation.usedBytesMain / baseline;
      assign({
        growthRatio: clamp(
          next.growthRatio +
            (ratio - next.growthRatio) * ERROR_TARGET_POLICY.growthRatioWeight,
          ERROR_TARGET_POLICY.growthRatioMinimum,
          ERROR_TARGET_POLICY.growthRatioMaximum
        ),
      });
    }
    assign({ tightenBaselineBytes: null });
  }

  let retryInMs: number | null = null;

  // Tighten: converged with headroom, outside the cooldown and above what
  // already failed in this view class.
  if (
    observation.pipelineIdle &&
    observation.mainConverged &&
    next.effective > next.requested
  ) {
    const candidate = Math.max(
      next.requested,
      next.effective / ERROR_TARGET_POLICY.tightenFactor
    );
    const headroomOk =
      observation.usedBytesMain * next.growthRatio <=
      ERROR_TARGET_POLICY.tightenHeadroomFraction * observation.ceiling;
    const aboveFailure =
      next.failedTarget === null || candidate > next.failedTarget;
    const cooldownRemaining =
      next.lastChangeAt + ERROR_TARGET_POLICY.tightenCooldownMs - now;
    if (headroomOk && aboveFailure) {
      if (cooldownRemaining > 0) {
        retryInMs = cooldownRemaining;
      } else {
        assign({
          effective: candidate,
          lastChangeAt: now,
          stallSince: null,
          tightenBaselineBytes: observation.usedBytesMain,
        });
        return { state: next, changed: true, retryInMs: null };
      }
    }
  }

  // Relax: physically full, idle, unconverged and nothing left to evict for
  // at least the hold time since the last progress.
  const stalled =
    observation.physicallyFull &&
    observation.pipelineIdle &&
    !observation.mainConverged &&
    !observation.unusedEvictable;
  if (observation.mainConverged) {
    if (next.stallSince !== null) assign({ stallSince: null });
  } else if (stalled) {
    const stallSince =
      next.stallSince === null
        ? now
        : Math.max(next.stallSince, observation.lastProgressAt);
    if (stallSince !== next.stallSince) assign({ stallSince });
    const cap = resolveRelaxCap(next.requested);
    const relaxed = Math.min(
      cap,
      Math.max(next.effective, ERROR_TARGET_POLICY.minimumRelaxBase) *
        ERROR_TARGET_POLICY.relaxFactor
    );
    if (relaxed > next.effective) {
      const holdRemaining = stallSince + ERROR_TARGET_POLICY.relaxHoldMs - now;
      if (holdRemaining > 0) {
        retryInMs =
          retryInMs === null
            ? holdRemaining
            : Math.min(retryInMs, holdRemaining);
      } else {
        assign({
          failedTarget: next.effective,
          failedView: {
            zoom: observation.zoom,
            pitch: observation.pitch,
            ceiling: observation.ceiling,
          },
          effective: relaxed,
          lastChangeAt: now,
          stallSince: null,
          tightenBaselineBytes: null,
        });
        return { state: next, changed: true, retryInMs: null };
      }
    }
  }

  return { state: next, changed: false, retryInMs };
};

// D2 — request concurrency bounded by cache headroom

export const resolveRequestConcurrency = (input: {
  memoryPressure?: boolean;
  configured: number;
  ceilingBytes: number;
  cachedBytes: number;
  estimateBytes: number;
}): number => {
  if (input.memoryPressure) return 0;
  const configured = Math.floor(input.configured);
  if (!Number.isFinite(configured) || configured <= 0) return 0;
  const headroom = Math.max(0, input.ceilingBytes - input.cachedBytes);
  const estimate = Math.max(1, input.estimateBytes);
  const admissible = Math.floor(headroom / estimate);
  const upperBound = Math.min(
    configured,
    TILES_LOAD_POLICY.maximumRequestConcurrency
  );
  const lowerBound = Math.min(
    configured,
    TILES_LOAD_POLICY.minimumRequestConcurrency
  );
  return clamp(Math.min(configured, admissible), lowerBound, upperBound);
};

/** Geometric error of the deepest level the extent stays resident at. */
export const resolveExtentGeometricError = (
  levels: ReadonlyArray<{
    level: number;
    geometricError: number;
    bytes: number;
  }>,
  ceilingBytes: number,
  /**
   * Residual quality as a geometric error: the floor never goes finer than
   * this (see tilesetMinResolutionGeometricError), whatever memory allows.
   */
  minResolutionGeometricError = 0
): number => {
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  if (sorted.length === 0)
    return minResolutionGeometricError > 0
      ? minResolutionGeometricError
      : Number.POSITIVE_INFINITY;
  let cumulative = 0;
  // The entry hint accelerates metadata discovery; it cannot reserve more
  // resident payload than the budget. Fall back to the coarsest available cut.
  let chosen = sorted[0];
  for (const level of sorted) {
    cumulative +=
      level.bytes * TILES_LOAD_POLICY.extentResidentBytesPerTransferByte;
    if (cumulative > ceilingBytes * TILES_LOAD_POLICY.extentMemoryShare) break;
    if (level.geometricError < minResolutionGeometricError) break;
    chosen = level;
  }
  return chosen?.geometricError ?? Number.POSITIVE_INFINITY;
};

/**
 * Residual quality codified as a resolution: the whole extent shown across
 * `tilesetMinResolutionPx` pixels at the base error target. A tile of
 * geometric error g then shows `g × px / longestAxis` pixels of error, so
 * the floor is the coarsest level whose error is at most base × axis / px.
 */
export const tilesetMinResolutionGeometricError = (
  baseErrorTargetPixels: number,
  rootLongestAxisMeters: number,
  tilesetMinResolutionPx: number
): number =>
  Number.isFinite(rootLongestAxisMeters) &&
  rootLongestAxisMeters > 0 &&
  tilesetMinResolutionPx > 0
    ? (baseErrorTargetPixels * rootLongestAxisMeters) / tilesetMinResolutionPx
    : 0;

/** At or above the level the whole extent stays resident at. */
export const isExtentFloorTile = (
  tile: { geometricError: number },
  extentGeometricError: number
): boolean => tile.geometricError >= extentGeometricError;

/**
 * Screen-space error a tile in ring k (1 = innermost) may stop at, with the
 * cascade refined by `refinedLevels` levels below its coarse start.
 */
export const idleRingAllowedError = (
  baseErrorTarget: number,
  ring: number,
  refinedLevels: number
): number => {
  const anchor = TILES_LOAD_POLICY.idleRingAnchorPixels ?? baseErrorTarget;
  const levels =
    Math.max(0, ring - 1 - refinedLevels) * TILES_LOAD_POLICY.idleRingLevelStep;
  return anchor * 2 ** levels;
};

export type MemoryErrorTargetInput = Readonly<{
  current: number;
  requested: number;
  /** Default coarsening limit when no current root SSE is available. */
  base: number;
  /** Current root SSE permits a coarser emergency cut in constrained caches. */
  maximum?: number;
  cacheFull: boolean;
  viewConverged: boolean;
  cachedBytes: number;
  /** Pinned/current demand bytes, only supplied for a settled, idle cut. */
  usedBytes?: number;
  ceilingBytes: number;
  now: number;
  changedAt: number;
}>;

/**
 * Memory-adaptive error target (TILES_COVERAGE.md, memory guarantee): at the
 * admission ceiling with an unconverged view the target rises by
 * memoryTargetStep after memoryTargetRaiseAfterMs, up to the current root
 * error (or the base if unspecified); below memoryTargetRelaxBelow it steps towards
 * the requested target after memoryTargetRelaxAfterMs.
 */
export const nextMemoryErrorTarget = (
  input: MemoryErrorTargetInput
): { target: number; changedAt: number; retryInMs: number | null } => {
  const since = input.now - input.changedAt;
  const maximum = Number.isFinite(input.maximum)
    ? Math.max(input.base, input.maximum!)
    : input.base;
  const raiseEligible =
    input.cacheFull && !input.viewConverged && input.current < maximum;
  if (raiseEligible && since > TILES_LOAD_POLICY.memoryTargetRaiseAfterMs)
    return {
      target: Math.min(
        maximum,
        input.current * TILES_LOAD_POLICY.memoryTargetStep
      ),
      changedAt: input.now,
      retryInMs: null,
    };
  const relaxEligible =
    !input.cacheFull &&
    // Retained, unused cache entries are reusable, not a quality obligation.
    // Counting them here deadlocks recovery: LRU retention is 75%, but quality
    // recovery requires less than 60%. Admission still uses physical bytes.
    Math.min(input.cachedBytes, input.usedBytes ?? input.cachedBytes) <
      input.ceilingBytes * TILES_LOAD_POLICY.memoryTargetRelaxBelow &&
    input.current > input.requested;
  if (relaxEligible && since > TILES_LOAD_POLICY.memoryTargetRelaxAfterMs)
    return {
      target: Math.max(
        input.requested,
        input.current / TILES_LOAD_POLICY.memoryTargetStep
      ),
      changedAt: input.now,
      retryInMs: null,
    };
  const deadline = raiseEligible
    ? TILES_LOAD_POLICY.memoryTargetRaiseAfterMs
    : relaxEligible
    ? TILES_LOAD_POLICY.memoryTargetRelaxAfterMs
    : null;
  return {
    target: input.current,
    changedAt: input.changedAt,
    retryInMs: deadline === null ? null : Math.max(1, deadline - since + 1),
  };
};
