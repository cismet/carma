import { describe, expect, it } from "vitest";
import { TILE_CAMERA_PRIORITY } from "../../core/tile-camera-demand";
import { createThreeTilesCascade } from "./three-tiles-runtime-cascade";

import type { RuntimeTile } from "./three-tiles-runtime-types";
import {
  LOADED_LOADING_STATE,
  LOADING_LOADING_STATE,
  PARSING_LOADING_STATE,
  QUEUED_LOADING_STATE,
} from "./three-tiles-runtime-vendor";
import {
  tile,
  createPrefetchFixture,
} from "./three-tiles-runtime-cascade.test-support";

describe("preemption runtime integration", () => {
  it("does not preempt a lower-priority download while its origin has a free slot", () => {
    const fixture = createPrefetchFixture(tile());
    fixture.state.options = { providesTerrain: true };
    const active = tile();
    active.internal.loadingState = LOADING_LOADING_STATE;
    const waiting = tile();
    waiting.internal.loadingState = QUEUED_LOADING_STATE;
    fixture.tiles.loadingTiles.add(active);
    fixture.tiles.loadingTiles.add(waiting);
    fixture.tiles.downloadQueue.maxJobsPerOrigin = 2;
    fixture.dependencies.getTileCameraDemand.mockImplementation((entry) => ({
      required: true,
      receiver: true,
      errorRatio: 2,
      priority:
        entry === waiting
          ? TILE_CAMERA_PRIORITY.FOCUS
          : TILE_CAMERA_PRIORITY.SECONDARY,
    }));
    const cascade = createThreeTilesCascade(
      fixture.state as never,
      fixture.dependencies
    );
    cascade.abortStaleDownloads();
    expect(fixture.tiles.lruCache.remove).not.toHaveBeenCalled();
  });

  it("preempts one same-origin lower-priority job when the origin is full", () => {
    const fixture = createPrefetchFixture(tile());
    fixture.state.options = { providesTerrain: true };
    const active = tile();
    active.internal.loadingState = LOADING_LOADING_STATE;
    const waiting = tile();
    waiting.internal.loadingState = QUEUED_LOADING_STATE;
    fixture.tiles.loadingTiles.add(active);
    fixture.tiles.loadingTiles.add(waiting);
    fixture.tiles.downloadQueue.maxJobsPerOrigin = 1;
    fixture.dependencies.getTileCameraDemand.mockImplementation((entry) => ({
      required: true,
      receiver: true,
      errorRatio: 2,
      priority:
        entry === waiting
          ? TILE_CAMERA_PRIORITY.FOCUS
          : TILE_CAMERA_PRIORITY.SECONDARY,
    }));
    const cascade = createThreeTilesCascade(
      fixture.state as never,
      fixture.dependencies
    );
    // Still-needed offscreen support cannot evict work while it is parked.
    fixture.state.meshCoverageRecovery = true;
    cascade.abortStaleDownloads();
    expect(fixture.tiles.lruCache.remove).not.toHaveBeenCalled();
    fixture.state.meshCoverageRecovery = false;
    fixture.dependencies.getDownloadPreemptionEligibility.mockReturnValue(
      () => false
    );
    cascade.abortStaleDownloads();
    expect(fixture.tiles.lruCache.remove).not.toHaveBeenCalled();
    fixture.dependencies.getDownloadPreemptionEligibility.mockReturnValue(
      () => true
    );
    fixture.dependencies.getTileCameraDemand.mockImplementation(() => ({
      required: true,
      receiver: true,
      errorRatio: 2,
      priority: TILE_CAMERA_PRIORITY.PRIMARY,
    }));
    active.meshRefinement = {
      group: active,
      currentErrorPixels: 8,
      nextErrorPixels: 4,
      visibleAreaPixels: 25,
      benefit: 100,
      provisional: false,
    };
    waiting.meshRefinement = { ...active.meshRefinement, benefit: 1000 };
    cascade.abortStaleDownloads();
    expect(fixture.tiles.lruCache.remove).not.toHaveBeenCalled();
    waiting.meshRefinement = { ...waiting.meshRefinement, group: waiting };
    cascade.abortStaleDownloads();
    expect(fixture.tiles.lruCache.remove).toHaveBeenCalledWith(active);
  });

  it("does not preempt for a higher-priority request on another origin", () => {
    const fixture = createPrefetchFixture(tile());
    fixture.state.options = { providesTerrain: true };
    const active = tile();
    active.internal.loadingState = LOADING_LOADING_STATE;
    const waiting = tile();
    waiting.internal.loadingState = QUEUED_LOADING_STATE;
    fixture.tiles.loadingTiles.add(active);
    fixture.tiles.loadingTiles.add(waiting);
    fixture.tiles.downloadQueue.maxJobsPerOrigin = 1;
    const first = {
      items: [active],
      currJobs: 1,
      has: (entry: RuntimeTile) => entry === active,
    };
    const second = {
      items: [waiting],
      currJobs: 0,
      has: (entry: RuntimeTile) => entry === waiting,
    };
    fixture.tiles.downloadQueue.originQueues = new Map([
      ["first", first],
      ["second", second],
    ]);
    fixture.dependencies.getTileCameraDemand.mockImplementation((entry) => ({
      required: true,
      receiver: true,
      errorRatio: 2,
      priority:
        entry === waiting
          ? TILE_CAMERA_PRIORITY.FOCUS
          : TILE_CAMERA_PRIORITY.SECONDARY,
    }));
    const cascade = createThreeTilesCascade(
      fixture.state as never,
      fixture.dependencies
    );
    cascade.abortStaleDownloads();
    expect(fixture.tiles.lruCache.remove).not.toHaveBeenCalled();
  });

  it("uses one queued request to preempt only one of two saturated lower-priority jobs", () => {
    const fixture = createPrefetchFixture(tile());
    fixture.state.options = { providesTerrain: true };
    const active = tile();
    active.internal.loadingState = LOADING_LOADING_STATE;
    const secondActive = tile();
    secondActive.internal.loadingState = LOADING_LOADING_STATE;
    const waiting = tile();
    waiting.internal.loadingState = QUEUED_LOADING_STATE;
    [active, secondActive, waiting].forEach((entry) =>
      fixture.tiles.loadingTiles.add(entry)
    );
    fixture.tiles.downloadQueue.maxJobsPerOrigin = 2;
    fixture.dependencies.getTileCameraDemand.mockImplementation((entry) => ({
      required: true,
      receiver: true,
      errorRatio: 2,
      priority:
        entry === waiting
          ? TILE_CAMERA_PRIORITY.FOCUS
          : TILE_CAMERA_PRIORITY.SECONDARY,
    }));
    const cascade = createThreeTilesCascade(
      fixture.state as never,
      fixture.dependencies
    );
    cascade.abortStaleDownloads();
    expect(fixture.tiles.lruCache.remove).toHaveBeenCalledTimes(1);
  });

  it("does not preempt an offscreen fetch required by another camera", () => {
    const fixture = createPrefetchFixture(tile());
    fixture.state.options = { providesTerrain: true };
    const visible = tile();
    visible.internal.loadingState = QUEUED_LOADING_STATE;
    const otherCamera = tile();
    otherCamera.internal.loadingState = LOADING_LOADING_STATE;
    fixture.tiles.loadingTiles.add(visible);
    fixture.tiles.loadingTiles.add(otherCamera);
    fixture.dependencies.isTileInMainView.mockImplementation(
      (t) => t === visible
    );
    fixture.dependencies.getTileCameraDemand.mockImplementation((t) => ({
      required: t === otherCamera,
      receiver: false,
      errorRatio: 2,
      priority: TILE_CAMERA_PRIORITY.PRIMARY,
    }));
    const cascade = createThreeTilesCascade(
      fixture.state as unknown as Parameters<typeof createThreeTilesCascade>[0],
      fixture.dependencies
    );
    cascade.abortStaleDownloads();
    expect(fixture.tiles.lruCache.remove).not.toHaveBeenCalled();
  });

  it.each([
    [TILE_CAMERA_PRIORITY.SECONDARY, TILE_CAMERA_PRIORITY.PRIMARY, true],
    [TILE_CAMERA_PRIORITY.PRIMARY, TILE_CAMERA_PRIORITY.FOCUS, true],
    [TILE_CAMERA_PRIORITY.FOCUS, TILE_CAMERA_PRIORITY.PRIMARY, false],
  ])(
    "preempts rank %s fetch for waiting rank %s only when it is lower (%s)",
    (activePriority, waitingPriority, preempted) => {
      const fixture = createPrefetchFixture(tile());
      fixture.state.options = { providesTerrain: true };
      fixture.tiles.downloadQueue.maxJobsPerOrigin = 1;
      fixture.dependencies.isTileInMainView.mockReturnValue(false);
      const active = tile();
      active.internal.loadingState = LOADING_LOADING_STATE;
      const waiting = tile();
      waiting.internal.loadingState = QUEUED_LOADING_STATE;
      const parsed = tile();
      parsed.internal.loadingState = PARSING_LOADING_STATE;
      const loaded = tile(true);
      [active, waiting, parsed, loaded].forEach((entry) =>
        fixture.tiles.loadingTiles.add(entry)
      );
      fixture.dependencies.getTileCameraDemand.mockImplementation((entry) => ({
        required: true,
        receiver: true,
        errorRatio: 2,
        priority: entry === waiting ? waitingPriority : activePriority,
      }));
      const cascade = createThreeTilesCascade(
        fixture.state as unknown as Parameters<
          typeof createThreeTilesCascade
        >[0],
        fixture.dependencies
      );
      cascade.abortStaleDownloads();
      expect(
        fixture.tiles.lruCache.remove.mock.calls.map(([entry]) => entry)
      ).toEqual(preempted ? [active] : []);
      expect(cascade.isTileRequestNeeded(active)).toBe(true);
      expect(parsed.internal.loadingState).toBe(PARSING_LOADING_STATE);
      expect(loaded.internal.loadingState).toBe(LOADED_LOADING_STATE);
    }
  );
});
