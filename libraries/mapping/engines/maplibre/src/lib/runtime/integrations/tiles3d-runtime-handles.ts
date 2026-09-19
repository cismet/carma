import type { Map as MaplibreMap } from "maplibre-gl";
import type { ThreeTilesRuntime } from "./three-tiles-runtime-types";

/**
 * Runtime handles of the 3D Tiles layers mounted on a map, for hosts that
 * need the full runtime (the tile manager debugger) rather than the shared
 * scene contract. Tiles3dLayerManager registers a handle for the lifetime of
 * its layer. Snapshots are stable between changes, so React can subscribe.
 */
type Entry = {
  handles: Map<string, ThreeTilesRuntime>;
  snapshot: readonly ThreeTilesRuntime[];
  listeners: Set<() => void>;
};

const entries = new WeakMap<MaplibreMap, Entry>();
const EMPTY: readonly ThreeTilesRuntime[] = Object.freeze([]);

const entryOf = (map: MaplibreMap): Entry => {
  let entry = entries.get(map);
  if (!entry) {
    entry = { handles: new Map(), snapshot: EMPTY, listeners: new Set() };
    entries.set(map, entry);
  }
  return entry;
};

const publish = (entry: Entry) => {
  entry.snapshot = entry.handles.size ? [...entry.handles.values()] : EMPTY;
  for (const listener of [...entry.listeners]) listener();
};

export const registerTiles3dRuntimeHandle = (
  map: MaplibreMap,
  id: string,
  runtime: ThreeTilesRuntime
): void => {
  const entry = entryOf(map);
  if (entry.handles.get(id) === runtime) return;
  entry.handles.set(id, runtime);
  publish(entry);
};

export const unregisterTiles3dRuntimeHandle = (
  map: MaplibreMap,
  id: string
): void => {
  const entry = entries.get(map);
  if (!entry?.handles.delete(id)) return;
  publish(entry);
};

/** The mounted runtimes of a map; the same array until a layer comes or goes. */
export const getTiles3dRuntimeHandles = (
  map: MaplibreMap
): readonly ThreeTilesRuntime[] => entries.get(map)?.snapshot ?? EMPTY;

export const subscribeTiles3dRuntimeHandles = (
  map: MaplibreMap,
  listener: () => void
): (() => void) => {
  const entry = entryOf(map);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
};
