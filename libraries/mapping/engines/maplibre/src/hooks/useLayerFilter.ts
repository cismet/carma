/**
 * useLayerFilter - Generic layer visibility toggling for MapLibre maps.
 *
 * Manages a set of filter categories that control which map layers are visible.
 * Each category maps to source layers (for feature filtering) and layer ID
 * patterns (for visibility toggling via setLayoutProperty).
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

export interface FilterCategory {
  key: string;
  label: string;
  sourceLayers: string[];
  layerPatterns: string[];
}

export interface UseLayerFilterOptions {
  map: MaplibreMap | null;
  categories: FilterCategory[];
  /** Initial state. Default: all enabled */
  initialState?: Record<string, boolean>;
}

export interface UseLayerFilterResult {
  enabledFilters: Record<string, boolean>;
  setFilterEnabled: (key: string, enabled: boolean) => void;
  toggleFilter: (key: string) => void;
  activeSourceLayers: Set<string>;
  /** Set all filters at once */
  setAllFilters: (state: Record<string, boolean>) => void;
}

export const useLayerFilter = ({
  map,
  categories,
  initialState,
}: UseLayerFilterOptions): UseLayerFilterResult => {
  const [enabledFilters, setEnabledFilters] = useState<Record<string, boolean>>(
    () =>
      initialState ?? Object.fromEntries(categories.map((c) => [c.key, true]))
  );

  const setFilterEnabled = useCallback((key: string, enabled: boolean) => {
    setEnabledFilters((prev) => ({ ...prev, [key]: enabled }));
  }, []);

  const toggleFilter = useCallback((key: string) => {
    setEnabledFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const setAllFilters = useCallback((state: Record<string, boolean>) => {
    setEnabledFilters(state);
  }, []);

  // Compute the set of active source layers from enabled categories
  const activeSourceLayers = useMemo(() => {
    const set = new Set<string>();
    for (const cat of categories) {
      if (enabledFilters[cat.key]) {
        for (const sl of cat.sourceLayers) set.add(sl);
      }
    }
    return set;
  }, [categories, enabledFilters]);

  // Toggle map layer visibility when filters change
  useEffect(() => {
    if (!map) return;
    const style = map.getStyle();
    if (!style?.layers) return;

    for (const cat of categories) {
      const visible = enabledFilters[cat.key] !== false;
      for (const layer of style.layers) {
        const matchesPattern = cat.layerPatterns.some((p) =>
          layer.id.toLowerCase().includes(p)
        );
        if (matchesPattern) {
          map.setLayoutProperty(
            layer.id,
            "visibility",
            visible ? "visible" : "none"
          );
        }
      }
    }
  }, [map, categories, enabledFilters]);

  return {
    enabledFilters,
    setFilterEnabled,
    toggleFilter,
    activeSourceLayers,
    setAllFilters,
  };
};
