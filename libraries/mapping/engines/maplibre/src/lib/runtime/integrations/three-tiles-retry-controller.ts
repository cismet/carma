import type { Tile } from "3d-tiles-renderer/core";

import { isPermanentTileRequestFailure } from "./payload-aware-request-concurrency";

const FAILED_LOADING_STATE = -1;
const UNLOADED_LOADING_STATE = 0;

export const MAX_TILE_RETRIES = 5;
const TILE_RETRY_BASE_DELAY_MS = 1_000;
/** An exhausted resource may be tried once more after this long. */
export const EXHAUSTED_RETRY_TTL_MS = 120_000;

export interface RetryableTilesRenderer {
  stats: { failed: number };
  rootLoadingState?: number;
  dispatchEvent: (event: { type: string }) => void;
}

export type TileRetryState = "scheduled" | "pending" | "exhausted" | "ignored";

interface ThreeTilesRetryController {
  handleFailure: (
    tile: Tile | null,
    url?: string | URL | null,
    error?: unknown
  ) => TileRetryState;
  handleSuccess: (tile: Tile | null, url?: string | URL | null) => void;
  /** A retry is pending or the budget is exhausted: do not request it now. */
  isBlocked: (tile: Tile | null, url?: string | URL | null) => boolean;
  isExhausted: (tile: Tile | null, url?: string | URL | null) => boolean;
  hasPendingRetries: () => boolean;
  hasExhaustedRetries: () => boolean;
  /** Forget every pending retry and exhausted resource. */
  reset: () => void;
  dispose: () => void;
}

interface PendingRetry {
  timer: ReturnType<typeof setTimeout>;
  tiles: Set<Tile>;
  retryRoot: boolean;
}

interface ExhaustedRetry {
  expiresAt: number;
  tiles: Set<Tile>;
  retryRoot: boolean;
}

const getStableJitter = (key: string): number => {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (Math.imul(hash, 31) + key.charCodeAt(index)) | 0;
  }
  return 0.8 + ((hash >>> 0) % 401) / 1_000;
};

const getTileRetryDelayMs = (retryNumber: number, key: string): number =>
  Math.round(
    TILE_RETRY_BASE_DELAY_MS *
      2 ** Math.max(0, retryNumber - 1) *
      getStableJitter(key)
  );

const getTileRetryKey = (
  tile: Tile | null,
  url?: string | URL | null
): string | null => {
  const resourceUrl = url ? String(url) : tile?.content?.uri;
  if (!resourceUrl) return null;

  try {
    return tile
      ? new URL(resourceUrl, `${tile.internal.basePath}/`).toString()
      : new URL(resourceUrl).toString();
  } catch {
    return resourceUrl;
  }
};

