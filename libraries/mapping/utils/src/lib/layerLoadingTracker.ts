/**
 * LayerLoadingTracker - per-layer loading/error state for MapLibre maps.
 *
 * MapLibre reports loading per *source*, while the UI (layer buttons) thinks in
 * terms of the host app's layers. A layer can map to several sources (a vector
 * style brings its own set, a background spec can expand into multiple named
 * layers), so the composer registers `carmaLayerId -> sourceIds` here and this
 * tracker aggregates the state back per layer.
 *
 * One instance per map, attached to the map object, with a single set of event
 * listeners regardless of how many layer buttons subscribe.
 *
 * This is the MapLibre counterpart to the Leaflet `useLayerLoading` hook.
 */

import type { Map as MaplibreMap } from "maplibre-gl";

export interface LayerLoadingState {
  loading: boolean;
  error: boolean;
}

export const EMPTY_LAYER_LOADING_STATE: LayerLoadingState = {
  loading: false,
  error: false,
};

export type LayerLoadingSnapshot = Record<string, LayerLoadingState>;

const EMPTY_SNAPSHOT: LayerLoadingSnapshot = {};

const TRACKER_KEY = "__carmaLayerLoadingTracker";

export class LayerLoadingTracker {
  private map: MaplibreMap;
  /** carmaLayerId -> source ids belonging to it */
  private sourcesByLayer = new Map<string, Set<string>>();
  /** source id -> carmaLayerId (reverse lookup for error events) */
  private layerBySource = new Map<string, string>();
  /** Layers whose sub-style is being built but has no sources yet (async style fetch) */
  private preparing = new Set<string>();
  /** Sources that errored since their last successful load */
  private erroredSources = new Set<string>();
  /** Layers whose sub-style could not be built at all */
  private failedLayers = new Set<string>();
  private listeners = new Set<() => void>();
  private snapshot: LayerLoadingSnapshot = EMPTY_SNAPSHOT;
  private frame: number | null = null;
  private destroyed = false;

  constructor(map: MaplibreMap) {
    this.map = map;
    map.on("sourcedataloading", this.handleMapEvent);
    map.on("sourcedata", this.handleMapEvent);
    map.on("dataabort", this.handleMapEvent);
    map.on("idle", this.handleMapEvent);
    map.on("error", this.handleError);
  }

  markPreparing(carmaLayerId: string): void {
    this.preparing.add(carmaLayerId);
    this.scheduleRecompute();
  }

  markFailed(carmaLayerId: string): void {
    this.preparing.delete(carmaLayerId);
    this.failedLayers.add(carmaLayerId);
    this.scheduleRecompute();
  }

  registerSources(carmaLayerId: string, sourceIds: string[]): void {
    this.preparing.delete(carmaLayerId);
    this.failedLayers.delete(carmaLayerId);
    let sources = this.sourcesByLayer.get(carmaLayerId);
    if (!sources) {
      sources = new Set();
      this.sourcesByLayer.set(carmaLayerId, sources);
    }
    for (const sourceId of sourceIds) {
      sources.add(sourceId);
      this.layerBySource.set(sourceId, carmaLayerId);
    }
    this.scheduleRecompute();
  }

  unregisterSources(carmaLayerId: string, sourceIds: string[]): void {
    this.preparing.delete(carmaLayerId);
    this.failedLayers.delete(carmaLayerId);
    const sources = this.sourcesByLayer.get(carmaLayerId);
    for (const sourceId of sourceIds) {
      sources?.delete(sourceId);
      this.layerBySource.delete(sourceId);
      this.erroredSources.delete(sourceId);
    }
    if (sources && sources.size === 0) {
      this.sourcesByLayer.delete(carmaLayerId);
    }
    this.scheduleRecompute();
  }

  reset(): void {
    this.sourcesByLayer.clear();
    this.layerBySource.clear();
    this.preparing.clear();
    this.erroredSources.clear();
    this.failedLayers.clear();
    this.scheduleRecompute();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): LayerLoadingSnapshot {
    return this.snapshot;
  }

  getLayerState(carmaLayerId: string): LayerLoadingState {
    return this.snapshot[carmaLayerId] ?? EMPTY_LAYER_LOADING_STATE;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.map.off("sourcedataloading", this.handleMapEvent);
    this.map.off("sourcedata", this.handleMapEvent);
    this.map.off("dataabort", this.handleMapEvent);
    this.map.off("idle", this.handleMapEvent);
    this.map.off("error", this.handleError);
    this.listeners.clear();
    this.reset();
  }

  private handleMapEvent = () => {
    this.scheduleRecompute();
  };

  private handleError = (event: unknown) => {
    const sourceId = (event as { sourceId?: string })?.sourceId;
    if (!sourceId || !this.layerBySource.has(sourceId)) {
      return;
    }
    console.debug("[LAYER LOADING] source error", sourceId, event);
    this.erroredSources.add(sourceId);
    this.scheduleRecompute();
  };

  private scheduleRecompute(): void {
    if (this.destroyed || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.recompute();
    });
  }

  private isSourceLoaded(sourceId: string): boolean {
    try {
      if (!this.map.getSource(sourceId)) {
        return false;
      }
      return this.map.isSourceLoaded(sourceId);
    } catch {
      return false;
    }
  }

  private recompute(): void {
    const next: LayerLoadingSnapshot = {};

    for (const carmaLayerId of this.preparing) {
      next[carmaLayerId] = { loading: true, error: false };
    }
    for (const carmaLayerId of this.failedLayers) {
      next[carmaLayerId] = { loading: false, error: true };
    }

    for (const [carmaLayerId, sourceIds] of this.sourcesByLayer) {
      let loading = this.preparing.has(carmaLayerId);
      let error = this.failedLayers.has(carmaLayerId);
      for (const sourceId of sourceIds) {
        const loaded = this.isSourceLoaded(sourceId);
        if (!loaded) {
          loading = true;
        } else {
          // A source that came back successfully clears its earlier error,
          // mirroring the Leaflet hook's tileload -> setError(false).
          this.erroredSources.delete(sourceId);
        }
        if (this.erroredSources.has(sourceId)) {
          error = true;
        }
      }
      next[carmaLayerId] = { loading, error };
    }

    if (!hasSnapshotChanged(this.snapshot, next)) {
      return;
    }
    this.snapshot = next;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

const hasSnapshotChanged = (
  prev: LayerLoadingSnapshot,
  next: LayerLoadingSnapshot
): boolean => {
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  if (prevKeys.length !== nextKeys.length) {
    return true;
  }
  return nextKeys.some((key) => {
    const a = prev[key];
    const b = next[key];
    return !a || a.loading !== b.loading || a.error !== b.error;
  });
};

export const ensureLayerLoadingTracker = (
  map: MaplibreMap
): LayerLoadingTracker => {
  const store = map as unknown as Record<string, unknown>;
  const existing = store[TRACKER_KEY] as LayerLoadingTracker | undefined;
  if (existing) {
    return existing;
  }
  const tracker = new LayerLoadingTracker(map);
  store[TRACKER_KEY] = tracker;
  return tracker;
};

export const getLayerLoadingTracker = (
  map: MaplibreMap | null | undefined
): LayerLoadingTracker | undefined => {
  if (!map) return undefined;
  return (map as unknown as Record<string, unknown>)[TRACKER_KEY] as
    | LayerLoadingTracker
    | undefined;
};
