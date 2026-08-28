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
  handleFailure: (tile: Tile | null, url?: string | URL | null) => void;
  handleSuccess: (tile: Tile | null, url?: string | URL | null) => void;
  hasPendingRetries: () => boolean;
  hasExhaustedRetries: () => boolean;
  dispose: () => void;
}

interface PendingRetry {
  timer: ReturnType<typeof setTimeout>;
  tiles: Set<Tile>;
  retryRoot: boolean;
}

const getTileRetryDelayMs = (retryNumber: number): number =>
  TILE_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, retryNumber - 1);

const getTileRetryKey = (
  tile: Tile | null,
  url?: string | URL | null
): string | null => {
  if (!tile?.content?.uri) return url ? String(url) : null;

  try {
    return new URL(tile.content.uri, `${tile.internal.basePath}/`).toString();
  } catch {
    return `${tile.internal.basePath}/${tile.content.uri}`;
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

  const handleFailure = (tile: Tile | null, url?: string | URL | null) => {
    const key = getTileRetryKey(tile, url);
    if (!key) return;

    const pending = pendingRetries.get(key);
    if (pending) {
      if (tile) pending.tiles.add(tile);
      else pending.retryRoot = true;
      return;
    }

    const retryNumber = (retryCounts.get(key) ?? 0) + 1;
    if (retryNumber > MAX_TILE_RETRIES) {
      exhaustedRetries.add(key);
      return;
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
    }, getTileRetryDelayMs(retryNumber));
    pendingRetries.set(key, {
      timer,
      tiles: new Set(tile ? [tile] : []),
      retryRoot: tile === null,
    });
  };

  return {
    handleFailure,
    handleSuccess,
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