export const createThreeTilesRetryController = (
  getRenderer: () => RetryableTilesRenderer | null,
  requestRender: () => void
): ThreeTilesRetryController => {
  const retryCounts = new Map<string, number>();
  const pendingRetries = new Map<string, PendingRetry>();
  const exhaustedRetries = new Map<string, ExhaustedRetry>();
  let exhaustionTimer: ReturnType<typeof setTimeout> | null = null;
  let exhaustionDeadline: number | null = null;

  const resumeRetries = (
    retries: Iterable<Pick<PendingRetry, "tiles" | "retryRoot">>
  ) => {
    const renderer = getRenderer();
    if (!renderer) return;
    // Cache removal already unloads most failed tiles. Root failures and tiles
    // retained outside the cache still need their native FAILED state released.
    let resetCount = 0;
    for (const retry of retries) {
      for (const tile of retry.tiles) {
        if (tile.internal.loadingState !== FAILED_LOADING_STATE) continue;
        tile.internal.loadingState = UNLOADED_LOADING_STATE;
        resetCount += 1;
      }
      if (
        retry.retryRoot &&
        renderer.rootLoadingState === FAILED_LOADING_STATE
      ) {
        renderer.rootLoadingState = UNLOADED_LOADING_STATE;
        resetCount += 1;
      }
    }
    if (resetCount > 0)
      renderer.stats.failed = Math.max(0, renderer.stats.failed - resetCount);
    renderer.dispatchEvent({ type: "needs-update" });
    requestRender();
  };

  const scheduleExhaustionRecovery = () => {
    let nextDeadline: number | null = null;
    for (const retry of exhaustedRetries.values())
      nextDeadline = Math.min(nextDeadline ?? Infinity, retry.expiresAt);
    if (nextDeadline === exhaustionDeadline) return;
    if (exhaustionTimer !== null) clearTimeout(exhaustionTimer);
    exhaustionTimer = null;
    exhaustionDeadline = nextDeadline;
    if (nextDeadline === null) return;
    // One timer wakes a stationary scene at the earliest existing TTL. Merely
    // forgetting an expired key leaves an exhausted root permanently FAILED.
    exhaustionTimer = setTimeout(() => {
      exhaustionTimer = null;
      exhaustionDeadline = null;
      pruneExhausted();
    }, Math.max(0, nextDeadline - Date.now()));
  };

  const pruneExhausted = () => {
    const expired: ExhaustedRetry[] = [];
    const now = Date.now();
    for (const [key, retry] of exhaustedRetries) {
      if (now < retry.expiresAt) continue;
      exhaustedRetries.delete(key);
      retryCounts.delete(key);
      expired.push(retry);
    }
    scheduleExhaustionRecovery();
    if (expired.length > 0) resumeRetries(expired);
  };

  const isKeyExhausted = (key: string): boolean => {
    const retry = exhaustedRetries.get(key);
    if (!retry) return false;
    if (Date.now() < retry.expiresAt) return true;
    pruneExhausted();
    return false;
  };
  const exhaust = (key: string, tile: Tile | null) => {
    exhaustedRetries.set(key, {
      expiresAt: Date.now() + EXHAUSTED_RETRY_TTL_MS,
      tiles: new Set(tile ? [tile] : []),
      retryRoot: tile === null,
    });
    scheduleExhaustionRecovery();
  };

  const handleSuccess = (tile: Tile | null, url?: string | URL | null) => {
    const key = getTileRetryKey(tile, url);
    if (!key) return;
    const pending = pendingRetries.get(key);
    if (pending) clearTimeout(pending.timer);
    pendingRetries.delete(key);
    retryCounts.delete(key);
    exhaustedRetries.delete(key);
    scheduleExhaustionRecovery();
  };

  const handleFailure: ThreeTilesRetryController["handleFailure"] = (
    tile,
    url,
    error
  ) => {
    const key = getTileRetryKey(tile, url);
    if (!key) return "ignored";
    if (isKeyExhausted(key)) {
      const exhausted = exhaustedRetries.get(key)!;
      if (tile) exhausted.tiles.add(tile);
      else exhausted.retryRoot = true;
      return "exhausted";
    }

    const pending = pendingRetries.get(key);
    if (pending) {
      if (tile) pending.tiles.add(tile);
      else pending.retryRoot = true;
      return "pending";
    }

    const retryNumber = (retryCounts.get(key) ?? 0) + 1;
    if (
      retryNumber > MAX_TILE_RETRIES ||
      isPermanentTileRequestFailure(error)
    ) {
      exhaust(key, tile);
      return "exhausted";
    }
    retryCounts.set(key, retryNumber);

    const timer = setTimeout(() => {
      const current = pendingRetries.get(key);
      pendingRetries.delete(key);
      if (current) resumeRetries([current]);
    }, getTileRetryDelayMs(retryNumber, key));
    pendingRetries.set(key, {
      timer,
      tiles: new Set(tile ? [tile] : []),
      retryRoot: tile === null,
    });
    return "scheduled";
  };

  const clear = () => {
    for (const pending of pendingRetries.values()) {
      clearTimeout(pending.timer);
    }
    pendingRetries.clear();
    retryCounts.clear();
    exhaustedRetries.clear();
    if (exhaustionTimer !== null) clearTimeout(exhaustionTimer);
    exhaustionTimer = null;
    exhaustionDeadline = null;
  };

  return {
    handleFailure,
    handleSuccess,
    isBlocked: (tile, url) => {
      if (pendingRetries.size === 0 && exhaustedRetries.size === 0)
        return false;
      const key = getTileRetryKey(tile, url);
      return key !== null && (pendingRetries.has(key) || isKeyExhausted(key));
    },
    isExhausted: (tile, url) => {
      if (exhaustedRetries.size === 0) return false;
      const key = getTileRetryKey(tile, url);
      return key !== null && isKeyExhausted(key);
    },
    hasPendingRetries: () => pendingRetries.size > 0,
    hasExhaustedRetries: () => {
      pruneExhausted();
      return exhaustedRetries.size > 0;
    },
    reset: clear,
    dispose: clear,
  };
};
