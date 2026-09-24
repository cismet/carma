import { subscribeTileResponses } from "../integrations/tile-response-observers";
import type { Tile } from "3d-tiles-renderer/core";
import type { TilesRenderer } from "3d-tiles-renderer";
import {
  addTileResourceTiming,
  emptyTilePipelineTotals,
  sampleTilePipeline,
} from "../../core/diagnostics/tile-pipeline-sample";
import {
  loadingTilesOf,
  type TilesRuntimeDebugState,
} from "./tile-diagnostic-state";

/** Debug-only observer, scoped to this renderer's request events. No fetch hook,
 * timers, global resource-buffer growth or work when diagnostics are closed.
 * Decision: TILE_DIAGNOSTICS.md#pipeline-timeline.
 */
export const createTilePipelineTelemetry = (
  readState: () => Readonly<TilesRuntimeDebugState> | null | undefined
) => {
  let source: TilesRenderer | null = null;
  let totals = emptyTilePipelineTotals();
  let sampledAt = performance.now();
  const requestStarts = new Map<string, number>();
  const presented = new WeakSet<Tile>();
  const contentLengths = new Map<string, number>();
  let unsubscribeResponses: (() => void) | undefined;
  const onDownload = ({ url }: { url: string }) => {
    requestStarts.delete(url);
    contentLengths.delete(url);
    requestStarts.set(url, performance.now());
    if (requestStarts.size > 4000) {
      const oldest = requestStarts.keys().next().value!;
      requestStarts.delete(oldest);
      contentLengths.delete(oldest);
    }
  };
  const onModel = ({ tile }: { tile: Tile }) => {
    totals.prepared++;
    const progress = readState()?.tileDebugProgress?.get(tile);
    if (!progress) return;
    const { downloadFinishedAt, parseStartedAt, parseFinishedAt } = progress;
    if (
      parseStartedAt !== undefined &&
      parseFinishedAt !== undefined &&
      parseFinishedAt >= parseStartedAt
    ) {
      totals.timedPreparations++;
      totals.prepareMs += parseFinishedAt - parseStartedAt;
    }
    if (
      downloadFinishedAt !== undefined &&
      parseStartedAt !== undefined &&
      parseStartedAt >= downloadFinishedAt
    ) {
      totals.timedParseWaits++;
      totals.parseWaitMs += parseStartedAt - downloadFinishedAt;
    }
  };
  const onMetadata = () => {
    totals.metadataReady++;
  };
  const onResponse: Parameters<typeof subscribeTileResponses>[1] = ({
    url,
    contentLength,
    decodedBytes,
  }) => {
    if (decodedBytes !== undefined) {
      totals.decodedBytes += decodedBytes;
      totals.decodedBodies++;
      return;
    }
    const start = requestStarts.get(url);
    if (start === undefined) return;
    if (contentLength !== undefined) contentLengths.set(url, contentLength);
    totals.headers++;
    totals.headersMs += Math.max(0, performance.now() - start);
  };
  const onError = () => {
    totals.errors++;
  };
  const unbind = () => {
    unsubscribeResponses?.();
    source?.removeEventListener("load-tileset", onMetadata);
    source?.removeEventListener("tile-download-start", onDownload);
    source?.removeEventListener("load-model", onModel);
    source?.removeEventListener("load-error", onError);
  };
  const bind = () => {
    const state = readState();
    const tiles = state?.tiles ?? null;
    if (source === tiles) return;
    unbind();
    source = tiles;
    requestStarts.clear();
    contentLengths.clear();
    if (!tiles) return;
    unsubscribeResponses = subscribeTileResponses(tiles, onResponse);
    tiles.addEventListener("load-tileset", onMetadata);
    tiles.addEventListener("tile-download-start", onDownload);
    tiles.addEventListener("load-model", onModel);
    tiles.addEventListener("load-error", onError);
    // Opening the debugger must include already-running payloads too.
    for (const tile of loadingTilesOf(tiles)) {
      if (tile.content?.uri && tile.internal?.basePath) {
        const url = new URL(tile.content.uri, tile.internal.basePath + "/")
          .href;
        requestStarts.set(
          url,
          state?.tileDebugProgress?.get(tile)?.downloadStartedAt ?? sampledAt
        );
      }
    }
  };
  const onResources = (entries: PerformanceEntry[]) => {
    for (const resource of entries) {
      if (!requestStarts.has(resource.name)) continue;
      totals = addTileResourceTiming(
        totals,
        resource as PerformanceResourceTiming,
        contentLengths.get(resource.name)
      );
      requestStarts.delete(resource.name);
      contentLengths.delete(resource.name);
    }
  };
  let observer: PerformanceObserver | null = null;
  try {
    observer = new PerformanceObserver((list) =>
      onResources(list.getEntries())
    );
    observer.observe({ type: "resource", buffered: false });
  } catch {
    observer = null;
  }
  bind();
  return {
    sample: (now = performance.now()): Record<string, number> => {
      bind();
      if (observer) onResources(observer.takeRecords());
      const state = readState();
      let queueAgeMs = 0,
        requestAgeMs = 0,
        parseQueueAgeMs = 0;
      let blocked = 0;
      if (state?.tiles) {
        for (const tile of loadingTilesOf(state.tiles)) {
          const progress = state.tileDebugProgress?.get(tile);
          if (!progress) continue;
          const phase = tile.internal.loadingState;
          if (phase === 1 && progress.queuedAt !== undefined)
            queueAgeMs = Math.max(queueAgeMs, now - progress.queuedAt);
          if (phase === 2 && progress.downloadStartedAt !== undefined)
            requestAgeMs = Math.max(
              requestAgeMs,
              now - progress.downloadStartedAt
            );
          if (
            phase === 3 &&
            progress.downloadFinishedAt !== undefined &&
            (progress.parseStartedAt ?? -Infinity) < progress.downloadFinishedAt
          )
            parseQueueAgeMs = Math.max(
              parseQueueAgeMs,
              now - progress.downloadFinishedAt
            );
          if (progress.requestDecision?.action === "park") blocked++;
        }
        for (const tile of state.displayedMeshFrontier) {
          if (presented.has(tile)) continue;
          presented.add(tile);
          totals.presented++;
        }
      }
      const stats = (
        source as unknown as {
          stats?: { queued: number; downloading: number; parsing: number };
        } | null
      )?.stats;
      const sample = sampleTilePipeline(totals, now - sampledAt);
      sampledAt = now;
      totals = emptyTilePipelineTotals();
      const parseQueue = source?.parseQueue as
        | { currJobs?: number; maxJobs?: number }
        | undefined;
      return {
        ...sample,
        queued: stats?.queued ?? 0,
        downloading: stats?.downloading ?? 0,
        parsing: stats?.parsing ?? 0,
        displayed: state?.displayedMeshFrontier.size ?? 0,
        queueAgeMs,
        requestAgeMs,
        parseQueueAgeMs,
        blocked,
        parseActive: parseQueue?.currJobs ?? 0,
        parseSlots: parseQueue?.maxJobs ?? 0,
        downloadSlotsPerOrigin: source?.downloadQueue.maxJobsPerOrigin ?? 0,
        heldReceivers: state?.pendingMeshReceiverFrontier?.size ?? 0,
        casters: state?.committedMeshCasterFrontier?.size ?? 0,
      };
    },
    dispose: () => {
      observer?.disconnect();
      unbind();
      requestStarts.clear();
      contentLengths.clear();
    },
  };
};
