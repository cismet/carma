import type { Tile } from "3d-tiles-renderer/core";
import { isExtentFloorTile } from "../../core/mesh-error-policy";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "../integrations/three-tiles-runtime-context";
import type {
  RuntimeLruCache,
  RuntimePriorityQueue,
  RuntimeTile,
} from "../integrations/three-tiles-runtime-types";
import {
  LOADED_LOADING_STATE,
  resolveTileContentUrl,
} from "../integrations/three-tiles-runtime-vendor";

const MAX_REQUEST_TRACES = 64;
const MAX_TILE_SAMPLES = 12;
const serialize = (value: unknown) =>
  JSON.stringify(value, (_, item) =>
    typeof item === "number" && !Number.isFinite(item) ? String(item) : item
  );

type RecoveryState = Pick<
  ThreeTilesRuntimeState,
  | "options"
  | "disposed"
  | "layerId"
  | "tilesetUrl"
  | "tiles"
  | "map"
  | "tileCameraSignature"
  | "requestedErrorTarget"
  | "effectiveErrorTarget"
  | "memoryErrorTarget"
  | "lastMainViewConverged"
  | "lastActiveViewsConverged"
  | "meshCoverageRecovery"
  | "meshBaseCoverageReady"
  | "meshDemandSweepPending"
  | "extentGeometricError"
  | "extentFloorArmed"
  | "extentFloorPending"
  | "memoryAdmissionPaused"
  | "loadingPaused"
  | "runtimeVisible"
  | "ceilingBytes"
  | "allocationFailed"
  | "contextLost"
  | "displayedMeshFrontier"
  | "committedMeshReceiverFrontier"
  | "mainViewSourceTiles"
  | "meshShadowReserve"
  | "queuedThisTraversal"
  | "meshRefinementSupport"
  | "residentAncestors"
  | "shadowCasterRequests"
  | "committedMeshCasterFrontier"
  | "pendingMeshCasterFrontier"
  | "retainedShadowRequests"
  | "deferred"
  | "shadowView"
  | "shadowSelectionNeedsTraversal"
  | "shadowReceiverMaskConverged"
>;

