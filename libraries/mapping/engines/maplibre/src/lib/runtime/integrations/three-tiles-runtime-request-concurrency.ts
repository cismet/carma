import type { Tile } from "3d-tiles-renderer/core";

import { TILES_CACHE_CEILING_BYTES } from "../../core/tile-cache-policy";

import {
  resolveTileDownloadConcurrency,
  resolveTileParseConcurrency,
} from "../../core/tile-scheduling-policy";
import { isSharedThreeTerrainLoading } from "./shared-three-terrain-registry";
import { resolveRequestConcurrency } from "../../core/tile-request-policy";
import {
  MESH_ALLOCATION_RECOVERY_PHASE,
  MESH_DESKTOP_SHADOW_PARSE_CONCURRENCY,
  MESH_DOWNLOAD_CONCURRENCY,
  MESH_MOTION_DOWNLOAD_CONCURRENCY,
  MESH_MOTION_PARSE_CONCURRENCY,
  MESH_PARSE_BACKLOG_HARD_LIMIT,
  MESH_PARSE_BACKLOG_SOFT_LIMIT,
  TERRAIN_LOADING_CONTENT_BOOTSTRAP_CONCURRENCY,
} from "./three-tiles-runtime-config";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type {
  RuntimePriorityQueue,
  RuntimeTile,
} from "./three-tiles-runtime-types";

