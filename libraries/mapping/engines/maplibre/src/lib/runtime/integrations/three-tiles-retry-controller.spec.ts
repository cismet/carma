import type { Tile } from "3d-tiles-renderer/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createThreeTilesRetryController,
  EXHAUSTED_RETRY_TTL_MS,
  MAX_TILE_RETRIES,
} from "./three-tiles-retry-controller";

const failedTile = (uri = "tile.b3dm"): Tile =>
  ({
    content: { uri },
    internal: { basePath: "https://example.com/tiles", loadingState: -1 },
  } as unknown as Tile);

const buildRenderer = () => ({
  stats: { failed: 1 },
  dispatchEvent: vi.fn(),
});

describe("createThreeTilesRetryController", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("blocks a failed tile until its backoff fired, then asks for a traversal", () => {
    vi.useFakeTimers();
    const tile = failedTile();
    const renderer = buildRenderer();
    const requestRender = vi.fn();
    const retries = createThreeTilesRetryController(
      () => renderer,
      requestRender
    );
    const url = "https://example.com/tiles/tile.b3dm";

    expect(retries.handleFailure(tile, url, new Error("status 503"))).toBe(
      "scheduled"
    );
    expect(retries.hasPendingRetries()).toBe(true);
    expect(retries.isBlocked(tile, url)).toBe(true);
    expect(retries.isExhausted(tile, url)).toBe(false);
    expect(tile.internal.loadingState).toBe(-1);
    vi.runOnlyPendingTimers();

    // A tile still marked FAILED is released; the runtime normally leaves it
    // UNLOADED already by removing it from the cache.
    expect(tile.internal.loadingState).toBe(0);
    expect(renderer.stats.failed).toBe(0);
    expect(renderer.dispatchEvent).toHaveBeenCalledWith({
      type: "needs-update",
    });
    expect(requestRender).toHaveBeenCalledOnce();
    expect(retries.hasPendingRetries()).toBe(false);
    expect(retries.isBlocked(tile, url)).toBe(false);
  });

  it("asks for a traversal even when the tile was already unloaded", () => {
    vi.useFakeTimers();
    const tile = failedTile();
    const renderer = buildRenderer();
    const requestRender = vi.fn();
    const retries = createThreeTilesRetryController(
      () => renderer,
      requestRender
    );

    retries.handleFailure(tile, "https://example.com/tiles/tile.b3dm");
    tile.internal.loadingState = 0;
    vi.runOnlyPendingTimers();

    expect(renderer.stats.failed).toBe(1);
    expect(renderer.dispatchEvent).toHaveBeenCalledWith({
      type: "needs-update",
    });
    expect(requestRender).toHaveBeenCalledOnce();
  });

  it("stops after five retries for the same tile", () => {
    vi.useFakeTimers();
    const tile = failedTile();
    const renderer = buildRenderer();
    const retries = createThreeTilesRetryController(() => renderer, vi.fn());
    const url = "https://example.com/tiles/tile.b3dm";

    for (let attempt = 0; attempt < MAX_TILE_RETRIES; attempt += 1) {
      tile.internal.loadingState = -1;
      renderer.stats.failed = 1;
      retries.handleFailure(tile, url, new Error("status 503"));
      expect(tile.internal.loadingState).toBe(-1);
      vi.runOnlyPendingTimers();
      expect(tile.internal.loadingState).toBe(0);
    }

    tile.internal.loadingState = -1;
    expect(retries.handleFailure(tile, url, new Error("status 503"))).toBe(
      "exhausted"
    );
    expect(vi.getTimerCount()).toBe(0);
    expect(tile.internal.loadingState).toBe(-1);
    expect(retries.hasExhaustedRetries()).toBe(true);
    expect(retries.isExhausted(tile, url)).toBe(true);
    expect(retries.isBlocked(tile, url)).toBe(true);
  });

  it("exhausts permanent failures at once without a retry", () => {
    vi.useFakeTimers();
    const renderer = buildRenderer();
    const retries = createThreeTilesRetryController(() => renderer, vi.fn());
    const url = "https://example.com/tiles/missing.b3dm";
    const tile = failedTile("missing.b3dm");

    expect(retries.handleFailure(tile, url, new Error("status 404"))).toBe(
      "exhausted"
    );
    expect(vi.getTimerCount()).toBe(0);
    expect(retries.hasPendingRetries()).toBe(false);
    expect(retries.isExhausted(tile, url)).toBe(true);
    expect(retries.handleFailure(tile, url, new Error("status 404"))).toBe(
      "exhausted"
    );
    expect(
      retries.handleFailure(
        failedTile("forbidden.b3dm"),
        "https://example.com/tiles/forbidden.b3dm",
        { status: 403 }
      )
    ).toBe("exhausted");
  });

  it("lets an exhausted resource be tried once more after the expiry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const renderer = buildRenderer();
    const retries = createThreeTilesRetryController(() => renderer, vi.fn());
    const url = "https://example.com/tiles/missing.b3dm";
    const tile = failedTile("missing.b3dm");

    retries.handleFailure(tile, url, new Error("status 404"));
    vi.advanceTimersByTime(EXHAUSTED_RETRY_TTL_MS - 1);
    expect(retries.isBlocked(tile, url)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(retries.isBlocked(tile, url)).toBe(false);
    expect(retries.isExhausted(tile, url)).toBe(false);
    expect(retries.hasExhaustedRetries()).toBe(false);

    // The next failure exhausts it again for another period.
    expect(retries.handleFailure(tile, url, new Error("status 404"))).toBe(
      "exhausted"
    );
    expect(retries.isBlocked(tile, url)).toBe(true);
  });

  it("keeps one retry budget across recreated tiles and successful reloads", () => {
    vi.useFakeTimers();
    const renderer = buildRenderer();
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

  it("keys retries by the requested URL when tile objects change", () => {
    vi.useFakeTimers();
    const renderer = buildRenderer();
    const retries = createThreeTilesRetryController(() => renderer, vi.fn());
    const url = "https://example.com/tiles/stable.b3dm";

    for (let attempt = 0; attempt < MAX_TILE_RETRIES; attempt += 1) {
      const tile = failedTile(`recreated-${attempt}.b3dm`);
      retries.handleFailure(tile, url);
      vi.runOnlyPendingTimers();
    }

    const replacement = failedTile("another-object.b3dm");
    retries.handleFailure(replacement, url);
    expect(vi.getTimerCount()).toBe(0);
    expect(replacement.internal.loadingState).toBe(-1);
  });

  it("cancels a pending retry after a successful load", () => {
    vi.useFakeTimers();
    const tile = failedTile();
    const renderer = buildRenderer();
    const retries = createThreeTilesRetryController(() => renderer, vi.fn());

    const url = "https://example.com/tiles/tile.b3dm";
    retries.handleFailure(tile, url);
    retries.handleSuccess(tile, url);
    expect(retries.hasPendingRetries()).toBe(false);
    expect(retries.isBlocked(tile, url)).toBe(false);
    vi.runAllTimers();

    expect(tile.internal.loadingState).toBe(-1);
    expect(renderer.dispatchEvent).not.toHaveBeenCalled();
  });

  it("forgets pending and exhausted resources on reset", () => {
    vi.useFakeTimers();
    const renderer = buildRenderer();
    const retries = createThreeTilesRetryController(() => renderer, vi.fn());
    const pendingUrl = "https://example.com/tiles/pending.b3dm";
    const missingUrl = "https://example.com/tiles/missing.b3dm";

    retries.handleFailure(failedTile("pending.b3dm"), pendingUrl);
    retries.handleFailure(
      failedTile("missing.b3dm"),
      missingUrl,
      new Error("status 404")
    );
    retries.reset();

    expect(vi.getTimerCount()).toBe(0);
    expect(retries.hasPendingRetries()).toBe(false);
    expect(retries.hasExhaustedRetries()).toBe(false);
    expect(retries.isBlocked(null, pendingUrl)).toBe(false);
    expect(retries.isBlocked(null, missingUrl)).toBe(false);
  });
});
