// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { TILE_CAMERA_PRIORITY } from "./tile-camera-demand";
import {
  compareTileRequestOrder,
  decideTileRequestAction,
  resolveTileQueueDecision,
  resolveTileRequestAdmission,
  TILE_QUEUE_ACTION,
  TILE_QUEUE_REASON,
  TILE_QUEUE_STAGE,
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
  it("keeps visible family support in its owner camera lane", () => {
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
      ).toBe(Math.max(priority, TILE_CAMERA_PRIORITY.PRIMARY));
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
    "keeps visible iterations ahead of offscreen shadows and replacement siblings (%s)",
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
      expect(familyPriority).toBe(TILE_CAMERA_PRIORITY.SECONDARY);
      expect(visiblePriority).toBeGreaterThan(familyPriority);
      expect(
        resolveTileRequestPriority({
          ...shadow,
          replacementSupport: true,
          cameraPriority: TILE_CAMERA_PRIORITY.FOCUS,
        })
      ).toBe(TILE_CAMERA_PRIORITY.FOCUS);
      expect(visiblePriority).toBeGreaterThan(shadowPriority);
    }
  );
  it("runs a ready foreground parse even while a higher-rank download is pending", () => {
    expect(
      resolveTileQueueDecision({
        admission: TILE_QUEUE_REASON.CURRENT_DEMAND,
        foregroundEligible: true,
        priority: 1,
        motionPrefetch: false,
        highestPendingPriority: 3,
        moving: true,
      }).action
    ).toBe(TILE_QUEUE_ACTION.RUN);
    expect(
      resolveTileQueueDecision({
        admission: TILE_QUEUE_REASON.CURRENT_DEMAND,
        foregroundEligible: true,
        priority: -1,
        motionPrefetch: true,
        highestPendingPriority: 3,
        moving: false,
      }).action
    ).toBe(TILE_QUEUE_ACTION.PARK);
    expect(
      resolveTileQueueDecision({
        admission: TILE_QUEUE_REASON.CURRENT_DEMAND,
        foregroundEligible: true,
        priority: -1,
        motionPrefetch: true,
        highestPendingPriority: -1,
        moving: true,
      }).action
    ).toBe(TILE_QUEUE_ACTION.RUN);
  });
  it("parks background work until motion, foreground demand and viewport recovery end", () => {
    for (const stage of Object.values(TILE_QUEUE_STAGE))
      for (const needed of [false, true])
        for (const coverageFill of [false, true]) {
          const admission = resolveTileRequestAdmission({
            stage,
            needed,
            coverageFill,
            coverageRecovery: true,
          });
          const decision = resolveTileQueueDecision({
            admission,
            foregroundEligible: false,
            priority: -Infinity,
            motionPrefetch: false,
            highestPendingPriority: -Infinity,
            moving: false,
          });
          expect(decision).toEqual(
            !needed
              ? {
                  action: TILE_QUEUE_ACTION.DISCARD,
                  reason: TILE_QUEUE_REASON.NO_CURRENT_DEMAND,
                }
              : stage === TILE_QUEUE_STAGE.DOWNLOAD && !coverageFill
              ? {
                  action: TILE_QUEUE_ACTION.PARK,
                  reason: TILE_QUEUE_REASON.VIEWPORT_FILL_FIRST,
                }
              : {
                  action: TILE_QUEUE_ACTION.RUN,
                  reason: TILE_QUEUE_REASON.IDLE_RESERVE,
                }
          );
        }
    for (const moving of [false, true])
      for (const highestPendingPriority of [-Infinity, 0, 3]) {
        expect(
          resolveTileQueueDecision({
            admission: TILE_QUEUE_REASON.CURRENT_DEMAND,
            foregroundEligible: false,
            priority: -Infinity,
            motionPrefetch: false,
            highestPendingPriority,
            moving,
          }).action
        ).toBe(
          !moving && highestPendingPriority === -Infinity
            ? TILE_QUEUE_ACTION.RUN
            : TILE_QUEUE_ACTION.PARK
        );
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
  it("orders visible benefit within a camera lane but only preempts for substantial independent gains", () => {
    const rank = TILE_CAMERA_PRIORITY.PRIMARY;
    expect(
      compareTileRequestOrder(rank, rank, 72 * 100000, 4 * 100000)
    ).toBeGreaterThan(0);
    expect(
      compareTileRequestOrder(rank, rank, 4 * 100000, 12 * 10000)
    ).toBeGreaterThan(0);
    expect(
      compareTileRequestOrder(rank, TILE_CAMERA_PRIORITY.FOCUS, 1e9, 1)
    ).toBeLessThan(0);
    expect(
      compareTileRequestOrder(TILE_CAMERA_PRIORITY.VIEWPORT_FILL, rank, 0, 1e9)
    ).toBeGreaterThan(0);
    const input = {
      needed: true,
      downloading: true,
      metadata: false,
      priority: rank,
      highestWaitingPriority: rank,
      benefit: 100,
      highestWaitingBenefit: 125,
    };
    expect(decideTileRequestAction(input)).toBe(TILE_REQUEST_ACTION.KEEP);
    expect(
      decideTileRequestAction({ ...input, highestWaitingBenefit: 126 })
    ).toBe(TILE_REQUEST_ACTION.PREEMPT);
    expect(
      decideTileRequestAction({
        ...input,
        highestWaitingBenefit: 10000,
        sameRefinementGroup: true,
      })
    ).toBe(TILE_REQUEST_ACTION.KEEP);
    expect(
      decideTileRequestAction({ ...input, highestWaitingBenefit: Number.NaN })
    ).toBe(TILE_REQUEST_ACTION.KEEP);
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
      { sameRefinementGroup: true },
    ])
      expect(decideTileRequestAction({ ...input, ...patch })).toBe(
        TILE_REQUEST_ACTION.KEEP
      );
  });
  it.each([false, true])(
    "hands an explicit cold cascade to independent idle families (shadows=%s)",
    (shadowView) => {
      const input = {
        shadowView,
        minimumTarget: 4,
        initialTarget: 96,
        handoverTarget: 8,
        handoverReady: false,
        firstImageReady: false,
      };
      expect(resolveMeshStageTarget(input)).toBe(96);
      expect(resolveMeshStageTarget({ ...input, firstImageReady: true })).toBe(
        8
      );
      expect(resolveMeshStageTarget({ ...input, handoverReady: true })).toBe(4);
      expect(
        resolveMeshStageTarget({
          ...input,
          firstImageReady: true,
          minimumTarget: 12,
        })
      ).toBe(12);
    }
  );

  it("keeps legacy first-fill staging and releases the final target after first observer idle", () => {
    const input = Object.freeze({
      shadowView: false,
      minimumTarget: 6,
      initialTarget: 64,
      handoverReady: false,
      firstImageReady: false,
    });
    expect(resolveMeshStageTarget(input)).toBe(64);
    expect(
      resolveMeshStageTarget({
        ...input,
        initialTarget: 16,
        firstImageReady: true,
      })
    ).toBe(16);
    expect(
      resolveMeshStageTarget({
        ...input,
        initialTarget: 16,
        firstImageReady: true,
        handoverReady: true,
      })
    ).toBe(6);
    expect(
      resolveMeshStageTarget({
        ...input,
        handoverReady: true,
        minimumTarget: 20,
      })
    ).toBe(20);
    expect(resolveMeshStageTarget({ ...input, shadowView: true })).toBe(6);
  });
});
