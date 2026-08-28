import type { Tile } from "3d-tiles-renderer/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createThreeTilesRetryController,
  MAX_TILE_RETRIES,
} from "./three-tiles-retry-controller";

const failedTile = (): Tile =>
  ({
    internal: { loadingState: -1 },
  } as unknown as Tile);

describe("createThreeTilesRetryController", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("requeues a failed tile with exponential backoff", () => {
    vi.useFakeTimers();
    const tile = failedTile();
    const renderer = {
      stats: { failed: 1 },
      dispatchEvent: vi.fn(),
    };
    const requestRender = vi.fn();
    const retries = createThreeTilesRetryController(
      () => renderer,
      requestRender
    );

    retries.handleFailure(tile);
    expect(retries.hasPendingRetries()).toBe(true);
    vi.advanceTimersByTime(999);
    expect(tile.internal.loadingState).toBe(-1);
    vi.advanceTimersByTime(1);

    expect(tile.internal.loadingState).toBe(0);
    expect(renderer.stats.failed).toBe(0);
    expect(renderer.dispatchEvent).toHaveBeenCalledWith({
      type: "needs-update",
    });
    expect(requestRender).toHaveBeenCalledOnce();
    expect(retries.hasPendingRetries()).toBe(false);
  });

  it("stops after five retries for the same tile", () => {
    vi.useFakeTimers();
    const tile = failedTile();
    const renderer = {
      stats: { failed: 1 },
      dispatchEvent: vi.fn(),
    };
    const retries = createThreeTilesRetryController(() => renderer, vi.fn());

    for (let attempt = 0; attempt < MAX_TILE_RETRIES; attempt += 1) {
      tile.internal.loadingState = -1;
      renderer.stats.failed = 1;
      retries.handleFailure(tile);
      vi.runOnlyPendingTimers();
      expect(tile.internal.loadingState).toBe(0);
    }

    tile.internal.loadingState = -1;
    retries.handleFailure(tile);
    expect(vi.getTimerCount()).toBe(0);
    expect(tile.internal.loadingState).toBe(-1);
  });

  it("cancels a pending retry after a successful load", () => {
    vi.useFakeTimers();
    const tile = failedTile();
    const renderer = {
      stats: { failed: 1 },
      dispatchEvent: vi.fn(),
    };
    const retries = createThreeTilesRetryController(() => renderer, vi.fn());

    retries.handleFailure(tile);
    retries.handleSuccess(tile);
    expect(retries.hasPendingRetries()).toBe(false);
    vi.runAllTimers();

    expect(tile.internal.loadingState).toBe(-1);
    expect(renderer.dispatchEvent).not.toHaveBeenCalled();
  });
});
