import { useCallback, useSyncExternalStore } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import type { LibreLayer } from "../components/LibreMap";

/**
 * What a map was told to show, published per map instance.
 *
 * `LibreMap` receives the resolved layer list as a prop, but only the component
 * itself ever sees it. Anything holding the map handle instead (an addon, a
 * second view of the same content, a debug console) has no way back to that
 * array, and the alternative is making the app hand the same list down a second
 * path through the framework.
 *
 * So the map publishes it, in the shape `cameraRestriction` established: a
 * `WeakMap` keyed by the instance plus a `useSyncExternalStore` hook, so a
 * consumer holding a map reads what is true for that map.
 *
 * Deliberately a mirror, not a source. Writing here changes nothing on the map
 * and `LibreMap` stays the only writer; a consumer that wants different content
 * builds its own map with its own layers rather than writing into this one.
 */

type Entry = {
  layers: readonly LibreLayer[];
  listeners: Set<() => void>;
};

const entries = new WeakMap<MaplibreMap, Entry>();

/** stable identity, so a map without layers never looks like a change */
const EMPTY: readonly LibreLayer[] = [];

/**
 * Element-wise, because callers are not obliged to memoize. A caller that
 * rebuilds an equal array every render would otherwise notify every render,
 * and keeping the first array as the snapshot is what lets `useSyncExternalStore`
 * bail out instead of re-rendering every consumer.
 */
const isSameLayers = (
  a: readonly LibreLayer[],
  b: readonly LibreLayer[]
): boolean => a.length === b.length && a.every((layer, i) => layer === b[i]);

const entryOf = (map: MaplibreMap): Entry => {
  const existing = entries.get(map);
  if (existing) {
    return existing;
  }
  const entry: Entry = { layers: EMPTY, listeners: new Set() };
  entries.set(map, entry);
  return entry;
};

/** Called by `LibreMap` at construction and whenever its `layers` prop changes. */
export const publishMapLayers = (
  map: MaplibreMap,
  layers: readonly LibreLayer[] | undefined
) => {
  const entry = entryOf(map);
  const next = layers ?? EMPTY;
  if (isSameLayers(entry.layers, next)) {
    return;
  }
  entry.layers = next;
  for (const listener of entry.listeners) {
    listener();
  }
};

export const getMapLayers = (
  map: MaplibreMap | null
): readonly LibreLayer[] => (map && entries.get(map)?.layers) ?? EMPTY;

export const subscribeMapLayers = (map: MaplibreMap, listener: () => void) => {
  const entry = entryOf(map);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
};

const NO_MAP_SUBSCRIBE = () => () => undefined;

export const useMapLayers = (
  map: MaplibreMap | null
): readonly LibreLayer[] => {
  const subscribe = useCallback(
    (listener: () => void) =>
      map ? subscribeMapLayers(map, listener) : NO_MAP_SUBSCRIBE(),
    [map]
  );
  const getSnapshot = useCallback(() => getMapLayers(map), [map]);
  return useSyncExternalStore(subscribe, getSnapshot);
};
