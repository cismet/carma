import { Group, OrthographicCamera } from "three";
import { describe, expect, it } from "vitest";
import { TILE_CAMERA_PRIORITY } from "../../core/tile-camera-demand";
import { createThreeTilesCascade } from "./three-tiles-runtime-cascade";

import {
  LOADED_LOADING_STATE,
  LOADING_LOADING_STATE,
  PARSING_LOADING_STATE,
  QUEUED_LOADING_STATE,
  UNLOADED_LOADING_STATE,
} from "./three-tiles-runtime-vendor";
import {
  tile,
  createPrefetchFixture,
} from "./three-tiles-runtime-cascade.test-support";

describe("cancellation runtime integration", () => {
  it("drains earlier solar requests in every phase but releases them under memory pressure", () => {
    const fixture = createPrefetchFixture(tile());
    const state = fixture.state as unknown as Parameters<
      typeof createThreeTilesCascade
    >[0];
    state.options = { providesTerrain: true };
    state.shadowView = {
      camera: new OrthographicCamera(),
      shadowMapSize: { width: 1024, height: 1024 },
    };
    state.shadowSelectionEnabled = true;
    fixture.dependencies.isTileInMainView.mockReturnValue(false);
    const retained = [
      QUEUED_LOADING_STATE,
      LOADING_LOADING_STATE,
      PARSING_LOADING_STATE,
    ].map((phase) => {
      const t = tile();
      t.internal.loadingState = phase;
      fixture.tiles.loadingTiles.add(t);
      state.retainedShadowRequests.add(t);
      return t;
    });
    const cascade = createThreeTilesCascade(state, fixture.dependencies);
    cascade.abortStaleDownloads();
    expect(fixture.tiles.lruCache.remove).not.toHaveBeenCalled();
    for (const t of retained)
      expect(cascade.getTileRequestNeed(t)).toBe("previous-sun-direction");
    state.meshCoverageRecovery = true;
    cascade.abortStaleDownloads();
    expect(fixture.tiles.lruCache.remove).not.toHaveBeenCalled();
    state.memoryAdmissionPaused = true;
    cascade.abortStaleDownloads();
    expect(fixture.tiles.lruCache.remove).toHaveBeenCalledTimes(3);
    expect(state.retainedShadowRequests.size).toBe(0);
  });

  it("preempts downloading support while retaining its needed parse buffer", () => {
    const fixture = createPrefetchFixture(tile());
    fixture.tiles.downloadQueue.maxJobsPerOrigin = 1;
    fixture.state.options = { providesTerrain: true };
    const visible = tile();
    visible.internal.loadingState = QUEUED_LOADING_STATE;
    const downloading = tile();
    downloading.internal.loadingState = LOADING_LOADING_STATE;
    const parsing = tile();
    parsing.internal.loadingState = PARSING_LOADING_STATE;
    fixture.state.meshRefinementSupport.add(downloading);
    fixture.state.meshRefinementSupport.add(parsing);
    [visible, downloading, parsing].forEach((t) =>
      fixture.tiles.loadingTiles.add(t)
    );
    fixture.dependencies.isTileInMainView.mockImplementation(
      (t) => t === visible
    );
    const cascade = createThreeTilesCascade(
      fixture.state as unknown as Parameters<typeof createThreeTilesCascade>[0],
      fixture.dependencies
    );
    cascade.abortStaleDownloads();
    expect(
      fixture.tiles.lruCache.remove.mock.calls.map(([entry]) => entry)
    ).toEqual([downloading]);
    expect(cascade.isTileRequestNeeded(parsing)).toBe(true);
    expect(parsing.internal.loadingState).toBe(PARSING_LOADING_STATE);
  });

  it("discards a coarse pending REPLACE payload already covered by drawn children", () => {
    const children = [tile(true), tile(true)];
    children.forEach((child) => {
      child.engineData!.scene = new Group();
    });
    const coarse = tile(false, children);
    coarse.internal.loadingState = PARSING_LOADING_STATE;
    const fixture = createPrefetchFixture(coarse);
    fixture.state.options = { providesTerrain: true };
    children.forEach((t) => fixture.tiles.visibleTiles.add(t));
    fixture.tiles.loadingTiles.add(coarse);
    const cascade = createThreeTilesCascade(
      fixture.state as unknown as Parameters<typeof createThreeTilesCascade>[0],
      fixture.dependencies
    );
    cascade.abortStaleDownloads();
    expect(fixture.tiles.lruCache.remove).toHaveBeenCalledWith(coarse);
    expect(fixture.tiles.visibleTiles.size).toBe(2);
  });

  it.each([
    ["queued", QUEUED_LOADING_STATE],
    ["downloading", LOADING_LOADING_STATE],
    ["parsing", PARSING_LOADING_STATE],
  ] as const)(
    "cancels off-view %s work back to a retryable state",
    (_phase, state) => {
      const parent = tile(true);
      const obsolete = tile();
      obsolete.parent = parent;
      obsolete.internal.loadingState = state;
      const fixture = createPrefetchFixture(parent);
      fixture.tiles.loadingTiles.add(obsolete);
      fixture.dependencies.isTileInMainView.mockReturnValue(false);

      const cascade = createThreeTilesCascade(
        fixture.state as unknown as Parameters<
          typeof createThreeTilesCascade
        >[0],
        fixture.dependencies
      );
      cascade.abortStaleDownloads();

      expect(fixture.tiles.lruCache.remove).toHaveBeenCalledWith(obsolete);
      expect(obsolete.internal.loadingState).toBe(UNLOADED_LOADING_STATE);
    }
  );

  it("retains current-target coverage while cancelling an irrelevant pending tile", () => {
    const demanded = tile(true);
    const relevant = tile();
    const irrelevant = tile();
    demanded.children = [relevant, irrelevant];
    relevant.parent = demanded;
    irrelevant.parent = demanded;
    relevant.internal.loadingState = LOADING_LOADING_STATE;
    irrelevant.internal.loadingState = LOADING_LOADING_STATE;
    const fixture = createPrefetchFixture(demanded);
    fixture.state.requestedErrorTarget = 4;
    fixture.state.effectiveErrorTarget = 20;
    fixture.tiles.loadingTiles.add(relevant);
    fixture.tiles.loadingTiles.add(irrelevant);
    fixture.dependencies.isTileInMainView.mockImplementation(
      (entry) => entry === relevant
    );
    fixture.dependencies.getTileScreenError.mockImplementation((entry) =>
      entry === demanded ? 10 : 0
    );

    const cascade = createThreeTilesCascade(
      fixture.state as unknown as Parameters<typeof createThreeTilesCascade>[0],
      fixture.dependencies
    );
    cascade.abortStaleDownloads();

    expect(fixture.tiles.lruCache.remove).toHaveBeenCalledTimes(1);
    expect(fixture.tiles.lruCache.remove).toHaveBeenCalledWith(irrelevant);
    expect(relevant.internal.loadingState).toBe(LOADING_LOADING_STATE);
  });

  it.each([
    [2, false],
    [1, true],
  ] as const)(
    "uses other-camera parent error ratio %s as a strict refinement boundary",
    (errorRatio, cancelled) => {
      const parent = tile(true);
      const pending = tile();
      pending.parent = parent;
      pending.internal.loadingState = LOADING_LOADING_STATE;
      const fixture = createPrefetchFixture(parent);
      fixture.tiles.loadingTiles.add(pending);
      fixture.dependencies.isTileInMainView.mockReturnValue(false);
      fixture.dependencies.getTileCameraDemand.mockImplementation((entry) => ({
        required: entry === pending,
        receiver: false,
        errorRatio: entry === parent ? errorRatio : 2,
        priority: TILE_CAMERA_PRIORITY.PRIMARY,
      }));
      const cascade = createThreeTilesCascade(
        fixture.state as unknown as Parameters<
          typeof createThreeTilesCascade
        >[0],
        fixture.dependencies
      );

      cascade.abortStaleDownloads();

      expect(fixture.tiles.lruCache.remove).toHaveBeenCalledTimes(
        cancelled ? 1 : 0
      );
    }
  );

  it("never evicts already loaded content during stale-work cancellation", () => {
    const loaded = tile(true);
    const fixture = createPrefetchFixture(loaded);
    fixture.tiles.loadingTiles.add(loaded);
    fixture.dependencies.isTileInMainView.mockReturnValue(false);
    const cascade = createThreeTilesCascade(
      fixture.state as unknown as Parameters<typeof createThreeTilesCascade>[0],
      fixture.dependencies
    );

    cascade.abortStaleDownloads();

    expect(fixture.tiles.lruCache.remove).not.toHaveBeenCalled();
    expect(loaded.internal.loadingState).toBe(LOADED_LOADING_STATE);
  });
});
