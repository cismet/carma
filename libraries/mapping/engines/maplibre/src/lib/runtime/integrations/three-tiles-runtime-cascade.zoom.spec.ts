import { describe, expect, it, vi } from "vitest";
import { TILE_CAMERA_PRIORITY } from "../../core/tile-camera-demand";

import {
  LOADED_LOADING_STATE,
  LOADING_LOADING_STATE,
  UNLOADED_LOADING_STATE,
} from "./three-tiles-runtime-vendor";
import {
  tile,
  createPrefetchFixture,
} from "./three-tiles-runtime-cascade.test-support";

describe("zoom runtime integration", () => {
  it.each([1, 2] as const)(
    "admits one native request at a time and no more than %i payload levels",
    async (levels) => {
      const third = tile();
      const second = tile(false, [third]);
      const first = tile(false, [second]);
      const sibling = tile();
      const root = tile(true, [first, sibling]);
      const fixture = createPrefetchFixture(root);
      const task = fixture.start(levels);
      expect(
        fixture.tiles.requestTileContents.mock.calls.map(([entry]) => entry)
      ).toEqual([first]);
      expect(first.zoomPrefetch).toBe(true);
      await fixture.complete(first);
      expect(
        fixture.tiles.requestTileContents.mock.calls.map(([entry]) => entry)
      ).toEqual([first, sibling]);
      expect(first.zoomPrefetch).toBe(false);
      await fixture.complete(sibling);
      if (levels === 2) await fixture.complete(second);
      await task;
      expect(
        fixture.tiles.requestTileContents.mock.calls.map(([entry]) => entry)
      ).toEqual(levels === 2 ? [first, sibling, second] : [first, sibling]);
      expect(third.internal.loadingState).toBe(UNLOADED_LOADING_STATE);
      expect(fixture.tiles.markTileUsed).toHaveBeenCalledTimes(
        levels === 2 ? 3 : 2
      );
      expect(fixture.tiles.stats.downloading).toBe(0);
    }
  );

  it("counts payload levels, not intervening metadata nodes", async () => {
    const third = tile();
    const second = tile(false, [third]);
    const metadata = tile(true, [second], true);
    const first = tile(false, [metadata]);
    const fixture = createPrefetchFixture(tile(true, [first]));
    const task = fixture.start();
    await fixture.complete(first);
    await fixture.complete(second);
    await task;
    expect(
      fixture.tiles.requestTileContents.mock.calls.map(([entry]) => entry)
    ).toEqual([first, second]);
    expect(third.internal.loadingState).toBe(UNLOADED_LOADING_STATE);
  });

  it.each(["queued", "downloading", "parsing"] as const)(
    "never competes with foreground %s work",
    async (phase) => {
      const fixture = createPrefetchFixture(tile(true, [tile()]));
      fixture.tiles.stats[phase] = 1;
      await fixture.start();
      expect(fixture.tiles.requestTileContents).not.toHaveBeenCalled();
    }
  );

  it.each(["memory", "download-queue", "parse-queue"] as const)(
    "obeys %s admission limits",
    async (gate) => {
      const fixture = createPrefetchFixture(tile(true, [tile()]));
      if (gate === "memory") fixture.tiles.lruCache.cachedBytes = 800;
      if (gate === "download-queue")
        fixture.tiles.downloadQueue.maxJobsPerOrigin = 0;
      if (gate === "parse-queue") fixture.tiles.parseQueue.maxJobs = 0;
      await fixture.start();
      expect(fixture.tiles.requestTileContents).not.toHaveBeenCalled();
    }
  );

  it("does not speculate the missing normal-target payload before base coverage exists", async () => {
    const root = tile(false, [tile()]);
    const fixture = createPrefetchFixture(root);
    await fixture.start();
    expect(fixture.tiles.requestTileContents).not.toHaveBeenCalled();
  });

  it("rechecks queue pressure after each completed payload", async () => {
    const first = tile();
    const second = tile();
    const fixture = createPrefetchFixture(tile(true, [first, second]));
    const task = fixture.start();
    fixture.tiles.stats.queued = 1;
    await fixture.complete(first);
    await task;
    expect(fixture.tiles.requestTileContents).toHaveBeenCalledOnce();
    expect(first.internal.loadingState).toBe(LOADED_LOADING_STATE);
  });

  it.each(["foreground", "memory"] as const)(
    "rechecks %s pressure after a metadata traversal yield before admitting another payload",
    async (pressure) => {
      vi.useFakeTimers();
      // The root and thirty already-discovered metadata nodes precede the
      // next payload, placing admission immediately after the traversal yield.
      const entry = tile();
      const metadata = Array.from({ length: 30 }, () => tile(true, [], true));
      const fixture = createPrefetchFixture(tile(true, [...metadata, entry]));
      try {
        const task = fixture.start();
        expect(
          fixture.tiles.ensureChildrenArePreprocessed
        ).toHaveBeenCalledTimes(31);
        expect(vi.getTimerCount()).toBe(1);
        expect(fixture.tiles.requestTileContents).not.toHaveBeenCalled();
        if (pressure === "foreground") fixture.tiles.stats.queued = 1;
        else fixture.tiles.lruCache.cachedBytes = 800;
        await vi.advanceTimersByTimeAsync(0);
        expect(fixture.tiles.requestTileContents).not.toHaveBeenCalled();
        await task;
        expect(entry.internal.loadingState).toBe(UNLOADED_LOADING_STATE);
      } finally {
        fixture.controller.abort();
        vi.useRealTimers();
      }
    }
  );

  it("cancels only its pending payload, retaining earlier completed data and unrelated work", async () => {
    const first = tile();
    const second = tile();
    const unrelated = tile();
    unrelated.internal.loadingState = LOADING_LOADING_STATE;
    const fixture = createPrefetchFixture(tile(true, [first, second]));
    const task = fixture.start();
    await fixture.complete(first);
    expect(second.zoomPrefetch).toBe(true);
    fixture.controller.abort();
    await task;
    expect(
      fixture.tiles.lruCache.remove.mock.calls.map(([entry]) => entry)
    ).toEqual([second]);
    expect(first.internal.loadingState).toBe(LOADED_LOADING_STATE);
    expect(unrelated.internal.loadingState).toBe(LOADING_LOADING_STATE);
    expect(second.zoomPrefetch).toBe(false);
  });

  it.each(["camera", "receiver", "foreground"] as const)(
    "keeps a pending payload adopted by %s demand on zoomend",
    async (owner) => {
      const entry = tile();
      const root = tile(true, [entry]);
      const fixture = createPrefetchFixture(root);
      const task = fixture.start();
      if (owner === "camera")
        fixture.dependencies.getTileCameraDemand.mockReturnValue({
          required: true,
          receiver: false,
          errorRatio: 0,
          priority: TILE_CAMERA_PRIORITY.PRIMARY,
        });
      if (owner === "receiver") entry.shadowReceiverCurrent = true;
      if (owner === "foreground")
        fixture.dependencies.getTileScreenError.mockReturnValue(4);
      fixture.controller.abort();
      expect(fixture.tiles.lruCache.remove).not.toHaveBeenCalled();
      await fixture.complete(entry);
      await task;
      expect(entry.internal.loadingState).toBe(LOADED_LOADING_STATE);
      expect(entry.zoomPrefetch).toBe(false);
    }
  );

  it("does not discard a just-completed payload when zoomend wins the continuation race", async () => {
    const entry = tile();
    const fixture = createPrefetchFixture(tile(true, [entry]));
    const task = fixture.start();
    const completed = fixture.complete(entry);
    fixture.controller.abort();
    await completed;
    await task;
    expect(fixture.tiles.lruCache.remove).not.toHaveBeenCalled();
    expect(entry.internal.loadingState).toBe(LOADED_LOADING_STATE);
  });

  it("never starts with an already aborted signal", async () => {
    const fixture = createPrefetchFixture(tile(true, [tile()]));
    fixture.controller.abort();
    await fixture.start();
    expect(fixture.tiles.requestTileContents).not.toHaveBeenCalled();
  });

  it("caps each gesture at sixteen speculative requests", async () => {
    const entries = Array.from({ length: 20 }, () => tile());
    const fixture = createPrefetchFixture(tile(true, entries));
    const task = fixture.start();
    for (const entry of entries.slice(0, 16)) await fixture.complete(entry);
    await task;
    expect(fixture.tiles.requestTileContents).toHaveBeenCalledTimes(16);
    expect(entries[16].internal.loadingState).toBe(UNLOADED_LOADING_STATE);
  });
});
