import type { Map as MaplibreMap } from "maplibre-gl";

import type { SharedThreeSceneRuntime } from "./shared-three-scene-layer";

const listeners = new WeakMap<MaplibreMap, Set<() => void>>();
const requestStateListeners = new WeakMap<MaplibreMap, Set<() => void>>();
const runtimes = new WeakMap<MaplibreMap, Set<SharedThreeSceneRuntime>>();

const notifyListeners = (
  registry: WeakMap<MaplibreMap, Set<() => void>>,
  map: MaplibreMap
) => {
  for (const listener of registry.get(map) ?? []) listener();
};

const subscribeListeners = (
  registry: WeakMap<MaplibreMap, Set<() => void>>,
  map: MaplibreMap,
  listener: () => void
): (() => void) => {
  const mapListeners = registry.get(map) ?? new Set<() => void>();
  mapListeners.add(listener);
  registry.set(map, mapListeners);
  return () => {
    mapListeners.delete(listener);
    if (mapListeners.size === 0) registry.delete(map);
  };
};

/** Notify consumers such as the shadow simulation after streamed scene data changes. */
export const notifySharedThreeSceneContentChanged = (map: MaplibreMap) => {
  notifyListeners(listeners, map);
};

export const subscribeSharedThreeSceneContent = (
  map: MaplibreMap,
  listener: () => void
): (() => void) => {
  return subscribeListeners(listeners, map, listener);
};

export const notifySharedThreeSceneRequestStateChanged = (
  map: MaplibreMap
) => {
  notifyListeners(requestStateListeners, map);
};

export const subscribeSharedThreeSceneRequestState = (
  map: MaplibreMap,
  listener: () => void
): (() => void) => {
  return subscribeListeners(requestStateListeners, map, listener);
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
