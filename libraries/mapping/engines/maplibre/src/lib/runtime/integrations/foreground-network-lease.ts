import type { Map as MaplibreMap } from "maplibre-gl";

import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";
import type { SharedThreeSceneRuntime } from "../../core/shared-three-scene-types";
import {
  acquireMapLibreTerrainDemandPause,
  getMapLibreRasterDemSourceIds,
} from "./maplibre-terrain-demand";
import {
  getSharedThreeSceneRuntimes,
  subscribeSharedThreeSceneRuntimes,
} from "./shared-three-scene-content-registry";

/** Upper bound for one acquisition: a stuck foreground must not freeze the map. */
export const FOREGROUND_NETWORK_MAX_HOLD_MS = 4000;

export type ForegroundNetworkOptions = Readonly<{
  /** The acquisition releases itself after this long. */
  maxHoldMs?: number;
}>;

type Hold = {
  leases: Map<symbol, string>;
  /** Runtimes this hold paused; only these are resumed. */
  runtimes: Set<SharedThreeSceneRuntime>;
  demandPauses: Map<string, () => void>;
  detach: () => void;
  timers: Set<ReturnType<typeof setTimeout>>;
};

const holds = new WeakMap<MaplibreMap, Hold>();
const listeners = new WeakMap<MaplibreMap, Set<() => void>>();

const notify = (map: MaplibreMap) => {
  for (const listener of [...(listeners.get(map) ?? [])]) listener();
};

/** Pause every producer present now; called again when runtimes or sources appear. */
const apply = (map: MaplibreMap, hold: Hold) => {
  const currentRuntimes = new Set(getSharedThreeSceneRuntimes(map));
  for (const runtime of hold.runtimes) {
    if (currentRuntimes.has(runtime)) continue;
    hold.runtimes.delete(runtime);
    try {
      runtime.setLoadingPaused?.(false);
    } catch {
      // Removed runtimes may already be disposed.
    }
  }
  for (const runtime of currentRuntimes) {
    if (hold.runtimes.has(runtime) || !runtime.setLoadingPaused) continue;
    hold.runtimes.add(runtime);
    try {
      runtime.setLoadingPaused(true);
    } catch {
      // A runtime torn down between lookup and call has nothing to pause.
    }
  }
  for (const sourceId of getMapLibreRasterDemSourceIds(map))
    if (!hold.demandPauses.has(sourceId))
      hold.demandPauses.set(
        sourceId,
        acquireMapLibreTerrainDemandPause(map, sourceId)
      );
};

const end = (map: MaplibreMap, hold: Hold) => {
  if (holds.get(map) !== hold) return;
  holds.delete(map);
  hold.leases.clear();
  for (const timer of hold.timers) clearTimeout(timer);
  hold.timers.clear();
  hold.detach();
  for (const runtime of hold.runtimes)
    try {
      runtime.setLoadingPaused?.(false);
    } catch {
      // Resuming a disposed runtime is a no-op.
    }
  hold.runtimes.clear();
  for (const release of hold.demandPauses.values()) release();
  hold.demandPauses.clear();
  notify(map);
};

const begin = (map: MaplibreMap): Hold => {
  const hold: Hold = {
    leases: new Map(),
    runtimes: new Set(),
    demandPauses: new Map(),
    detach: () => undefined,
    timers: new Set(),
  };
  const reapply = () => {
    if (holds.get(map) === hold) apply(map, hold);
  };
  const onSourceData = (event: { sourceDataType?: string }) => {
    if (event.sourceDataType === "metadata") reapply();
  };
  const onRemove = () => end(map, hold);
  const unsubscribe = subscribeSharedThreeSceneRuntimes(map, reapply);
  map.on(MAPLIBRE_EVENT.STYLE_DATA, reapply);
  map.on(MAPLIBRE_EVENT.SOURCE_DATA, onSourceData);
  map.on(MAPLIBRE_EVENT.REMOVE, onRemove);
  hold.detach = () => {
    unsubscribe();
    map.off(MAPLIBRE_EVENT.STYLE_DATA, reapply);
    map.off(MAPLIBRE_EVENT.SOURCE_DATA, onSourceData);
    map.off(MAPLIBRE_EVENT.REMOVE, onRemove);
  };
  holds.set(map, hold);
  apply(map, hold);
  return hold;
};

/**
 * Give one foreground download the map's shared connection: while any lease is
 * held, background producers start no new downloads (shared Three runtimes such
 * as mesh and terrain, native MapLibre raster-dem sources). In-flight requests
 * finish, caches stay; producers that appear while held are paused as well.
 * Reference-counted per map; each acquisition releases itself after
 * `maxHoldMs`, the returned release is idempotent.
 */
export const acquireForegroundNetwork = (
  map: MaplibreMap,
  reason: string,
  options: ForegroundNetworkOptions = {}
): (() => void) => {
  const existing = holds.get(map);
  const hold = existing ?? begin(map);
  const id = Symbol(reason);
  hold.leases.set(id, reason);
  if (!existing) notify(map);
  let released = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    if (timer !== undefined) hold.timers.delete(timer);
    if (holds.get(map) !== hold || !hold.leases.delete(id)) return;
    if (hold.leases.size === 0) end(map, hold);
  };
  const requestedHoldMs = options.maxHoldMs ?? FOREGROUND_NETWORK_MAX_HOLD_MS;
  timer = setTimeout(
    release,
    Number.isFinite(requestedHoldMs)
      ? Math.max(0, requestedHoldMs)
      : FOREGROUND_NETWORK_MAX_HOLD_MS
  );
  hold.timers.add(timer);
  return release;
};

export const isForegroundNetworkHeld = (map: MaplibreMap): boolean =>
  holds.has(map);

/** Reasons of the current acquisitions, for diagnostics. */
export const getForegroundNetworkReasons = (
  map: MaplibreMap
): readonly string[] => [...(holds.get(map)?.leases.values() ?? [])];

/** Called when the map's lease is taken or fully released. */
export const subscribeForegroundNetwork = (
  map: MaplibreMap,
  listener: () => void
): (() => void) => {
  const mapListeners = listeners.get(map) ?? new Set<() => void>();
  mapListeners.add(listener);
  listeners.set(map, mapListeners);
  return () => {
    mapListeners.delete(listener);
    if (mapListeners.size === 0) listeners.delete(map);
  };
};
