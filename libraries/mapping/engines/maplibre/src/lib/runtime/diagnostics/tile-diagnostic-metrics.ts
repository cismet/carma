import type { Tile } from "3d-tiles-renderer/core";
import type { TilesRenderer } from "3d-tiles-renderer";
import type { ThreeTilesRuntime } from "../integrations/three-tiles-runtime-types";
import type {
  ThreeTilesReserveCoverage,
  ThreeTilesClosureCoverage,
} from "../integrations/three-tiles-runtime-coverage";
import {
  loadingTilesOf,
  tileId,
  tileError,
  levelsToTarget,
  type TilesRuntimeDebugState,
} from "./tile-diagnostic-state";
const LOADED = 4;
type QueueState = "queued" | "downloading" | "parsing" | "cancelled" | "failed";
export type QueueRow = {
  tile: Tile;
  id: string;
  depth: number;
  state: QueueState;
  error: number;
  levels: number;
  /** Recorder time the tile was first scheduled. */
  since: number;
};
const QUEUE_HISTORY_LIMIT = 250;

export type CoverageSummary = {
  presentationMode: "exclusive-mesh" | "exclusive-shadow";
  baseCoverage: ThreeTilesReserveCoverage;
  seamCoverage: ThreeTilesReserveCoverage;
  closureCoverage: ThreeTilesClosureCoverage;
  waitingForBase: boolean;
  floorLoaded: number;
  floorTotal: number;
  floorResidentTiles: number;
  floorResidentBytes: number;
  baseResidentTiles: number;
  baseResidentBytes: number;
  uncovered: number;
  resident: number;
  cachedMB: number;
  ceilingMB: number;
  target: number;
  requested: number;
  ready: boolean;
  paused: boolean;
  full: boolean;
  pending: number;
  displayed: number;
  inFlight: number;
  queued: number;
  downloading: number;
  parsing: number;
  traversalMs: number;
  memoryTarget: number;
};

export const summarizeTileDiagnostics = (
  state: TilesRuntimeDebugState,
  runtimeHandle: ThreeTilesRuntime,
  displayed: number,
  stableCoverage?: CoverageSummary
): CoverageSummary => {
  const tiles = state.tiles as TilesRenderer;
  const cache = tiles.lruCache as unknown as {
    itemSet: Map<Tile, unknown>;
    cachedBytes: number;
    isFull: () => boolean;
  };
  const stats = (
    tiles as unknown as {
      stats: { queued: number; downloading: number; parsing: number };
    }
  ).stats;
  // The accessor owns a bounded sampling cadence. Reserve/material readiness
  // can change even when the overlay's cached legacy floor proof is reusable.
  const currentCoverage = runtimeHandle.loading.getCoverageStatus();
  const coverage = stableCoverage
    ? {
        floorLoaded: stableCoverage.floorLoaded,
        floorTotal: stableCoverage.floorTotal,
        uncoveredFallbackRoots: stableCoverage.uncovered,
      }
    : currentCoverage;
  return {
    presentationMode: currentCoverage.presentationMode,
    baseCoverage: currentCoverage.baseCoverage,
    seamCoverage: currentCoverage.seamCoverage,
    closureCoverage: currentCoverage.closureCoverage,
    waitingForBase: currentCoverage.waitingForBase,
    floorLoaded: coverage.floorLoaded,
    floorTotal: coverage.floorTotal,
    floorResidentTiles: currentCoverage.floorResidentTiles,
    floorResidentBytes: currentCoverage.floorResidentBytes,
    baseResidentTiles: currentCoverage.baseResidentTiles,
    baseResidentBytes: currentCoverage.baseResidentBytes,
    uncovered: coverage.uncoveredFallbackRoots,
    resident: cache.itemSet.size,
    cachedMB: cache.cachedBytes / 1e6,
    ceilingMB: state.ceilingBytes / 1e6,
    target: state.effectiveErrorTarget,
    requested: state.requestedErrorTarget,
    ready: state.meshBaseCoverageReady,
    paused: state.memoryAdmissionPaused || state.loadingPaused,
    full: cache.isFull(),
    pending: state.extentFloorPending,
    displayed,
    inFlight: stats.downloading + stats.parsing,
    queued: stats.queued,
    downloading: stats.downloading,
    parsing: stats.parsing,
    traversalMs: state.lastTraversalMs,
    memoryTarget: state.memoryErrorTarget,
  };
};

// The list keeps a tile until it finished: cancelled and failed requests
// stay visible with their last state so the outcome can be read.
export const updateTileDiagnosticQueue = (
  state: TilesRuntimeDebugState,
  history: Map<Tile, QueueRow>,
  now: number
): QueueRow[] => {
  const tiles = state.tiles as TilesRenderer;
  const target = state.effectiveErrorTarget;
  const active = loadingTilesOf(tiles);
  for (const tile of active) {
    const loadingState = tile.internal?.loadingState;
    const kind: QueueState =
      loadingState === 3
        ? "parsing"
        : loadingState === 2
        ? "downloading"
        : "queued";
    const error = tileError(tile);
    const existing = history.get(tile);
    history.set(tile, {
      tile,
      id: tileId(tile),
      depth: tile.internal?.depth ?? 0,
      state: kind,
      error,
      levels: levelsToTarget(error, target),
      since: existing?.since ?? now,
    });
  }
  for (const [tile, row] of history) {
    if (active.has(tile)) continue;
    const loadingState = tile.internal?.loadingState;
    if (loadingState === LOADED) history.delete(tile);
    else if (row.state !== "cancelled" && row.state !== "failed")
      row.state = loadingState === -1 ? "failed" : "cancelled";
  }
  if (history.size > QUEUE_HISTORY_LIMIT) {
    const settled = [...history.entries()]
      .filter(([, row]) => row.state === "cancelled" || row.state === "failed")
      .sort((a, b) => a[1].since - b[1].since);
    for (const [tile] of settled.slice(0, history.size - QUEUE_HISTORY_LIMIT))
      history.delete(tile);
  }
  const order: Record<QueueState, number> = {
    parsing: 0,
    downloading: 1,
    queued: 2,
    failed: 3,
    cancelled: 4,
  };
  return [...history.values()].sort(
    (a, b) =>
      order[a.state] - order[b.state] || b.since - a.since || b.error - a.error
  );
};
