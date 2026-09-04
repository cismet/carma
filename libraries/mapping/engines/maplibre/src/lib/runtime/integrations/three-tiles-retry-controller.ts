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
  /** Resource key → time the exhausted state expires. */
  const exhaustedRetries = new Map<string, number>();

  const isKeyExhausted = (key: string): boolean => {
    const expiresAt = exhaustedRetries.get(key);
    if (expiresAt === undefined) return false;
    if (Date.now() < expiresAt) return true;
    exhaustedRetries.delete(key);
    return false;
  };
  const exhaust = (key: string) => {
    exhaustedRetries.set(key, Date.now() + EXHAUSTED_RETRY_TTL_MS);
  };
  const pruneExhausted = () => {
    for (const key of [...exhaustedRetries.keys()]) isKeyExhausted(key);
  };

  const handleSuccess = (tile: Tile | null, url?: string | URL | null) => {
    const key = getTileRetryKey(tile, url);
    if (!key) return;
    const pending = pendingRetries.get(key);
    if (pending) clearTimeout(pending.timer);
    pendingRetries.delete(key);
  };

  const handleFailure: ThreeTilesRetryController["handleFailure"] = (
    tile,
    url,
    error
  ) => {
    const key = getTileRetryKey(tile, url);
    if (!key) return "ignored";
    if (isKeyExhausted(key)) return "exhausted";

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
      exhaust(key);
      return "exhausted";
    }
    retryCounts.set(key, retryNumber);

    const timer = setTimeout(() => {
      const current = pendingRetries.get(key);
      pendingRetries.delete(key);
      const renderer = getRenderer();
      if (!renderer || !current) return;

      // The runtime removes failed tiles from its cache, which already leaves
      // them UNLOADED; tiles still marked FAILED are released here so the next
      // traversal can request them.
      let resetCount = 0;
      for (const failedTile of current.tiles) {
        if (failedTile.internal.loadingState !== FAILED_LOADING_STATE) continue;
        failedTile.internal.loadingState = UNLOADED_LOADING_STATE;
        resetCount += 1;
      }
      if (
        current.retryRoot &&
        renderer.rootLoadingState === FAILED_LOADING_STATE
      ) {
        renderer.rootLoadingState = UNLOADED_LOADING_STATE;
        resetCount += 1;
      }
      if (resetCount > 0) {
        renderer.stats.failed = Math.max(0, renderer.stats.failed - resetCount);
      }
      renderer.dispatchEvent({ type: "needs-update" });
      requestRender();
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
  };

  return {
    handleFailure,
    handleSuccess,
    isBlocked: (tile, url) => {
      const key = getTileRetryKey(tile, url);
      return key !== null && (pendingRetries.has(key) || isKeyExhausted(key));
    },
    isExhausted: (tile, url) => {
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
