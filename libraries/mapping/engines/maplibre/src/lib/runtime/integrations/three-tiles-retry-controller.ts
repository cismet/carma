import type { Tile } from "3d-tiles-renderer/core";

const FAILED_LOADING_STATE = -1;
const UNLOADED_LOADING_STATE = 0;

export const MAX_TILE_RETRIES = 5;
const TILE_RETRY_BASE_DELAY_MS = 1_000;

export interface RetryableTilesRenderer {
  stats: { failed: number };
  rootLoadingState?: number;
  dispatchEvent: (event: { type: string }) => void;
}

interface ThreeTilesRetryController {
  handleFailure: (
    tile: Tile | null,
    url?: string | URL | null
  ) => "scheduled" | "pending" | "exhausted" | "ignored";
  handleSuccess: (tile: Tile | null, url?: string | URL | null) => void;
  isExhausted: (tile: Tile | null, url?: string | URL | null) => boolean;
  hasPendingRetries: () => boolean;
  hasExhaustedRetries: () => boolean;
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
  const exhaustedRetries = new Set<string>();

  const handleSuccess = (tile: Tile | null, url?: string | URL | null) => {
    const key = getTileRetryKey(tile, url);
    if (!key) return;
    const pending = pendingRetries.get(key);
    if (pending) clearTimeout(pending.timer);
    pendingRetries.delete(key);
  };

  const handleFailure: ThreeTilesRetryController["handleFailure"] = (
    tile,
    url
  ) => {
    const key = getTileRetryKey(tile, url);
    if (!key) return "ignored";
    if (exhaustedRetries.has(key)) return "exhausted";

    const pending = pendingRetries.get(key);
    if (pending) {
      if (tile) pending.tiles.add(tile);
      else pending.retryRoot = true;
      return "pending";
    }

    const retryNumber = (retryCounts.get(key) ?? 0) + 1;
    if (retryNumber > MAX_TILE_RETRIES) {
      exhaustedRetries.add(key);
      return "exhausted";
    }
    retryCounts.set(key, retryNumber);

    const timer = setTimeout(() => {
      const current = pendingRetries.get(key);
      pendingRetries.delete(key);
      const renderer = getRenderer();
      if (!renderer || !current) return;

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
      if (resetCount === 0) return;

      renderer.stats.failed = Math.max(0, renderer.stats.failed - resetCount);
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

  return {
    handleFailure,
    handleSuccess,
    isExhausted: (tile, url) => {
      const key = getTileRetryKey(tile, url);
      return key !== null && exhaustedRetries.has(key);
    },
    hasPendingRetries: () => pendingRetries.size > 0,
    hasExhaustedRetries: () => exhaustedRetries.size > 0,
    dispose() {
      for (const pending of pendingRetries.values()) {
        clearTimeout(pending.timer);
      }
      pendingRetries.clear();
      retryCounts.clear();
      exhaustedRetries.clear();
    },
  };
};
