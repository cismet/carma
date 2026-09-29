import type { Tile } from "3d-tiles-renderer/core";
import type { TilesRenderer } from "3d-tiles-renderer";
import { Box3, Matrix4 } from "three";
import {
  createTileCameraDemand,
  tileCameraViewsSignature,
  TILE_MAIN_OBSERVER_ID,
} from "../../core/tile-camera-demand";
import { createMeshRegionCutQuery } from "../../core/mesh-tile-coverage";
import { subscribeTileResponses } from "../integrations/tile-response-observers";
import { readOrientedTileBounds } from "../integrations/three-tiles-bounds";
import type {
  RuntimePriorityQueue,
  RuntimeTile,
} from "../integrations/three-tiles-runtime-types";
import {
  addTileResourceTiming,
  emptyTilePipelineTotals,
  sampleTilePipeline,
  sampleVisibleTileQuality,
  type VisibleTileQualityObservation,
} from "../../core/diagnostics/tile-pipeline-sample";
import {
  isLoadedMesh,
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
  const bodyReads = new Map<
    string,
    { headersAt: number; elapsedMs?: number; resourceReceived?: boolean }
  >();
  let unsubscribeResponses: (() => void) | undefined;
  let qualityCameraSignature = "";
  let qualityFrontier:
    | TilesRuntimeDebugState["displayedMeshFrontier"]
    | undefined;
  let qualityRevision = -1;
  let qualityTransform = "";
  let qualityObservations: VisibleTileQualityObservation[] = [];
  let over20Since: number | null = null;
  const qualityBounds = new Box3();
  const qualityBoundsTransform = new Matrix4();
  const sampleVisibleQuality = (
    state: Readonly<TilesRuntimeDebugState> | null | undefined,
    now: number
  ) => {
    const mainView = state?.tileCameraDemand?.views.find(
      (view) => view.id === TILE_MAIN_OBSERVER_ID
    );
    const observerViews = mainView
      ? [{ ...mainView, errorTargetPixels: 1, priority: 0 }]
      : [];
    const cameraSignature = tileCameraViewsSignature(observerViews);
    const cameraChanged = cameraSignature !== qualityCameraSignature;
    const group = state?.tiles?.group;
    const transform = group
      ? [...group.matrixWorld.elements, Number(group.visible)].join(",")
      : "";
    if (
      cameraChanged ||
      qualityFrontier !== state?.displayedMeshFrontier ||
      qualityRevision !== (state?.meshContentRevision ?? -1) ||
      qualityTransform !== transform
    ) {
      if (cameraChanged) over20Since = null;
      qualityCameraSignature = cameraSignature;
      qualityFrontier = state?.displayedMeshFrontier;
      qualityRevision = state?.meshContentRevision ?? -1;
      qualityTransform = transform;
      qualityObservations = [];
      if (mainView && group?.visible) {
        // The main snapshot uses the CSS viewport. A unit target obtains raw
        // geometric SSE, independent of staging or stricter shadow cameras.
        const observer = createTileCameraDemand(observerViews);
        const worldScale = group.matrixWorld.getMaxScaleOnAxis();
        const published = new Set(
          [...(qualityFrontier ?? [])].filter((tile) => {
            const scene = (tile as RuntimeTile).engineData?.scene;
            return isLoadedMesh(tile) && scene?.visible && scene.parent;
          })
        );
        const demands = new Map<
          Tile,
          { intersects: boolean; errorPixels: number; areaCssPixels: number }
        >();
        const demandFor = (tile: Tile) => {
          const cached = demands.get(tile);
          if (cached) return cached;
          const volume = (tile as RuntimeTile).engineData?.boundingVolume;
          if (!volume?.getAABB)
            return {
              intersects: true,
              errorPixels: Number.NaN,
              areaCssPixels: Number.NaN,
            };
          readOrientedTileBounds(volume, qualityBounds, qualityBoundsTransform);
          qualityBoundsTransform.premultiply(group.matrixWorld);
          const demand = observer.evaluate(
            qualityBounds,
            tile.geometricError * worldScale,
            undefined,
            true,
            qualityBoundsTransform
          );
          const result = {
            intersects: demand.required,
            errorPixels: demand.errorRatio,
            areaCssPixels: demand.visibleAreaPixels ?? Number.NaN,
          };
          demands.set(tile, result);
          return result;
        };
        const readyRegion = createMeshRegionCutQuery(
          new Set(
            [...published].filter(
              (tile) =>
                (tile as RuntimeTile).engineData?.boundingVolume?.getAABB
            )
          ),
          Number.MAX_VALUE,
          demandFor
        );
        for (const tile of published) {
          const demand = demandFor(tile);
          if (!demand.intersects) continue;
          // The parent's loose bounds may touch the view although every child
          // misses it, or finer published descendants cover its relevant region.
          // Query children: the published parent itself cannot prove replacement.
          if (
            tile.refine === "REPLACE" &&
            tile.children?.length &&
            tile.children.every((child) => readyRegion(child) !== null)
          )
            continue;
          qualityObservations.push({
            errorCssPixels: demand.errorPixels,
            areaCssPixels: demand.areaCssPixels,
          });
        }
      }
    }
    const sample = sampleVisibleTileQuality(
      qualityObservations,
      now,
      over20Since
    );
    over20Since = sample.over20Since;
    return sample.metrics;
  };
  const onDownload = ({ url }: { url: string }) => {
    requestStarts.delete(url);
    contentLengths.delete(url);
    bodyReads.delete(url);
    requestStarts.set(url, performance.now());
    if (requestStarts.size > 4000) {
      const oldest = requestStarts.keys().next().value!;
      requestStarts.delete(oldest);
      contentLengths.delete(oldest);
      bodyReads.delete(oldest);
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
      const body = bodyReads.get(url);
      if (body) {
        body.elapsedMs = Math.max(0, performance.now() - body.headersAt);
        // Resource Timing and body completion can arrive in either order.
        if (body.resourceReceived || !observer) {
          totals.bodyMs += body.elapsedMs;
          totals.timedBodies++;
          bodyReads.delete(url);
        }
      }
      return;
    }
    const start = requestStarts.get(url);
    if (start === undefined) return;
    if (contentLength !== undefined) contentLengths.set(url, contentLength);
    bodyReads.set(url, { headersAt: performance.now() });
    if (bodyReads.size > 4000) bodyReads.delete(bodyReads.keys().next().value!);
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
    qualityCameraSignature = "";
    qualityFrontier = undefined;
    qualityRevision = -1;
    qualityObservations = [];
    over20Since = null;
    requestStarts.clear();
    contentLengths.clear();
    bodyReads.clear();
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
      const timing = resource as PerformanceResourceTiming;
      const body = bodyReads.get(resource.name);
      totals = addTileResourceTiming(totals, timing, {
        contentLength: contentLengths.get(resource.name),
        bodyReadMs: body?.elapsedMs,
      });
      const timed =
        timing.requestStart > 0 && timing.responseStart >= timing.requestStart;
      if (timed || body?.elapsedMs !== undefined)
        bodyReads.delete(resource.name);
      else if (body) body.resourceReceived = true;
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
      const parseQueue = source?.parseQueue as RuntimePriorityQueue | undefined;
      const origins = source?.downloadQueue.originQueues;
      let downloadActivePerOrigin = origins ? 0 : Number.NaN;
      for (const queue of origins?.values() ?? [])
        downloadActivePerOrigin = Math.max(
          downloadActivePerOrigin,
          (queue as RuntimePriorityQueue).currJobs
        );
      return {
        ...sample,
        ...sampleVisibleQuality(state, now),
        downloadActivePerOrigin,
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
        casters: state?.committedMeshCasterFrontier?.size ?? 0,
      };
    },
    dispose: () => {
      observer?.disconnect();
      unbind();
      requestStarts.clear();
      contentLengths.clear();
      bodyReads.clear();
    },
  };
};
