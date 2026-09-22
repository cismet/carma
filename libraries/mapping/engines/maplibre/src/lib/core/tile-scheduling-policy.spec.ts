// @vitest-environment node
// @vitest-environment node
// @vitest-environment node
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { TILE_CAMERA_PRIORITY } from "./tile-camera-demand";
import {
  decideTileRequestAction,
  isTileQueueEntryRunnable,
  resolveMeshStageTarget,
  resolveTileDownloadConcurrency,
  resolveTileParseConcurrency,
  resolveTileRequestPriority,
  TILE_REQUEST_ACTION,
} from "./tile-scheduling-policy";

const limits = Object.freeze({
  mesh: 16,
  motion: 8,
  backlogSoft: 8,
  backlogHard: 16,
  backgroundBacklog: 4,
  terrainBootstrap: 2,
});
const downloads = Object.freeze({
  active: 16,
  providesTerrain: true,
  moving: false,
  baseCoverageReady: true,
  parseBacklog: 0,
  foregroundBacklog: 0,
  sharedTerrainLoading: false,
});

describe("tile scheduling decisions", () => {
  it("keeps repair ahead of every ordinary camera lane", () => {
    for (const priority of [-Infinity, -1, 0, 1, 2]) {
      expect(
        resolveTileRequestPriority(
          Object.freeze({
            replacementSupport: true,
            cameraPriority: priority,
            motionPrefetch: true,
            observerVisible: true,
            selectedShadowReceiver: true,
            shadowWithoutSelection: true,
          })
        )
      ).toBe(TILE_CAMERA_PRIORITY.COVERAGE_REPAIR);
    }
  });
  it("does not promote an extra receiver to the observer lane", () => {
    const input = Object.freeze({
      replacementSupport: false,
      cameraPriority: TILE_CAMERA_PRIORITY.SECONDARY,
      motionPrefetch: false,
      observerVisible: false,
      selectedShadowReceiver: false,
      shadowWithoutSelection: false,
    });
    expect(resolveTileRequestPriority(input)).toBe(
      TILE_CAMERA_PRIORITY.SECONDARY
    );
    expect(
      resolveTileRequestPriority({ ...input, observerVisible: true })
    ).toBe(TILE_CAMERA_PRIORITY.PRIMARY);
    expect(
      resolveTileRequestPriority({
        ...input,
        cameraPriority: TILE_CAMERA_PRIORITY.FOCUS,
        observerVisible: true,
      })
    ).toBe(TILE_CAMERA_PRIORITY.FOCUS);
  });
  it.each(["selectedShadowReceiver", "shadowWithoutSelection"] as const)(
    "keeps visible iterations ahead of offscreen shadows (%s) without demoting replacement siblings",
    (shadowRole) => {
      const shadow = {
        replacementSupport: false,
        cameraPriority: Number.NEGATIVE_INFINITY,
        motionPrefetch: false,
        observerVisible: false,
        selectedShadowReceiver: false,
        shadowWithoutSelection: false,
        [shadowRole]: true,
      };
      const shadowPriority = resolveTileRequestPriority(shadow);
      const visiblePriority = resolveTileRequestPriority({
        ...shadow,
        observerVisible: true,
      });
      const familyPriority = resolveTileRequestPriority({
        ...shadow,
        replacementSupport: true,
      });
      expect(shadowPriority).toBe(TILE_CAMERA_PRIORITY.SECONDARY);
      expect(visiblePriority).toBe(TILE_CAMERA_PRIORITY.PRIMARY);
      expect(familyPriority).toBe(TILE_CAMERA_PRIORITY.COVERAGE_REPAIR);
      expect(familyPriority).toBeGreaterThan(visiblePriority);
      expect(visiblePriority).toBeGreaterThan(shadowPriority);
    }
  );
  it("runs a ready foreground parse even while a higher-rank download is pending", () => {
    expect(
      isTileQueueEntryRunnable({
        foregroundEligible: true,
        priority: 1,
        motionPrefetch: false,
        highestPendingPriority: 3,
        moving: true,
      })
    ).toBe(true);
    expect(
      isTileQueueEntryRunnable({
        foregroundEligible: true,
        priority: -1,
        motionPrefetch: true,
        highestPendingPriority: 3,
        moving: false,
      })
    ).toBe(false);
    expect(
      isTileQueueEntryRunnable({
        foregroundEligible: true,
        priority: -1,
        motionPrefetch: true,
        highestPendingPriority: -1,
        moving: true,
      })
    ).toBe(true);
  });
  it("parks background work until both motion and foreground demand end", () => {
    for (const moving of [false, true])
      for (const highestPendingPriority of [-Infinity, 0, 3]) {
        expect(
          isTileQueueEntryRunnable({
            foregroundEligible: false,
            priority: -Infinity,
            motionPrefetch: false,
            highestPendingPriority,
            moving,
          })
        ).toBe(!moving && highestPendingPriority === -Infinity);
      }
  });
  it("retains base coverage admission and prevents parked buffers starving foreground downloads", () => {
    expect(
      resolveTileDownloadConcurrency(
        { ...downloads, parseBacklog: 100, foregroundBacklog: 16 },
        limits
      )
    ).toBe(0);
    expect(
      resolveTileDownloadConcurrency(
        { ...downloads, parseBacklog: 100, foregroundBacklog: 0 },
        limits
      )
    ).toBe(4);
    expect(
      resolveTileDownloadConcurrency(
        {
          ...downloads,
          baseCoverageReady: false,
          parseBacklog: 100,
          foregroundBacklog: 100,
        },
        limits
      )
    ).toBe(16);
  });
  it("never exceeds the active network limit, including pauses and camera motion", () => {
    for (const active of [0, 1, 4, 8, 16, 32])
      for (const moving of [false, true])
        for (const providesTerrain of [false, true])
          for (const parseBacklog of [0, 8, 16, 64]) {
            const result = resolveTileDownloadConcurrency(
              {
                ...downloads,
                active,
                moving,
                providesTerrain,
                parseBacklog,
                foregroundBacklog: parseBacklog,
              },
              limits
            );
            expect(result).toBeGreaterThanOrEqual(0);
            expect(result).toBeLessThanOrEqual(active);
            if (providesTerrain && moving)
              expect(result).toBeLessThanOrEqual(limits.motion);
          }
  });
  it("reserves bandwidth for raster terrain without serializing terrain-providing mesh downloads", () => {
    expect(
      resolveTileDownloadConcurrency(
        { ...downloads, providesTerrain: false, sharedTerrainLoading: true },
        limits
      )
    ).toBe(2);
    expect(
      resolveTileDownloadConcurrency(
        { ...downloads, moving: true, sharedTerrainLoading: true },
        limits
      )
    ).toBe(8);
    expect(
      resolveTileParseConcurrency({
        paused: false,
        moving: true,
        zooming: true,
        providesTerrain: true,
        normal: 4,
        motionLimit: 2,
      })
    ).toBe(1);
    expect(
      resolveTileParseConcurrency({
        paused: true,
        moving: false,
        zooming: false,
        providesTerrain: false,
        normal: 4,
        motionLimit: 2,
      })
    ).toBe(0);
  });
  it("cancels obsolete work without consuming a preemption slot, and never preempts metadata or parsing", () => {
    const input = Object.freeze({
      needed: true,
      downloading: true,
      metadata: false,
      priority: 1,
      highestWaitingPriority: 3,
    });
    expect(decideTileRequestAction(input)).toBe(TILE_REQUEST_ACTION.PREEMPT);
    expect(decideTileRequestAction({ ...input, needed: false })).toBe(
      TILE_REQUEST_ACTION.OBSOLETE
    );
    for (const patch of [
      { metadata: true },
      { downloading: false },
      { priority: 3 },
      { highestWaitingPriority: undefined },
    ])
      expect(decideTileRequestAction({ ...input, ...patch })).toBe(
        TILE_REQUEST_ACTION.KEEP
      );
  });
  it.each([false, true])(
    "hands an explicit cold cascade to idle after observer readiness (shadows=%s)",
    (shadowView) => {
      const ready = vi.fn(() => true);
      const input = {
        shadowView,
        minimumTarget: 4,
        initialTarget: 96,
        initialReady: false,
        reserveBeforeIdle: false,
        currentTarget: 96,
        handoverTarget: 8,
        handoverReady: false,
        firstImageReady: false,
      };
      expect(resolveMeshStageTarget(input, ready)).toBe(96);
      expect(
        resolveMeshStageTarget({ ...input, firstImageReady: true }, ready)
      ).toBe(8);
      expect(
        resolveMeshStageTarget(
          {
            ...input,
            firstImageReady: true,
            handoverReady: true,
            initialReady: true,
          },
          ready
        )
      ).toBe(4);
      expect(
        resolveMeshStageTarget(
          { ...input, firstImageReady: true, minimumTarget: 12 },
          ready
        )
      ).toBe(12);
    }
  );
  it("keeps stage readiness lazy and never adds a second shadow publication gate", () => {
    const ready = vi.fn(() => false);
    const input = Object.freeze({
      shadowView: true,
      minimumTarget: 1,
      initialTarget: 16,
      initialReady: false,
      reserveBeforeIdle: true,
      currentTarget: 8,
    });
    expect(resolveMeshStageTarget(input, ready)).toBe(1);
    expect(ready).not.toHaveBeenCalled();
    expect(resolveMeshStageTarget({ ...input, shadowView: false }, ready)).toBe(
      16
    );
    expect(ready).not.toHaveBeenCalled();
    expect(
      resolveMeshStageTarget(
        {
          ...input,
          shadowView: false,
          initialReady: true,
          reserveBeforeIdle: false,
        },
        (error) => error === 8
      )
    ).toBe(4);
    expect(
      resolveMeshStageTarget(
        {
          ...input,
          shadowView: false,
          initialReady: true,
          reserveBeforeIdle: false,
        },
        ready
      )
    ).toBe(8);
  });
});