/** Applies download and parse capacity to the native renderer queues. */
export function createThreeTilesRequestConcurrency(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "tiles"
    | "map"
    | "normalParseConcurrency"
    | "shadowView"
    | "memoryAdmissionPaused"
    | "allocationRecovery"
    | "loadingPaused"
    | "options"
    | "payloadAwareConcurrency"
    | "requestConcurrency"
    | "ceilingBytes"
    | "bytesPredictor"
    | "meshBaseCoverageReady"
  >,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    | "getRuntimeCache"
    | "sampleMemoryPressure"
    | "getTileRequestPriority"
    | "getDownloadQueues"
  >
) {
  const applyRequestConcurrency: ThreeTilesRuntimeServices["applyRequestConcurrency"] =
    () => {
      const cache = dependencies.getRuntimeCache();
      if (!runtimeState.tiles || !cache) return;
      dependencies.sampleMemoryPressure();
      runtimeState.normalParseConcurrency ??=
        runtimeState.tiles.parseQueue.maxJobs;
      const previousParseConcurrency = runtimeState.tiles.parseQueue.maxJobs;
      // GLTF scene/material creation touches the renderer thread. Bound motion
      // admission without pausing current-view coverage until pointer-up.
      const moving = runtimeState.map?.isMoving?.() === true;
      const zooming = runtimeState.map?.isZooming?.() === true;
      const paused =
        runtimeState.memoryAdmissionPaused || runtimeState.loadingPaused;
      const normalParseConcurrency =
        runtimeState.options.providesTerrain &&
        runtimeState.shadowView &&
        runtimeState.ceilingBytes >= TILES_CACHE_CEILING_BYTES.desktopDefault
          ? MESH_DESKTOP_SHADOW_PARSE_CONCURRENCY
          : runtimeState.normalParseConcurrency;
      runtimeState.tiles.parseQueue.maxJobs = resolveTileParseConcurrency({
        paused,
        moving,
        zooming,
        providesTerrain: !!runtimeState.options.providesTerrain,
        normal: normalParseConcurrency,
        motionLimit: MESH_MOTION_PARSE_CONCURRENCY,
      });
      // A recovered allocation gets one decode at a time until a model really
      // succeeds. Raising the ceiling or restoring the former fan-out would
      // immediately recreate the pressure that triggered the pause.
      if (
        runtimeState.allocationRecovery?.phase ===
        MESH_ALLOCATION_RECOVERY_PHASE.PROBING
      )
        runtimeState.tiles.parseQueue.maxJobs = Math.min(
          1,
          runtimeState.tiles.parseQueue.maxJobs
        );
      if (runtimeState.tiles.parseQueue.maxJobs > previousParseConcurrency) {
        // Changing the upstream concurrency limit does not wake a paused queue.
        // Defer the restart instead of parsing synchronously in an input event.
        runtimeState.tiles.parseQueue.scheduleJobRun();
      }
      const activeConcurrency = resolveRequestConcurrency({
        memoryPressure: paused,
        configured: runtimeState.payloadAwareConcurrency.getConcurrency(
          runtimeState.requestConcurrency
        ),
        ceilingBytes: runtimeState.ceilingBytes,
        cachedBytes: cache.cachedBytes,
        estimateBytes: runtimeState.bytesPredictor.globalEstimate(),
      });
      const parseItems = (runtimeState.tiles.parseQueue as RuntimePriorityQueue)
        .items;
      const parseBacklog = parseItems.length;
      let foregroundBacklog = parseBacklog;
      if (
        runtimeState.options.providesTerrain &&
        runtimeState.meshBaseCoverageReady &&
        parseBacklog >= MESH_PARSE_BACKLOG_HARD_LIMIT
      ) {
        // Decision: TILES_COVERAGE.md#queue-admission-and-capacity-recovery.
        // Parked lower-priority buffers must not stop the downloads needed to
        // drain the foreground that parks them. Recheck ranks after each move.
        const priorities = new Map<Tile, number>();
        let highestPriority = Number.NEGATIVE_INFINITY;
        for (const tile of new Set([
          ...runtimeState.tiles.loadingTiles,
          ...parseItems,
        ])) {
          const priority = dependencies.getTileRequestPriority(
            tile as RuntimeTile
          );
          priorities.set(tile, priority);
          highestPriority = Math.max(highestPriority, priority);
        }
        if (Number.isFinite(highestPriority))
          foregroundBacklog = parseItems.filter(
            (tile) => priorities.get(tile)! >= highestPriority
          ).length;
      }
      let downloadConcurrency = resolveTileDownloadConcurrency(
        {
          active: activeConcurrency,
          providesTerrain: !!runtimeState.options.providesTerrain,
          moving,
          baseCoverageReady: runtimeState.meshBaseCoverageReady,
          parseBacklog,
          foregroundBacklog,
          sharedTerrainLoading:
            !runtimeState.options.providesTerrain &&
            !!runtimeState.map &&
            isSharedThreeTerrainLoading(runtimeState.map),
        },
        {
          mesh: MESH_DOWNLOAD_CONCURRENCY,
          motion: MESH_MOTION_DOWNLOAD_CONCURRENCY,
          backlogHard: MESH_PARSE_BACKLOG_HARD_LIMIT,
          backlogSoft: MESH_PARSE_BACKLOG_SOFT_LIMIT,
          backgroundBacklog: 4,
          terrainBootstrap: TERRAIN_LOADING_CONTENT_BOOTSTRAP_CONCURRENCY,
        }
      );
      if (
        runtimeState.allocationRecovery?.phase ===
        MESH_ALLOCATION_RECOVERY_PHASE.PROBING
      )
        downloadConcurrency = Math.min(1, downloadConcurrency);
      // Network throughput is useful only while the downstream GLTF queue can
      // consume it. The former 42-64 request fan-out accumulated 225 parse jobs
      // and starved rendering. A bounded backlog gate keeps decoder and
      // browser-thread scene commits fed without building an unbounded blob wall.
      const previousDownloadConcurrency =
        runtimeState.tiles.downloadQueue.maxJobsPerOrigin;
      runtimeState.tiles.downloadQueue.maxJobsPerOrigin = downloadConcurrency;
      if (downloadConcurrency > previousDownloadConcurrency) {
        // Decision: TILES_COVERAGE.md#queue-admission-and-capacity-recovery.
        // Updating the native limit does not wake an idle origin queue. Resume
        // asynchronously on capacity recovery, independent of the next traversal
        // or a different corridor completing its downloads/shadow work.
        for (const queue of dependencies.getDownloadQueues())
          queue.scheduleJobRun();
      }
    };

  return { applyRequestConcurrency };
}
