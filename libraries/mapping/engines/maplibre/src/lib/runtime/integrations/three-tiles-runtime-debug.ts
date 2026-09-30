import type { Tile } from "3d-tiles-renderer/core";
import type { createThreeTilesDiagnostics } from "./three-tiles-runtime-diagnostics";
import type { MeshTileDebugProgress } from "./three-tiles-runtime-types";
import { resolveTileContentUrl } from "./three-tiles-runtime-vendor";

/** Reading or disposing an ordinary runtime must not create a debug registry. */
export const debugTilesRuntimes = (create = false): Set<unknown> | null => {
  if (typeof window === "undefined") return null;
  const host = window as unknown as { __carmaTiles3d?: Set<unknown> };
  if (create) host.__carmaTiles3d ??= new Set();
  return host.__carmaTiles3d ?? null;
};

/** Optional diagnostics capability; capture/overlay modules load only on opt-in. */
export function createThreeTilesDebug(
  state: Parameters<typeof createThreeTilesDiagnostics>[0],
  dependencies: Omit<
    Parameters<typeof createThreeTilesDiagnostics>[1],
    "getStableTileId"
  >
) {
  let diagnostics: ReturnType<typeof createThreeTilesDiagnostics> | undefined;
  let pending: Promise<void> | undefined;
  const enabled = () => state.options.diagnostics === true && !state.disposed;
  const load = () => {
    if (!enabled() || diagnostics || pending) return;
    pending = import("./three-tiles-runtime-diagnostics")
      .then((module) => {
        if (!enabled()) return;
        diagnostics = module.createThreeTilesDiagnostics(state, {
          ...dependencies,
          getStableTileId,
        });
        if (state.tileBoundsVisible) diagnostics.syncTileDebugOverlay();
        state.map?.triggerRepaint();
      })
      .catch((error) => {
        if (enabled()) console.error("Unable to load tile diagnostics", error);
      })
      .finally(() => {
        pending = undefined;
      });
  };
  const register = () => {
    if (enabled() && state.tiles) debugTilesRuntimes(true)?.add(state);
    else debugTilesRuntimes()?.delete(state);
  };
  // Source/cut identities are also required for production shadow caching.
  const getStableTileId = (tile: Tile) => {
    const path: number[] = [];
    for (let entry = tile; entry.parent; entry = entry.parent)
      path.push(entry.parent.children?.indexOf(entry) ?? -1);
    return `${state.tilesetUrl}#${path.reverse().join("/")}:${
      resolveTileContentUrl(tile) ?? "metadata"
    }`;
  };
  const getTileDebugId = (tile: Tile) => {
    let sequence = state.tileDebugIds.get(tile);
    if (sequence === undefined) {
      sequence = state.nextTileDebugId++;
      state.tileDebugIds.set(tile, sequence);
    }
    return `${state.layerId}:${
      tile.content?.uri ?? `d${tile.internal?.depth ?? "?"}:t${sequence}`
    }`;
  };
  const inactiveProgress: MeshTileDebugProgress = {
    discoveredAt: 0,
    iterations: 0,
    lastIterationFrame: -1,
  };
  const getTileDebugProgress = (tile: Tile): MeshTileDebugProgress => {
    if (!enabled() || state.options.tileTelemetry === false)
      return inactiveProgress;
    // Preserve startup timestamps while the optional module is being loaded.
    let progress = state.tileDebugProgress.get(tile);
    if (!progress) {
      progress = {
        discoveredAt: performance.now(),
        iterations: 0,
        lastIterationFrame: -1,
      };
      state.tileDebugProgress.set(tile, progress);
    }
    return progress;
  };
  load();
  return {
    getStableTileId,
    getTileDebugId,
    getTileDebugProgress,
    readState: () => (enabled() ? state : undefined),
    setDiagnosticsEnabled(value: boolean) {
      state.options.diagnostics = value;
      diagnostics?.setDiagnosticsEnabled(value);
      register();
      if (value) load();
    },
    setTelemetryEnabled(value: boolean) {
      state.options.tileTelemetry = value;
      diagnostics?.setTelemetryEnabled(value);
      if (value) {
        state.options.diagnostics = true;
        register();
        load();
      }
    },
    setTileBoundsVisible(value: boolean) {
      if (value) {
        state.options.diagnostics = true;
        register();
      }
      if (diagnostics) {
        diagnostics.setTileBoundsVisible(value);
        return;
      }
      state.tileBoundsVisible = value;
      if (value) {
        state.options.diagnostics = true;
        register();
        load();
      }
    },
    syncTileDebugOverlay: () => {
      if (enabled()) {
        load();
        diagnostics?.syncTileDebugOverlay();
      }
    },
    recordTileIteration: (tile: Tile) => {
      if (enabled()) diagnostics?.recordTileIteration(tile);
    },
    recordTileRequestTrace: (
      ...args: Parameters<
        ReturnType<typeof createThreeTilesDiagnostics>["recordTileRequestTrace"]
      >
    ) => {
      if (enabled() && state.options.tileTelemetry !== false)
        diagnostics?.recordTileRequestTrace(...args);
    },
    reportTileRecovery: (
      ...args: Parameters<
        ReturnType<typeof createThreeTilesDiagnostics>["reportTileRecovery"]
      >
    ) => {
      if (enabled() && state.options.tileTelemetry !== false)
        diagnostics?.reportTileRecovery(...args);
    },
    recordTileRequestDecision: (
      ...args: Parameters<
        ReturnType<
          typeof createThreeTilesDiagnostics
        >["recordTileRequestDecision"]
      >
    ) => {
      if (enabled()) diagnostics?.recordTileRequestDecision(...args);
    },
    recordTileWait: (
      ...args: Parameters<
        ReturnType<typeof createThreeTilesDiagnostics>["recordTileWait"]
      >
    ) => {
      if (enabled()) diagnostics?.recordTileWait(...args);
    },
    beginTileWaitObservation: () => {
      if (enabled()) diagnostics?.beginTileWaitObservation();
    },
    endTileWaitObservation: () => {
      if (enabled()) diagnostics?.endTileWaitObservation();
    },
    drainTileWaitEvents: () => diagnostics?.drainTileWaitEvents() ?? [],
    getTileDiagnosticSteps: (tile: Tile) =>
      enabled() ? diagnostics?.getTileDiagnosticSteps(tile) : undefined,
    reportFrameTelemetry: (
      ...args: Parameters<
        ReturnType<typeof createThreeTilesDiagnostics>["reportFrameTelemetry"]
      >
    ) => {
      if (enabled()) diagnostics?.reportFrameTelemetry(...args);
    },
  };
}
