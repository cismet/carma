import type { TerrainBaseStage } from "../../core/terrain-base-coverage";
import { terrainTileKey, type TerrainTileId } from "../../core/raster-dem-tile";
import type { TerrainTile } from "../../core/raster-dem-tile";
import type { BufferGeometry } from "three";

import { TerrainMemoryDeferredError } from "../../core/terrain-memory-admission";

type PrepareResult = boolean | "unavailable" | "persisted";

/** Stop waiting for optional storage work as soon as foreground demand returns.
 * The storage owner retains its own bounded accounting until the write settles.
 */
const waitForIdleStorage = async (
  work: Promise<boolean>,
  signal: AbortSignal
) => {
  signal.throwIfAborted();
  let cancel: (() => void) | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        cancel = () => reject(signal.reason);
        signal.addEventListener("abort", cancel, { once: true });
      }),
    ]);
  } finally {
    if (cancel) signal.removeEventListener("abort", cancel);
  }
};

type CompletedStage = Readonly<{
  level: number;
  rasterEdgePixels: number;
  tiles: number;
  bytes: number;
  resident: boolean;
  persisted: boolean;
}>;

/** Optional source-wide reserve. Visible demand owns publication; this queue
 * only prepares hidden geometry after convergence. Complete coarse stages
 * remain pinned before a finer one is attempted, even across camera changes.
 */
export const createRasterDemTerrainBaseCoverage = (options: {
  stages: readonly TerrainBaseStage[];
  memoryBudgetBytes: number;
  confirmPersistedStage?: (
    ids: readonly TerrainTileId[],
    signal: AbortSignal
  ) => Promise<boolean>;
  bytes: (id: TerrainTileId) => number | null;
  prepare: (id: TerrainTileId, signal: AbortSignal) => Promise<PrepareResult>;
  persist: (id: TerrainTileId, signal: AbortSignal) => Promise<boolean>;
  release: (id: TerrainTileId) => void;
  trim: () => void;
}) => {
  const pinned = new Set<string>();
  const stages: CompletedStage[] = [];
  let stageIndex = 0;
  let nextTile = 0;
  let stageBytes = 0;
  let stagePersisted = true;
  let stageResident = true;
  let residentBytes = 0;
  let currentPins: TerrainTileId[] = [];
  let running = false;
  let storageBlocked = false;
  let unavailableTile: TerrainTileId | null = null;
  let memoryBudgetBytes = options.memoryBudgetBytes;
  let previousMemoryBudgetBytes = memoryBudgetBytes;
  let budgetChanged = false;
  const releaseCurrent = () => {
    for (const id of currentPins) {
      pinned.delete(terrainTileKey(id));
      options.release(id);
    }
    currentPins = [];
    options.trim();
  };
  const reconcileBudget = () => {
    if (!budgetChanged || running) return;
    budgetChanged = false;
    // Revoke the finest complete reserves first. Visible ownership is separate
    // and the adapter may keep a revoked tile that still contributes onscreen.
    for (
      let i = stages.length - 1;
      i >= 0 && residentBytes > memoryBudgetBytes;
      i--
    ) {
      const stage = stages[i];
      if (!stage.resident) continue;
      for (const id of options.stages[i].ids) {
        pinned.delete(terrainTileKey(id));
        options.release(id);
      }
      residentBytes -= stage.bytes;
      stages[i] = { ...stage, resident: false };
    }
    if (stageResident && residentBytes + stageBytes > memoryBudgetBytes) {
      stageResident = false;
      releaseCurrent();
    }
    if (memoryBudgetBytes > previousMemoryBudgetBytes) {
      const completedMiss = stages.findIndex((stage) => !stage.resident);
      const resumeAt =
        completedMiss >= 0 ? completedMiss : !stageResident ? stageIndex : -1;
      if (resumeAt >= 0) {
        releaseCurrent();
        stageIndex = resumeAt;
        stages.splice(resumeAt);
        nextTile = 0;
        stageBytes = 0;
        stagePersisted = true;
        stageResident = true;
        storageBlocked = false;
      }
    }
    previousMemoryBudgetBytes = memoryBudgetBytes;
    options.trim();
  };
  const setMemoryBudget = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes < 0 || bytes === memoryBudgetBytes)
      return;
    memoryBudgetBytes = bytes;
    budgetChanged = true;
    reconcileBudget();
  };
  const snapshot = () => ({
    budgetBytes: memoryBudgetBytes,
    residentBytes: residentBytes + (stageResident ? stageBytes : 0),
    pinnedTiles: pinned.size,
    remaining:
      storageBlocked || unavailableTile
        ? 0
        : Math.max(
            0,
            options.stages
              .slice(stageIndex)
              .reduce((sum, stage) => sum + stage.ids.length, 0) - nextTile
          ) +
          Number(
            stageIndex < options.stages.length &&
              nextTile === options.stages[stageIndex].ids.length
          ),
    running,
    storageBlocked,
    unavailableTile,
    stages: [...stages],
    residentLevel:
      stages.filter((stage) => stage.resident).at(-1)?.level ?? null,
  });
  const run = async (signal: AbortSignal, isCurrent: () => boolean) => {
    if (running || storageBlocked || unavailableTile || signal.aborted)
      return 0;
    running = true;
    let prepared = 0;
    try {
      while (
        stageIndex < options.stages.length &&
        !signal.aborted &&
        isCurrent()
      ) {
        const stage = options.stages[stageIndex];
        // A cancelled protection transaction resumes here without downloading
        // or accounting the final tile twice. Only complete resident stages pin
        // disk ancestors; optional finer disk stages stay eviction candidates.
        if (nextTile === stage.ids.length) {
          if (
            stagePersisted &&
            stageResident &&
            options.confirmPersistedStage
          ) {
            let confirmed = false;
            try {
              confirmed = await waitForIdleStorage(
                options.confirmPersistedStage(stage.ids, signal),
                signal
              );
            } catch {
              // Interrupted optional storage must resume at this completed
              // stage, preserving its resident cut and exact accounting.
              if (signal.aborted || !isCurrent()) break;
            }
            if (signal.aborted || !isCurrent()) break;
            stagePersisted = confirmed;
          }
          stages.push({
            level: stage.level,
            rasterEdgePixels: stage.rasterEdgePixels,
            tiles: nextTile,
            bytes: stageBytes,
            resident: stageResident,
            persisted: stagePersisted,
          });
          if (stageResident) residentBytes += stageBytes;
          else releaseCurrent();
          currentPins = [];
          stageIndex++;
          nextTile = 0;
          stageBytes = 0;
          stageResident = true;
          // Storage unavailability must not turn a disk-only pyramid into a
          // recurring network/remesh task. Already complete RAM stages survive.
          if (!stagePersisted && !stages.at(-1)!.resident)
            storageBlocked = true;
          stagePersisted = true;
          if (storageBlocked) break;
          continue;
        }
        const id = stage.ids[nextTile];
        // Yield even when all subsequent work hits memory or local storage.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (signal.aborted || !isCurrent()) break;
        const ready = await options.prepare(id, signal);
        if (ready === "unavailable") {
          unavailableTile = id;
          releaseCurrent();
          stageBytes = 0;
          break;
        }
        if (!ready) break;
        if (signal.aborted || !isCurrent()) break;
        const bytes = options.bytes(id) ?? 0;
        const stored = await options.persist(id, signal);
        if (signal.aborted || !isCurrent()) break;
        stageBytes += bytes;
        if (ready === "persisted") {
          // A durable tile need not fit beside the active view. Its incomplete
          // RAM level must never be certified as the next resident fallback.
          stageResident = false;
          releaseCurrent();
        }
        const key = terrainTileKey(id);
        if (stageResident && residentBytes + stageBytes <= memoryBudgetBytes) {
          pinned.add(key);
          currentPins.push(id);
        } else {
          // An incomplete fine stage is never a fallback. Release its partial
          // buffers as soon as it cannot fit, preserving every complete reserve.
          stageResident = false;
          releaseCurrent();
          options.release(id);
        }
        stagePersisted &&= stored;
        prepared++;
        nextTile++;
        options.trim();
        if (!stageResident && !stored) {
          storageBlocked = true;
          break;
        }
      }
    } finally {
      running = false;
      reconcileBudget();
    }
    return prepared;
  };
  return { pinned, snapshot, run, setMemoryBudget };
};

