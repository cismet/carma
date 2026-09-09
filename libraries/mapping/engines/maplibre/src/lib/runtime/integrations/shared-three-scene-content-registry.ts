import type { Map as MaplibreMap } from "maplibre-gl";
import type { Box3, Object3D } from "three";

import type { SharedThreeSceneRuntime } from "./shared-three-scene-layer";

export type SharedThreeSceneContentChange = Readonly<{
  bounds?: readonly Box3[];
  roots?: readonly Object3D[];
}>;

type SharedThreeSceneContentListener = (
  change?: SharedThreeSceneContentChange
) => void;

const listeners = new WeakMap<
  MaplibreMap,
  Set<SharedThreeSceneContentListener>
>();
const requestStateListeners = new WeakMap<MaplibreMap, Set<() => void>>();
const runtimes = new WeakMap<MaplibreMap, Set<SharedThreeSceneRuntime>>();
const shadedPresentation = new WeakSet<MaplibreMap>();
const presentationListeners = new WeakMap<MaplibreMap, Set<() => void>>();

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
export const notifySharedThreeSceneContentChanged = (
  map: MaplibreMap,
  change?: SharedThreeSceneContentChange
) => {
  for (const listener of listeners.get(map) ?? []) listener(change);
};

export const subscribeSharedThreeSceneContent = (
  map: MaplibreMap,
  listener: SharedThreeSceneContentListener
): (() => void) => {
  const mapListeners =
    listeners.get(map) ?? new Set<SharedThreeSceneContentListener>();
  mapListeners.add(listener);
  listeners.set(map, mapListeners);
  return () => {
    mapListeners.delete(listener);
    if (mapListeners.size === 0) listeners.delete(map);
  };
};

/** A shaded custom pass has reached the framebuffer (not merely been loaded). */
export const hasSharedThreeShadedPresentation = (map: MaplibreMap): boolean =>
  shadedPresentation.has(map);

export const setSharedThreeShadedPresentation = (
  map: MaplibreMap,
  presented: boolean
) => {
  if (shadedPresentation.has(map) === presented) return;
  if (presented) shadedPresentation.add(map);
  else shadedPresentation.delete(map);
  notifyListeners(presentationListeners, map);
};

export const subscribeSharedThreeShadedPresentation = (
  map: MaplibreMap,
  listener: () => void
): (() => void) => subscribeListeners(presentationListeners, map, listener);

export const notifySharedThreeSceneRequestStateChanged = (map: MaplibreMap) => {
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
