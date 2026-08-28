import type { Map as MaplibreMap, TerrainSpecification } from "maplibre-gl";

type TerrainHeightSampler = (
  longitude: number,
  latitude: number
) => number | undefined;

type SuppressedTerrainEntry = {
  references: number;
  terrain: TerrainSpecification | null;
  clearTerrain: () => void;
};

const samplers = new WeakMap<MaplibreMap, Map<string, TerrainHeightSampler>>();
const listeners = new WeakMap<MaplibreMap, Set<() => void>>();
const suppressedTerrain = new WeakMap<MaplibreMap, SuppressedTerrainEntry>();

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
      clearTerrain,
    };
    suppressedTerrain.set(map, entry);
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
    if (entry.references > 0) return;
    map.off("terrain", entry.clearTerrain);
    map.off("styledata", entry.clearTerrain);
    suppressedTerrain.delete(map);
    try {
      if (entry.terrain && map.isStyleLoaded()) map.setTerrain(entry.terrain);
    } finally {
      notifySharedThreeTerrainChanged(map);
    }
  };
};
