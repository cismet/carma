import { TilesRenderer } from "3d-tiles-renderer";

import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type { RuntimePriorityQueue } from "./three-tiles-runtime-types";

/** Tracks active native queues and notifies consumers when request demand changes. */
export function createThreeTilesRequestActivity(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "map"
    | "tiles"
    | "errorTargetTimer"
    | "kickstartTimer"
    | "hiddenWipeTimer"
    | "disposed"
    | "runtimeVisible"
    | "shadowView"
    | "shadowSelectionEnabled"
    | "shadowSelectionNeedsTraversal"
    | "tileRetries"
    | "viewQualityAuditPasses"
    | "lastNotifiedRequestDemand"
    | "payloadAwareConcurrency"
    | "usedBytesMain"
    | "options"
  >
) {
  const requestRender: ThreeTilesRuntimeServices["requestRender"] = () =>
    runtimeState.map?.triggerRepaint();

  const getDownloadQueues: ThreeTilesRuntimeServices["getDownloadQueues"] =
    (): RuntimePriorityQueue[] =>
      runtimeState.tiles
        ? [...runtimeState.tiles.downloadQueue.originQueues.values()].map(
            (queue) => queue as RuntimePriorityQueue
          )
        : [];

  const runDownloadQueues: ThreeTilesRuntimeServices["runDownloadQueues"] =
    () => {
      for (const queue of getDownloadQueues()) queue.tryRunJobs();
    };

  const clearErrorTargetTimer: ThreeTilesRuntimeServices["clearErrorTargetTimer"] =
    () => {
      if (runtimeState.errorTargetTimer) {
        window.clearTimeout(runtimeState.errorTargetTimer);
        runtimeState.errorTargetTimer = 0;
      }
    };

  const clearKickstartTimer: ThreeTilesRuntimeServices["clearKickstartTimer"] =
    () => {
      if (runtimeState.kickstartTimer) {
        window.clearInterval(runtimeState.kickstartTimer);
        runtimeState.kickstartTimer = 0;
      }
    };

  const clearHiddenWipeTimer: ThreeTilesRuntimeServices["clearHiddenWipeTimer"] =
    () => {
      if (runtimeState.hiddenWipeTimer) {
        window.clearTimeout(runtimeState.hiddenWipeTimer);
        runtimeState.hiddenWipeTimer = 0;
      }
    };

  const getRequestDemand: ThreeTilesRuntimeServices["getRequestDemand"] =
    () => {
      if (runtimeState.disposed || !runtimeState.runtimeVisible) return 0;
      if (!runtimeState.tiles) return 1;
      const downloadDemand = getDownloadQueues().reduce(
        (total, queue) => total + queue.items.length + queue.currJobs,
        0
      );
      const processNodeQueue = runtimeState.tiles
        .processNodeQueue as typeof runtimeState.tiles.processNodeQueue & {
        items: unknown[];
        currJobs: number;
      };
      const stats = (
        runtimeState.tiles as TilesRenderer & {
          stats?: { queued?: number; downloading?: number; parsing?: number };
        }
      ).stats;
      return (
        downloadDemand +
        processNodeQueue.items.length +
        processNodeQueue.currJobs +
        (stats?.queued ?? 0) +
        (stats?.downloading ?? 0) +
        (stats?.parsing ?? 0) +
        (runtimeState.shadowView && !runtimeState.shadowSelectionEnabled
          ? 1
          : 0) +
        (runtimeState.shadowSelectionNeedsTraversal ? 1 : 0) +
        (runtimeState.tileRetries.hasPendingRetries() ? 1 : 0) +
        runtimeState.viewQualityAuditPasses +
        (runtimeState.tiles.group.children.length === 0 &&
        !runtimeState.tileRetries.hasExhaustedRetries()
          ? 1
          : 0)
      );
    };

  const notifyRequestStateChange: ThreeTilesRuntimeServices["notifyRequestStateChange"] =
    () => {
      const requestDemand = getRequestDemand();
      if (requestDemand === runtimeState.lastNotifiedRequestDemand) return;
      runtimeState.lastNotifiedRequestDemand = requestDemand;
      runtimeState.options.onRequestStateChange?.();
    };

  const isPipelineIdle: ThreeTilesRuntimeServices["isPipelineIdle"] = () =>
    runtimeState.tiles !== null &&
    !runtimeState.tiles.downloadQueue.running &&
    !runtimeState.tiles.parseQueue.running &&
    !runtimeState.tiles.processNodeQueue.running &&
    runtimeState.tiles.loadingTiles.size === 0 &&
    !runtimeState.tileRetries.hasPendingRetries() &&
    runtimeState.payloadAwareConcurrency.getCooldownRemainingMs() <= 0;

  const measureUsedBytesMain: ThreeTilesRuntimeServices["measureUsedBytesMain"] =
    () => {
      if (!runtimeState.tiles) return;
      let bytes = 0;
      for (const tile of runtimeState.tiles.usedSet) {
        bytes += runtimeState.tiles.lruCache.getMemoryUsage(tile);
      }
      runtimeState.usedBytesMain = bytes;
    };

  return {
    requestRender,
    getDownloadQueues,
    runDownloadQueues,
    clearErrorTargetTimer,
    clearKickstartTimer,
    clearHiddenWipeTimer,
    getRequestDemand,
    notifyRequestStateChange,
    isPipelineIdle,
    measureUsedBytesMain,
  };
}
