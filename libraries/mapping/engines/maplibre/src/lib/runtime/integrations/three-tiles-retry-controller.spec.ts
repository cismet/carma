import type { Tile } from "3d-tiles-renderer/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createThreeTilesRetryController,
  MAX_TILE_RETRIES,
} from "./three-tiles-retry-controller";

const failedTile = (uri = "tile.b3dm"): Tile =>
  ({
    content: { uri },
    internal: { basePath: "https://example.com/tiles", loadingState: -1 },
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

    retries.handleFailure(tile, "https://example.com/tiles/tile.b3dm");
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
      retries.handleFailure(tile, "https://example.com/tiles/tile.b3dm");
      const delayMs = 1_000 * 2 ** attempt;
      vi.advanceTimersByTime(delayMs - 1);
      expect(tile.internal.loadingState).toBe(-1);
      vi.advanceTimersByTime(1);
      expect(tile.internal.loadingState).toBe(0);
    }

    tile.internal.loadingState = -1;
    retries.handleFailure(tile, "https://example.com/tiles/tile.b3dm");
    expect(vi.getTimerCount()).toBe(0);
    expect(tile.internal.loadingState).toBe(-1);
    expect(retries.hasExhaustedRetries()).toBe(true);
  });

  it("keeps one retry budget across recreated tiles and successful reloads", () => {
    vi.useFakeTimers();
    const renderer = {
      stats: { failed: 1 },
      dispatchEvent: vi.fn(),
    };
    const retries = createThreeTilesRetryController(() => renderer, vi.fn());
    const url = "https://example.com/tiles/recreated.b3dm";

    for (let attempt = 0; attempt < MAX_TILE_RETRIES; attempt += 1) {
      const tile = failedTile("recreated.b3dm");
      renderer.stats.failed = 1;
      retries.handleFailure(tile, url);
      vi.runOnlyPendingTimers();
      expect(tile.internal.loadingState).toBe(0);
      retries.handleSuccess(tile, url);
    }

    const replacement = failedTile("recreated.b3dm");
    retries.handleFailure(replacement, url);
    expect(vi.getTimerCount()).toBe(0);
    expect(replacement.internal.loadingState).toBe(-1);
  });

  it("cancels a pending retry after a successful load", () => {
    vi.useFakeTimers();
    const tile = failedTile();
    const renderer = {
      stats: { failed: 1 },
      dispatchEvent: vi.fn(),
    };
    const retries = createThreeTilesRetryController(() => renderer, vi.fn());

    const url = "https://example.com/tiles/tile.b3dm";
    retries.handleFailure(tile, url);
    retries.handleSuccess(tile, url);
    expect(retries.hasPendingRetries()).toBe(false);
    vi.runAllTimers();

    expect(tile.internal.loadingState).toBe(-1);
    expect(renderer.dispatchEvent).not.toHaveBeenCalled();
  });
});
