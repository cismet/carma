import { useCallback, useSyncExternalStore } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

/**
 * Whether a map draws three.js geometry, and with which runtime parameters,
 * published per map instance.
 *
 * Which layers are 3D is decided by the style: a layer whose metadata carries
 * `carmaConf.3d` is picked up by `LibreMap` and handed to the three.js engine.
 * Whether that happens at all is decided by the host, through the
 * `threeRuntimeParams` prop, and only `LibreMap` ever sees it.
 *
 * A second view of the same content therefore has no way to tell whether the
 * map it is mirroring shows buildings or a flat footprint, and building a
 * comparison panel without that prop silently drops the third dimension no
 * matter what the layer declares. So the map publishes it, in the same shape
 * `mapLayers` publishes the layer list: a `WeakMap` keyed by the instance plus
 * a `useSyncExternalStore` hook.
 *
 * A mirror, not a source. Writing here changes nothing on the map; `LibreMap`
 * stays the only writer.
 */

export type ThreeRuntimeParams = Record<string, number | string>;

type Entry = {
  params: ThreeRuntimeParams | undefined;
  listeners: Set<() => void>;
};

const entries = new WeakMap<MaplibreMap, Entry>();

/**
 * Entry-wise, because a host is not obliged to memoize the object. A host that
 * rebuilds an equal record every render would otherwise notify every render,
 * and keeping the first object as the snapshot is what lets
 * `useSyncExternalStore` bail out instead of re-rendering every consumer.
 */
const isSameParams = (
  a: ThreeRuntimeParams | undefined,
  b: ThreeRuntimeParams | undefined
): boolean => {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
  );
};

const entryOf = (map: MaplibreMap): Entry => {
  const existing = entries.get(map);
  if (existing) {
    return existing;
  }
  const entry: Entry = { params: undefined, listeners: new Set() };
  entries.set(map, entry);
  return entry;
};

/** Called by `LibreMap` at construction and whenever the prop changes. */
export const publishMapThreeRuntimeParams = (
  map: MaplibreMap,
  params: ThreeRuntimeParams | undefined
) => {
  const entry = entryOf(map);
  if (isSameParams(entry.params, params)) {
    return;
  }
  entry.params = params;
  for (const listener of entry.listeners) {
    listener();
  }
};

/** `undefined` when the map draws no three.js geometry at all. */
export const getMapThreeRuntimeParams = (
  map: MaplibreMap | null
): ThreeRuntimeParams | undefined => (map ? entries.get(map)?.params : undefined);

export const subscribeMapThreeRuntimeParams = (
  map: MaplibreMap,
  listener: () => void
) => {
  const entry = entryOf(map);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
};

const NO_MAP_SUBSCRIBE = () => () => undefined;

export const useMapThreeRuntimeParams = (
  map: MaplibreMap | null
): ThreeRuntimeParams | undefined => {
  const subscribe = useCallback(
    (listener: () => void) =>
      map ? subscribeMapThreeRuntimeParams(map, listener) : NO_MAP_SUBSCRIBE(),
    [map]
  );
  const getSnapshot = useCallback(() => getMapThreeRuntimeParams(map), [map]);
  return useSyncExternalStore(subscribe, getSnapshot);
};