/** Diagnostic history contains plain records, never retained tiles or geometry. */
export function createTileRecoveryDiagnostics(
  state: RecoveryState,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    "getStableTileId" | "isTileInMainView" | "getTileScreenError"
  >
) {
  const enabled = () =>
    state.options.diagnostics === true &&
    state.options.tileTelemetry !== false &&
    !state.disposed;
  const identify = (tile: Tile) => dependencies.getStableTileId(tile);
  const describe = (tile: Tile) => {
    let inViewport: boolean | null = null;
    let errorPixels: number | null = null;
    if (
      tile.internal &&
      tile.traversal &&
      (tile as RuntimeTile).engineData?.boundingVolume?.getAABB
    ) {
      try {
        inViewport = dependencies.isTileInMainView(tile as RuntimeTile);
        errorPixels = dependencies.getTileScreenError(tile as RuntimeTile);
      } catch {
        // A recovery record must not turn incomplete geometry into a new error.
      }
    }
    return {
      id: identify(tile),
      url: resolveTileContentUrl(tile),
      parent: tile.parent ? identify(tile.parent) : null,
      loadingState: tile.internal?.loadingState ?? null,
      hasContent: tile.internal?.hasContent === true,
      metadata: tile.internal?.hasUnrenderableContent === true,
      geometricError: tile.geometricError,
      inViewport,
      errorPixels,
    };
  };
  const summarize = (tiles: Iterable<Tile>) => {
    let count = 0;
    const samples: string[] = [];
    for (const tile of tiles) {
      count++;
      if (samples.length < MAX_TILE_SAMPLES) samples.push(identify(tile));
    }
    return { count, samples };
  };
  const queueSnapshot = (queue: unknown) => {
    const native = queue as RuntimePriorityQueue | undefined;
    return {
      active: native?.currJobs ?? 0,
      limit: native?.maxJobs ?? 0,
      pending: summarize(native?.items ?? []),
    };
  };
  const traces: Array<
    ReturnType<typeof describe> & {
      at: number;
      stage: "admission" | "execution";
      reason: string | null;
      stack: string;
    }
  > = [];
  let lastQuietSnapshot: string | undefined;
  const recordTileRequestTrace: NonNullable<
    ThreeTilesRuntimeServices["recordTileRequestTrace"]
  > = (tile, stage, reason) => {
    if (!enabled()) return;
    try {
      if (reason === "no-downloadable-content") {
        const id = identify(tile);
        if (
          traces.some(
            (entry) =>
              entry.id === id &&
              entry.stage === stage &&
              entry.reason === reason
          )
        )
          return;
      }
      traces.push({
        ...describe(tile),
        at: performance.now(),
        stage,
        reason,
        stack: (new Error().stack ?? "")
          .split("\n")
          .slice(2, 10)
          .join("\n")
          .slice(0, 8192),
      });
      if (traces.length > MAX_REQUEST_TRACES) traces.shift();
    } catch {
      // Optional observation cannot reject an otherwise valid native request.
    }
  };
  const reportTileRecovery: NonNullable<
    ThreeTilesRuntimeServices["reportTileRecovery"]
  > = (reason, error) => {
    if (!enabled()) return;
    try {
      const tiles = state.tiles;
      const native = tiles as typeof tiles & {
        rootLoadingState?: number;
        queuedTiles?: Tile[];
        queuedTileSet?: ReadonlySet<Tile>;
      };
      const cache = tiles?.lruCache as RuntimeLruCache | undefined;
      const pending = [...(tiles?.loadingTiles ?? [])];
      const loadingStates: Record<string, number> = {};
      for (const tile of pending) {
        const key = String(tile.internal?.loadingState ?? "unprepared");
        loadingStates[key] = (loadingStates[key] ?? 0) + 1;
      }
      const snapshot = {
        layerId: state.layerId,
        source: state.tilesetUrl,
        viewSignature: state.tileCameraSignature,
        targets: {
          requested: state.requestedErrorTarget,
          effective: state.effectiveErrorTarget,
          memory: state.memoryErrorTarget,
        },
        convergence: {
          main: state.lastMainViewConverged,
          activeViews: state.lastActiveViewsConverged,
          shadow: state.shadowReceiverMaskConverged,
        },
        coverage: {
          recovering: state.meshCoverageRecovery,
          baseReady: state.meshBaseCoverageReady,
          sweepPending: state.meshDemandSweepPending,
          floorArmed: state.extentFloorArmed,
          floorError: state.extentGeometricError,
          floorPending: state.extentFloorPending,
        },
        gates: {
          visible: state.runtimeVisible,
          memoryPaused: state.memoryAdmissionPaused,
          loadingPaused: state.loadingPaused,
          allocationFailed: state.allocationFailed,
          contextLost: state.contextLost,
          moving: state.map?.isMoving?.() === true,
          zooming: state.map?.isZooming?.() === true,
          shadow: !!state.shadowView,
          shadowTraversalPending: state.shadowSelectionNeedsTraversal,
        },
        memory: {
          cachedBytes: cache?.cachedBytes ?? 0,
          ceilingBytes: state.ceilingBytes,
          nativeLimitBytes: cache?.maxBytesSize ?? 0,
          cachedTiles: cache?.itemList?.length ?? 0,
        },
        pipeline: {
          rootLoadingState: native?.rootLoadingState ?? null,
          traversalQueued: summarize(native?.queuedTiles ?? []),
          traversalQueuedSet: native?.queuedTileSet?.size ?? 0,
          stats: { ...tiles?.stats },
          downloadLimit: tiles?.downloadQueue.maxJobsPerOrigin ?? 0,
          origins: [...(tiles?.downloadQueue.originQueues ?? [])].map(
            ([origin, queue]) => ({ origin, ...queueSnapshot(queue) })
          ),
          parse: queueSnapshot(tiles?.parseQueue),
          topology: queueSnapshot(tiles?.processNodeQueue),
          loading: {
            count: pending.length,
            states: loadingStates,
            samples: pending.slice(0, MAX_TILE_SAMPLES).map(describe),
            metadata: summarize(
              pending.filter((tile) => tile.internal?.hasUnrenderableContent)
            ),
            metadataPending: pending.some(
              (tile) => tile.internal?.hasUnrenderableContent === true
            ),
          },
        },
        ownership: {
          displayed: summarize(state.displayedMeshFrontier),
          committedReceivers: summarize(state.committedMeshReceiverFrontier),
          receiverSources: summarize(state.mainViewSourceTiles),
          nativeVisible: summarize(tiles?.visibleTiles ?? []),
          nativeUsed: summarize(tiles?.usedSet ?? []),
          traversalAdmissions: summarize(state.queuedThisTraversal),
          support: summarize(state.meshRefinementSupport),
          base: summarize(
            (cache?.itemList ?? []).filter(
              (tile) =>
                tile.internal?.hasRenderableContent === true &&
                tile.internal.loadingState === LOADED_LOADING_STATE &&
                isExtentFloorTile(tile, state.extentGeometricError)
            )
          ),
          idleRings: summarize(
            new Set(
              [...(cache?.itemList ?? []), ...pending].filter(
                (tile) => (tile as RuntimeTile).idleRing === true
              )
            )
          ),
          residentAncestors: summarize(state.residentAncestors),
          shadowReserve: summarize(state.meshShadowReserve?.frontier ?? []),
          shadowReserveSupport: summarize(
            state.meshShadowReserve?.support ?? []
          ),
          requestedCasters: summarize(state.shadowCasterRequests),
          committedCasters: summarize(state.committedMeshCasterFrontier),
          pendingCasters: summarize(state.pendingMeshCasterFrontier),
          retainedSun: summarize(state.retainedShadowRequests),
          deferred: summarize(state.deferred),
        },
      };
      // Frame/time counters are observations, not demand changes. Repeated empty
      // recovery passes must not print the same snapshot once per second.
      const key = serialize(snapshot);
      if (reason === "idle-demand" && key === lastQuietSnapshot) return;
      lastQuietSnapshot = key;
      console.warn(
        "[tiles3d] recovery",
        serialize({
          reason,
          at: performance.now(),
          frame: tiles?.frameCount ?? -1,
          error:
            error === undefined
              ? undefined
              : String(
                  error instanceof Error ? error.stack ?? error : error
                ).slice(0, 8192),
          ...snapshot,
          requestTraces: [...traces],
        })
      );
    } catch {
      // Identity, queue and logger failures cannot interrupt scheduler recovery.
    }
  };
  return { recordTileRequestTrace, reportTileRecovery };
}
