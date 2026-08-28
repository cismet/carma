import type { Tile } from "3d-tiles-renderer/core";

const FAILED_LOADING_STATE = -1;
const UNLOADED_LOADING_STATE = 0;

export const MAX_TILE_RETRIES = 5;
const TILE_RETRY_BASE_DELAY_MS = 1_000;

export interface RetryableTilesRenderer {
  stats: { failed: number };
  dispatchEvent: (event: { type: string }) => void;
}

interface ThreeTilesRetryController {
  handleFailure: (tile: Tile | null) => void;
  handleSuccess: (tile: Tile) => void;
  hasPendingRetries: () => boolean;
  dispose: () => void;
}

const getTileRetryDelayMs = (retryNumber: number): number =>
  TILE_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, retryNumber - 1);

export const createThreeTilesRetryController = (
  getRenderer: () => RetryableTilesRenderer | null,
  requestRender: () => void
): ThreeTilesRetryController => {
  const retryCounts = new Map<Tile, number>();
  const timers = new Map<Tile, ReturnType<typeof setTimeout>>();

  const clearTile = (tile: Tile) => {
    const timer = timers.get(tile);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(tile);
    retryCounts.delete(tile);
  };

  const handleFailure = (tile: Tile | null) => {
    if (!tile || timers.has(tile)) return;
    const retryNumber = (retryCounts.get(tile) ?? 0) + 1;
    if (retryNumber > MAX_TILE_RETRIES) return;
    retryCounts.set(tile, retryNumber);

    const timer = setTimeout(() => {
      timers.delete(tile);
      const renderer = getRenderer();
      if (!renderer || tile.internal.loadingState !== FAILED_LOADING_STATE) {
        return;
      }
      tile.internal.loadingState = UNLOADED_LOADING_STATE;
      renderer.stats.failed = Math.max(0, renderer.stats.failed - 1);
      renderer.dispatchEvent({ type: "needs-update" });
      requestRender();
    }, getTileRetryDelayMs(retryNumber));
    timers.set(tile, timer);
  };

  return {
    handleFailure,
    handleSuccess: clearTile,
    hasPendingRetries: () => timers.size > 0,
    dispose() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      retryCounts.clear();
    },
  };
};
