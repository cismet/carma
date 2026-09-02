import type { Map as MaplibreMap, TerrainSpecification } from "maplibre-gl";

type TerrainHeightSampler = (
  longitude: number,
  latitude: number
) => number | undefined;

type SuppressedTerrainEntry = {
  references: number;
  terrain: TerrainSpecification | null;
  centerClampedToGround: boolean;
  restoreScheduled: boolean;
  clearTerrain: () => void;
};

const samplers = new WeakMap<MaplibreMap, Map<string, TerrainHeightSampler>>();
const listeners = new WeakMap<MaplibreMap, Set<() => void>>();
const loadingRuntimeIds = new WeakMap<MaplibreMap, Set<string>>();
const loadingListeners = new WeakMap<MaplibreMap, Set<() => void>>();
const suppressedTerrain = new WeakMap<MaplibreMap, SuppressedTerrainEntry>();

const notifySharedThreeTerrainLoadingChanged = (map: MaplibreMap) => {
  for (const listener of loadingListeners.get(map) ?? []) listener();
};

export const setSharedThreeTerrainLoading = (
  map: MaplibreMap,
  runtimeId: string,
  loading: boolean
) => {
  const runtimeIds = loadingRuntimeIds.get(map) ?? new Set<string>();
  const changed = loading
    ? !runtimeIds.has(runtimeId)
    : runtimeIds.has(runtimeId);
  if (!changed) return;
  if (loading) {
    runtimeIds.add(runtimeId);
    loadingRuntimeIds.set(map, runtimeIds);
  } else {
    runtimeIds.delete(runtimeId);
    if (runtimeIds.size === 0) loadingRuntimeIds.delete(map);
  }
  notifySharedThreeTerrainLoadingChanged(map);
};

export const isSharedThreeTerrainLoading = (map: MaplibreMap): boolean =>
  (loadingRuntimeIds.get(map)?.size ?? 0) > 0;

export const subscribeSharedThreeTerrainLoading = (
  map: MaplibreMap,
  listener: () => void
): (() => void) => {
  const mapListeners = loadingListeners.get(map) ?? new Set<() => void>();
  mapListeners.add(listener);
  loadingListeners.set(map, mapListeners);
  return () => {
    mapListeners.delete(listener);
    if (mapListeners.size === 0) loadingListeners.delete(map);
  };
};

export const notifySharedThreeTerrainChanged = (map: MaplibreMap) => {
  for (const listener of listeners.get(map) ?? []) listener();
};

export const subscribeSharedThreeTerrain = (
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

export const registerSharedThreeTerrainSampler = (
  map: MaplibreMap,
  id: string,
  sampler: TerrainHeightSampler
): (() => void) => {
  const mapSamplers =
    samplers.get(map) ?? new Map<string, TerrainHeightSampler>();
  mapSamplers.set(id, sampler);
  samplers.set(map, mapSamplers);
  notifySharedThreeTerrainChanged(map);
  return () => {
    mapSamplers.delete(id);
    if (mapSamplers.size === 0) samplers.delete(map);
    notifySharedThreeTerrainChanged(map);
  };
};

export const getSharedThreeTerrainElevation = (
  map: MaplibreMap,
  longitude: number,
  latitude: number
): number | undefined => {
  for (const sampler of samplers.get(map)?.values() ?? []) {
    const height = sampler(longitude, latitude);
    if (Number.isFinite(height)) return height;
  }
  return undefined;
};

/**
 * Removes MapLibre's raster-DEM surface while retaining its specification for
 * restoration. Shared Three terrain samplers remain available to building
 * generation while the raster terrain renderer and tile manager are unloaded.
 */
export const suppressMapLibreTerrainRendering = (
  map: MaplibreMap
): (() => void) => {
  const existing = suppressedTerrain.get(map);
  if (existing) {
    existing.references += 1;
    existing.restoreScheduled = false;
  } else {
    let clearingTerrain = false;
    const clearTerrain = () => {
      if (clearingTerrain || !map.getTerrain() || !map.isStyleLoaded()) return;
      clearingTerrain = true;
      try {
        map.setTerrain(null);
      } finally {
        clearingTerrain = false;
      }
    };
    const entry = {
      references: 1,
      terrain: map.getTerrain() ?? null,
      centerClampedToGround: map.getCenterClampedToGround(),
      restoreScheduled: false,
      clearTerrain,
    };
    suppressedTerrain.set(map, entry);
    if (entry.centerClampedToGround) map.setCenterClampedToGround(false);
    map.on("terrain", clearTerrain);
    map.on("styledata", clearTerrain);
    clearTerrain();
    notifySharedThreeTerrainChanged(map);
  }

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    const entry = suppressedTerrain.get(map);
    if (!entry) return;
    entry.references -= 1;
    if (entry.references > 0 || entry.restoreScheduled) return;
    entry.restoreScheduled = true;
    queueMicrotask(() => {
      entry.restoreScheduled = false;
      if (entry.references > 0 || suppressedTerrain.get(map) !== entry) return;
      map.off("terrain", entry.clearTerrain);
      map.off("styledata", entry.clearTerrain);
      suppressedTerrain.delete(map);
      try {
        if (entry.terrain && map.isStyleLoaded()) map.setTerrain(entry.terrain);
        map.setCenterClampedToGround(entry.centerClampedToGround);
      } finally {
        notifySharedThreeTerrainChanged(map);
      }
    });
  };
};
