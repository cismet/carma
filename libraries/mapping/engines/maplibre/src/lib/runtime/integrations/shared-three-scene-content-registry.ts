import type { Map as MaplibreMap } from "maplibre-gl";

import type { SharedThreeSceneRuntime } from "./shared-three-scene-layer";

const listeners = new WeakMap<MaplibreMap, Set<() => void>>();
const runtimes = new WeakMap<MaplibreMap, Set<SharedThreeSceneRuntime>>();

/** Notify consumers such as the shadow simulation after streamed scene data changes. */
export const notifySharedThreeSceneContentChanged = (map: MaplibreMap) => {
  for (const listener of listeners.get(map) ?? []) listener();
};

export const subscribeSharedThreeSceneContent = (
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

export const getSharedThreeSceneRuntimes = (
  map: MaplibreMap
): readonly SharedThreeSceneRuntime[] => [...(runtimes.get(map) ?? [])];

export const registerSharedThreeSceneRuntime = (
  map: MaplibreMap,
  runtime: SharedThreeSceneRuntime
): (() => void) => {
  const mapRuntimes = runtimes.get(map) ?? new Set<SharedThreeSceneRuntime>();
  mapRuntimes.add(runtime);
  runtimes.set(map, mapRuntimes);
  notifySharedThreeSceneContentChanged(map);
  return () => {
    mapRuntimes.delete(runtime);
    if (mapRuntimes.size === 0) runtimes.delete(map);
    notifySharedThreeSceneContentChanged(map);
  };
};
