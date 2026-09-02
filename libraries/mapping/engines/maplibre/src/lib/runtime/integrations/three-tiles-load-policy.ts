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

export const TILES_CACHE_CEILING_BYTES = {
  ios: 384 * MIB,
  mobile: 512 * MIB,
  desktopDefault: 1 * GIB,
  desktopMinimum: 768 * MIB,
  desktopMaximum: 2 * GIB,
  perDeviceMemoryGiB: 256 * MIB,
  floor: 128 * MIB,
} as const;

export const TILES_LOAD_POLICY = {
  /** Fov multiplier of the prefetch margin around the main view. */
  prefetchMarginFovFactor: 1.25,
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
} as const;

const MAIN_FRUSTUM_PRIORITY_BONUS =
  (TILE_PRIORITY.maxDepth + 1) * TILE_PRIORITY.depthStep +
  TILE_PRIORITY.externalTilesetBonus +
  TILE_PRIORITY.centernessWeight;

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
  style?: TilesCacheStyleLimits
): number => {
  let ceiling: number;
  if (isIosDevice(device)) {
    ceiling = TILES_CACHE_CEILING_BYTES.ios;
  } else if (isMobileDevice(device)) {
    ceiling = TILES_CACHE_CEILING_BYTES.mobile;
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
    ceiling = Math.min(ceiling, styleCeiling);
  }
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
  depth: number;
  inMainFrustum: boolean;
  isExternalTileset: boolean;
  /** 1 at the view centre, 0 at the edge (or unknown). */
  centerness: number;
}>;

/** Higher values download first (upstream pops from the end of the queue). */
export const deriveTilePriority = (input: TilePriorityInput): number => {
  const depth = clamp(Math.floor(input.depth), 0, TILE_PRIORITY.maxDepth);
  const centerness = clamp(
    Number.isFinite(input.centerness) ? input.centerness : 0,
    0,
    1
  );
  return (
    (TILE_PRIORITY.maxDepth + 1 - depth) * TILE_PRIORITY.depthStep +
    (input.isExternalTileset ? TILE_PRIORITY.externalTilesetBonus : 0) +
    (input.inMainFrustum ? MAIN_FRUSTUM_PRIORITY_BONUS : 0) +
    centerness * TILE_PRIORITY.centernessWeight
  );
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

// D4 — shadow fit hysteresis (pure helper for the camera set)

export const SHADOW_FIT_POLICY = {
  /** Relative centre/extent change that re-poses the registered camera. */
  relativeThreshold: 0.1,
  /** Cosine of the view-direction change that always re-poses it (0.5°). */
  directionCosineThreshold: Math.cos((0.5 * Math.PI) / 180),
} as const;

export type ShadowFit = Readonly<{
  center: readonly [number, number, number];
  extent: readonly [number, number, number];
  /** Unit view direction; a rotated fit always applies. */
  direction?: readonly [number, number, number];
}>;

export const shadowFitChangedMaterially = (
  previous: ShadowFit | null,
  next: ShadowFit,
  threshold: number = SHADOW_FIT_POLICY.relativeThreshold
): boolean => {
  if (!previous) return true;
  if (previous.direction && next.direction) {
    const cosine =
      previous.direction[0] * next.direction[0] +
      previous.direction[1] * next.direction[1] +
      previous.direction[2] * next.direction[2];
    if (cosine < SHADOW_FIT_POLICY.directionCosineThreshold) return true;
  }
  for (let axis = 0; axis < 3; axis += 1) {
    const previousExtent = Math.abs(previous.extent[axis]);
    const nextExtent = Math.abs(next.extent[axis]);
    const reference = Math.max(previousExtent, nextExtent);
    if (reference === 0) {
      if (previous.center[axis] !== next.center[axis]) return true;
      continue;
    }
    if (Math.abs(nextExtent - previousExtent) > threshold * reference) {
      return true;
    }
    if (
      Math.abs(next.center[axis] - previous.center[axis]) >
      threshold * reference
    ) {
      return true;
    }
  }
  return false;
};

// D2 — request concurrency bounded by cache headroom

export const resolveRequestConcurrency = (input: {
  configured: number;
  ceilingBytes: number;
  cachedBytes: number;
  estimateBytes: number;
}): number => {
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