type PreparedTerrain = Readonly<{
  tile: TerrainTile;
  projectedGeometry: BufferGeometry | null;
  reliefVertexMask: Uint8Array;
  cachedEcefGeometry: BufferGeometry | null;
}>;

/** Native raster seams and geodetic presentation stay adapter responsibilities;
 * source-wide queue/residency and persistence decisions have one owner here.
 */
export const createRasterDemTerrainBaseCache = (options: {
  stages: readonly TerrainBaseStage[];
  memoryBudgetBytes: number;
  confirmPersistedStage?: (
    ids: readonly TerrainTileId[],
    signal: AbortSignal
  ) => Promise<boolean>;
  bytes: (id: TerrainTileId) => number | null;
  load: (id: TerrainTileId, signal: AbortSignal) => Promise<PreparedTerrain>;
  persistPrepared: (
    prepared: PreparedTerrain,
    signal: AbortSignal
  ) => Promise<boolean>;
  install: (prepared: PreparedTerrain, id: TerrainTileId) => void;
  isDisposed: () => boolean;
  isUnavailable?: (error: unknown) => boolean;
  release: (id: TerrainTileId) => void;
  trim: () => void;
}) => {
  const persistence = new Map<string, boolean>();
  const preparedBytes = new Map<string, number>();
  return createRasterDemTerrainBaseCoverage({
    stages: options.stages,
    memoryBudgetBytes: options.memoryBudgetBytes,
    confirmPersistedStage: options.confirmPersistedStage,
    bytes: (id) =>
      options.bytes(id) ?? preparedBytes.get(terrainTileKey(id)) ?? null,
    prepare: async (id, signal) => {
      let prepared: PreparedTerrain | null = null;
      let stored = false;
      try {
        prepared = await options.load(id, signal);
        if (options.isDisposed() || signal.aborted) return false;
        // Save one pristine prepared presentation before neighbour-dependent seams.
        stored = await waitForIdleStorage(
          options.persistPrepared(prepared, signal),
          signal
        );
        if (options.isDisposed() || signal.aborted) return false;
        options.install(prepared, id);
        preparedBytes.delete(terrainTileKey(id));
        prepared = null; // Installed geometry is now owned by the runtime.
        persistence.set(terrainTileKey(id), stored);
        return true;
      } catch (error) {
        if (
          error instanceof TerrainMemoryDeferredError &&
          stored &&
          !signal.aborted
        ) {
          const key = terrainTileKey(id);
          persistence.set(key, true);
          if (error.requiredBytes !== undefined)
            preparedBytes.set(key, error.requiredBytes);
          return "persisted";
        }
        // Cache/idle failure never changes visible readiness or foreground retry.
        return !signal.aborted && options.isUnavailable?.(error)
          ? "unavailable"
          : false;
      } finally {
        prepared?.projectedGeometry?.dispose();
        prepared?.cachedEcefGeometry?.dispose();
      }
    },
    persist: async (id) => persistence.get(terrainTileKey(id)) ?? false,
    release: options.release,
    trim: options.trim,
  });
};
