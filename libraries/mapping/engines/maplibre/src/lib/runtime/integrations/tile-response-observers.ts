import type { TilesRenderer } from "3d-tiles-renderer";

type TileResponseObservation = {
  url: string;
  contentLength?: number;
  decodedBytes?: number;
};
type TileResponseObserver = (event: TileResponseObservation) => void;
const observers = new WeakMap<TilesRenderer, Set<TileResponseObserver>>();

/** Optional diagnostics use the existing raw-response hook, never another fetch. */
export const subscribeTileResponses = (
  tiles: TilesRenderer,
  observer: TileResponseObserver
) => {
  let listeners = observers.get(tiles);
  if (!listeners) observers.set(tiles, (listeners = new Set()));
  listeners.add(observer);
  return () => {
    listeners.delete(observer);
    if (!listeners.size) observers.delete(tiles);
  };
};

export const notifyTileResponse = (
  tiles: TilesRenderer,
  event: TileResponseObservation
) => {
  for (const observer of observers.get(tiles) ?? []) {
    // A diagnostic listener cannot fail or retry an application download.
    try {
      observer(event);
    } catch {
      /* Observation only. */
    }
  }
};
