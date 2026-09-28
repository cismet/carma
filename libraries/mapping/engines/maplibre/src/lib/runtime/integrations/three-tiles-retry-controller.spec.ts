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

  it("skips URL resolution when no retry can block a tile", () => {
    vi.useFakeTimers();
    const tile = failedTile();
    const renderer = buildRenderer();
    const retries = createThreeTilesRetryController(() => renderer, vi.fn());
    const url = new URL("https://example.com/tiles/tile.b3dm");
    const stringify = vi.spyOn(url, "toString");
    expect(retries.isBlocked(tile, url)).toBe(false);
    expect(retries.isExhausted(tile, url)).toBe(false);
    expect(stringify).not.toHaveBeenCalled();

    retries.handleFailure(tile, url, { status: 404 });
    stringify.mockClear();
    expect(retries.isBlocked(tile, url)).toBe(true);
    expect(retries.isExhausted(tile, url)).toBe(true);
    expect(stringify).toHaveBeenCalledTimes(2);

    retries.handleSuccess(tile, url);
    stringify.mockClear();
    expect(retries.isBlocked(tile, url)).toBe(false);
    expect(retries.isExhausted(tile, url)).toBe(false);
    expect(stringify).not.toHaveBeenCalled();
    stringify.mockRestore();
    retries.dispose();
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
    expect(vi.getTimerCount()).toBe(1);
    expect(tile.internal.loadingState).toBe(-1);
    expect(retries.hasExhaustedRetries()).toBe(true);
    expect(retries.isExhausted(tile, url)).toBe(true);
    expect(retries.isBlocked(tile, url)).toBe(true);
  });

  it("holds permanent failures until the existing exhaustion deadline", () => {
    vi.useFakeTimers();
    const renderer = buildRenderer();
    const retries = createThreeTilesRetryController(() => renderer, vi.fn());
    const url = "https://example.com/tiles/missing.b3dm";
    const tile = failedTile("missing.b3dm");

    expect(retries.handleFailure(tile, url, new Error("status 404"))).toBe(
      "exhausted"
    );
    expect(vi.getTimerCount()).toBe(1);
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
    expect(vi.getTimerCount()).toBe(1);
  });

  it("lets an exhausted resource be tried once more after the expiry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const renderer = buildRenderer();
    const requestRender = vi.fn();
    const retries = createThreeTilesRetryController(
      () => renderer,
      requestRender
    );
    const url = "https://example.com/tiles/missing.b3dm";
    const tile = failedTile("missing.b3dm");

    retries.handleFailure(tile, url, new Error("status 404"));
    vi.advanceTimersByTime(EXHAUSTED_RETRY_TTL_MS - 1);
    expect(retries.isBlocked(tile, url)).toBe(true);
    expect(requestRender).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    // Recovery must happen while the scene is asleep, before a query or frame.
    expect(tile.internal.loadingState).toBe(0);
    expect(renderer.stats.failed).toBe(0);
    expect(renderer.dispatchEvent).toHaveBeenCalledOnce();
    expect(renderer.dispatchEvent).toHaveBeenCalledWith({
      type: "needs-update",
    });
    expect(requestRender).toHaveBeenCalledOnce();
    expect(retries.isBlocked(tile, url)).toBe(false);
    expect(retries.isExhausted(tile, url)).toBe(false);
    expect(retries.hasExhaustedRetries()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(requestRender).toHaveBeenCalledOnce();

    // The next failure exhausts it again for another period.
    expect(retries.handleFailure(tile, url, new Error("status 404"))).toBe(
      "exhausted"
    );
    expect(retries.isBlocked(tile, url)).toBe(true);
  });

  it("releases an exhausted root without an external frame", () => {
    vi.useFakeTimers();
    const renderer = { ...buildRenderer(), rootLoadingState: -1 };
    const requestRender = vi.fn();
    const retries = createThreeTilesRetryController(
      () => renderer,
      requestRender
    );
    const url = "https://example.com/tileset.json";

    retries.handleFailure(null, url, { status: 404 });
    vi.advanceTimersByTime(EXHAUSTED_RETRY_TTL_MS);

    expect(renderer.rootLoadingState).toBe(0);
    expect(renderer.stats.failed).toBe(0);
    expect(renderer.dispatchEvent).toHaveBeenCalledOnce();
    expect(renderer.dispatchEvent).toHaveBeenCalledWith({
      type: "needs-update",
    });
    expect(requestRender).toHaveBeenCalledOnce();
    expect(retries.isBlocked(null, url)).toBe(false);
  });

  it("recovers all failed objects for a URL without extending its deadline", () => {
    vi.useFakeTimers();
    const renderer = buildRenderer();
    renderer.stats.failed = 2;
    const requestRender = vi.fn();
    const retries = createThreeTilesRetryController(
      () => renderer,
      requestRender
    );
    const first = failedTile();
    const replacement = failedTile();

    retries.handleFailure(first, null, { status: 404 });
    vi.advanceTimersByTime(EXHAUSTED_RETRY_TTL_MS / 2);
    retries.handleFailure(replacement, null, { status: 404 });
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(EXHAUSTED_RETRY_TTL_MS / 2);

    expect(first.internal.loadingState).toBe(0);
    expect(replacement.internal.loadingState).toBe(0);
    expect(renderer.stats.failed).toBe(0);
    expect(requestRender).toHaveBeenCalledOnce();
  });

  it("shares one timer across exhaustion deadlines and cancels succeeded resources", () => {
    vi.useFakeTimers();
    const renderer = buildRenderer();
    const requestRender = vi.fn();
    const retries = createThreeTilesRetryController(
      () => renderer,
      requestRender
    );
    const first = failedTile("first.b3dm");
    const second = failedTile("second.b3dm");
    const third = failedTile("third.b3dm");

    retries.handleFailure(first, null, { status: 404 });
    vi.advanceTimersByTime(1_000);
    retries.handleFailure(second, null, { status: 404 });
    retries.handleFailure(third, null, { status: 404 });
    expect(vi.getTimerCount()).toBe(1);
    retries.handleSuccess(first);
    vi.advanceTimersByTime(EXHAUSTED_RETRY_TTL_MS - 1_000);
    expect(requestRender).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);

    expect(first.internal.loadingState).toBe(-1);
    expect(second.internal.loadingState).toBe(0);
    expect(third.internal.loadingState).toBe(0);
    expect(requestRender).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resets consecutive-failure budgets after a successful reload", () => {
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
    expect(vi.getTimerCount()).toBe(1);
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
    expect(vi.getTimerCount()).toBe(1);
    expect(replacement.internal.loadingState).toBe(-1);
  });

  it("allows bounded transient retries again after exhaustion expires", () => {
    vi.useFakeTimers();
    const renderer = buildRenderer();
    const retries = createThreeTilesRetryController(() => renderer, vi.fn());
    const tile = failedTile();
    const url = "https://example.com/transient.b3dm";
    for (let attempt = 0; attempt < MAX_TILE_RETRIES; attempt += 1) {
      retries.handleFailure(tile, url, new Error("status 503"));
      vi.runOnlyPendingTimers();
    }
    expect(retries.handleFailure(tile, url, new Error("status 503"))).toBe(
      "exhausted"
    );
    vi.advanceTimersByTime(EXHAUSTED_RETRY_TTL_MS);
    expect(retries.isBlocked(tile, url)).toBe(false);
    expect(retries.handleFailure(tile, url, new Error("status 503"))).toBe(
      "scheduled"
    );
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

  it.each(["reset", "dispose"] as const)(
    "cancels exhaustion recovery on %s",
    (action) => {
      vi.useFakeTimers();
      const renderer = { ...buildRenderer(), rootLoadingState: -1 };
      const requestRender = vi.fn();
      const retries = createThreeTilesRetryController(
        () => renderer,
        requestRender
      );
      retries.handleFailure(null, "https://example.com/tileset.json", {
        status: 404,
      });

      retries[action]();
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(EXHAUSTED_RETRY_TTL_MS);

      expect(renderer.rootLoadingState).toBe(-1);
      expect(renderer.dispatchEvent).not.toHaveBeenCalled();
      expect(requestRender).not.toHaveBeenCalled();
    }
  );

  it("cancels exhaustion recovery after a successful root load", () => {
    vi.useFakeTimers();
    const renderer = { ...buildRenderer(), rootLoadingState: -1 };
    const requestRender = vi.fn();
    const retries = createThreeTilesRetryController(
      () => renderer,
      requestRender
    );
    const url = "https://example.com/tileset.json";
    retries.handleFailure(null, url, { status: 404 });
    renderer.rootLoadingState = 4;
    retries.handleSuccess(null, url);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(EXHAUSTED_RETRY_TTL_MS);

    expect(renderer.rootLoadingState).toBe(4);
    expect(renderer.dispatchEvent).not.toHaveBeenCalled();
    expect(requestRender).not.toHaveBeenCalled();
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
