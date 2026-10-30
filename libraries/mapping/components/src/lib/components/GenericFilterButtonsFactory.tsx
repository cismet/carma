import type { ButtonsFilterConfig } from "@carma-mapping/layers";
import { useState, useEffect } from "react";

// Types for filter configuration
export interface FilterOption {
  key: string;
  label: string;
  icon?: string;
  /** Alternative icon to show when filter is inactive (e.g., red dot vs green dot) */
  inactiveIcon?: string;
  /** Property name in the feature to check */
  propertyName: string;
  /** Value that the property should have when filter is active */
  propertyValue: string;
  /** Whether to show icon in grayscale when not selected (ignored if inactiveIcon is set) */
  grayscaleWhenInactive?: boolean;
  color?: string;
}

export interface FilterInfo {
  activeCount: number;
  totalCount: number;
  isShowingAll: boolean;
}

export interface GenericFilterButtonsProps {
  maplibreMap: any;
  selectedFeature: any;
  setSelectedFeature: (feature: any) => void;
  config: ButtonsFilterConfig;
  onFilterChange?: (filterInfo: FilterInfo, filterState: FilterState) => void;
  skipFeatureMatchCheck?: boolean;
  initialFilters?: FilterState;
}

export type FilterState = Record<string, boolean>;

// Module-level cache for original layer filters, keyed by layerPattern.
// Survives closure recreation when the FilterComponent is unmounted and
// remounted via useMemo in the parent.
const originalFiltersCache = new Map<string, Record<string, any[] | null>>();

/**
 * Capture and cache the original (unfiltered) layer filters from the map.
 * Must be called BEFORE applying any restored filters so that the cache
 * holds the true originals. GenericFilterButtons will then skip its own
 * capture when it sees the cache is already populated.
 */
const readOriginalFilter = (layer: any): any[] | null => {
  const metaOriginal = layer?.metadata?.originalFilter;
  if (metaOriginal !== undefined) {
    return metaOriginal;
  }
  return layer?.filter || null;
};

export const captureOriginalFilters = (
  layerPattern: string,
  maplibreMap: any
): Record<string, any[] | null> => {
  if (originalFiltersCache.has(layerPattern)) {
    return originalFiltersCache.get(layerPattern)!;
  }

  const layers = maplibreMap.getStyle()?.layers || [];
  const targetLayers = layers.filter((layer: any) =>
    layer.id.toLowerCase().includes(layerPattern.toLowerCase())
  );

  const captured: Record<string, any[] | null> = {};
  targetLayers.forEach((layer: any) => {
    captured[layer.id] = readOriginalFilter(layer);
  });

  originalFiltersCache.set(layerPattern, captured);
  return captured;
};

// Function to build filter expression from selected filters
export const buildFilterExpression = (
  config: ButtonsFilterConfig,
  filters: FilterState
): any[] | null => {
  const isOrMode = config.filterMode === "or";

  if (isOrMode) {
    const conditions: any[] = [];

    config.filters.forEach((filterOption) => {
      if (filters[filterOption.key]) {
        conditions.push([
          "==",
          ["get", filterOption.propertyName],
          filterOption.propertyValue,
        ]);
      }
    });

    if (conditions.length === 0) {
      return [
        "==",
        ["get", config.filters[0]?.propertyName || "wohnlage"],
        "___HIDE_ALL___",
      ];
    }

    return ["any", ...conditions];
  } else {
    if (filters.alle) {
      return null;
    }

    const conditions: any[] = [];

    config.filters.forEach((filterOption) => {
      if (filters[filterOption.key]) {
        conditions.push([
          "==",
          ["get", filterOption.propertyName],
          filterOption.propertyValue,
        ]);
      }
    });

    if (conditions.length > 0) {
      return ["all", ...conditions];
    }

    return null;
  }
};

/**
 * The filter buttons as MapLibre global state: `filter:<layerPattern>:<key>`,
 * true while the button is selected. A style reads it with
 * ["global-state", name] for what a filter on its features cannot do, like
 * laying out what a filter leaves of a group of overlapping points. Only the
 * names a style declares in its root `state` are set.
 */
export const buildFilterGlobalState = (
  config: ButtonsFilterConfig,
  filters: FilterState
): Record<string, boolean> =>
  Object.fromEntries(
    config.filters.map((filterOption) => [
      `filter:${config.layerPattern}:${filterOption.key}`,
      Boolean(filters[filterOption.key]),
    ])
  );

export const applyFilterGlobalState = (
  maplibreMap: any,
  config: ButtonsFilterConfig,
  filters: FilterState
) => {
  let declared: Record<string, unknown>;
  try {
    declared = maplibreMap.getGlobalState?.() ?? {};
  } catch {
    return; // style not loaded yet, its styledata applies the filters again
  }
  Object.entries(buildFilterGlobalState(config, filters)).forEach(
    ([name, value]) => {
      if (name in declared) {
        maplibreMap.setGlobalStateProperty(name, value);
      }
    }
  );
};

// What a clustered source was loaded from and filtered by before the buttons
// touched it. Keyed by the source object, so a source recreated by a style
// reload starts over from its new spec.
const originalSourceSpecs = new WeakMap<
  object,
  { data: unknown; filter: unknown[] | null }
>();

const isClusteredGeoJsonSource = (source: any) =>
  source?.type === "geojson" && Boolean(source.workerOptions?.cluster);

/**
 * Filters the clustered GeoJSON sources behind the given layers instead of the
 * layers. A layer filter cannot work there: the clusters are built from all
 * features before any layer filter runs, and a cluster carries none of the
 * filtered properties, so it would either keep counting hidden features or
 * vanish entirely. Filtering the source rebuilds the clusters from what is
 * shown. Returns the ids of the layers whose source took the filter, so the
 * caller leaves their layer filter alone.
 */
export const applyFilterToClusteredSources = (
  maplibreMap: any,
  layerIds: string[],
  filterExpression: any[] | null
): Set<string> => {
  const handledLayerIds = new Set<string>();
  const sources = new Set<any>();

  layerIds.forEach((layerId) => {
    const sourceId = maplibreMap.getLayer(layerId)?.source;
    const source = sourceId ? maplibreMap.getSource(sourceId) : undefined;
    if (!isClusteredGeoJsonSource(source)) {
      return;
    }
    handledLayerIds.add(layerId);
    sources.add(source);
  });

  sources.forEach((source) => {
    if (!originalSourceSpecs.has(source)) {
      // serialize() keeps the style's own filter, but after a url load its
      // data is the loaded (already filtered) features, never the url again.
      // Captured before the first change, that is still the unfiltered base.
      const spec = source.serialize();
      originalSourceSpecs.set(source, {
        data: spec.data,
        filter: spec.filter ?? null,
      });
    }
    const original = originalSourceSpecs.get(source)!;

    let combinedFilter = filterExpression;
    if (original.filter && filterExpression) {
      combinedFilter = ["all", original.filter, filterExpression];
    } else if (original.filter && !filterExpression) {
      combinedFilter = original.filter;
    }

    if (
      JSON.stringify(source.workerOptions.filter ?? null) ===
      JSON.stringify(combinedFilter ?? null)
    ) {
      return;
    }
    // MapLibre has no setter for a GeoJSON source filter: it lives in the
    // worker options and only applies when the data is loaded again
    source.workerOptions.filter = combinedFilter ?? undefined;
    source.setData(original.data);
  });

  return handledLayerIds;
};

export const createFilterButtons =(config: ButtonsFilterConfig) => {
  const isOrMode = config.filterMode === "or";

  const GenericFilterButtons = ({
    maplibreMap,
    selectedFeature,
    setSelectedFeature,
    onFilterChange,
    skipFeatureMatchCheck = false,
    initialFilters,
  }: Omit<GenericFilterButtonsProps, "config">) => {
    // Initialize filter state
    // In AND mode: "alle" starts as true, all filters false
    // In OR mode: no "alle" button, all filters start as true (show all)
    const initialState: FilterState =
      initialFilters ??
      (isOrMode
        ? config.filters.reduce(
            (acc, filter) => ({ ...acc, [filter.key]: true }),
            {}
          )
        : {
            alle: true,
            ...config.filters.reduce(
              (acc, filter) => ({ ...acc, [filter.key]: false }),
              {}
            ),
          });

    const [selectedFilters, setSelectedFilters] =
      useState<FilterState>(initialState);

    // Local state that syncs with the module-level original filters cache
    const [originalFilters, setOriginalFilters] = useState<
      Record<string, any[] | null>
    >(originalFiltersCache.get(config.layerPattern) ?? {});

    // Function to check if a feature matches the current filter criteria
    const checkFeatureMatchesFilter = (
      feature: any,
      filters: FilterState
    ): boolean => {
      if (!feature?.properties) return false;

      const props = feature.properties;

      if (isOrMode) {
        // OR mode: feature matches if it matches ANY selected filter
        const selectedFilterOptions = config.filters.filter(
          (f) => filters[f.key]
        );

        // If no filters selected, nothing matches
        if (selectedFilterOptions.length === 0) return false;

        // If all filters selected, everything matches
        if (selectedFilterOptions.length === config.filters.length) return true;

        // Check if feature matches any selected filter
        return selectedFilterOptions.some(
          (filterOption) =>
            props[filterOption.propertyName] === filterOption.propertyValue
        );
      } else {
        // AND mode: feature matches if it matches ALL selected filters
        if (filters.alle) return true;

        for (const filterOption of config.filters) {
          if (
            filters[filterOption.key] &&
            props[filterOption.propertyName] !== filterOption.propertyValue
          ) {
            return false;
          }
        }

        return true;
      }
    };

    // Style function for filter buttons
    const getFilterButtonStyle = (isSelected: boolean) => {
      const borderColor = config.styles?.selectedBorderColor;
      const showBorder = isSelected && borderColor !== "none";

      return {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        backgroundColor: "white",
        padding: "6px 12px",
        borderRadius: config.styles?.buttonBorderRadius || "10px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
        cursor: "pointer",
        height: "28px",
        border: showBorder
          ? `2px solid ${borderColor || "#4378ccCC"}`
          : "2px solid transparent",
      };
    };

    // Capture original filters once when map becomes available.
    // Uses the module-level cache so they survive closure recreation.
    useEffect(() => {
      if (!maplibreMap) return;
      if (originalFiltersCache.has(config.layerPattern)) return; // Already captured

      const layers = maplibreMap.getStyle()?.layers || [];
      const targetLayers = layers.filter((layer: any) =>
        layer.id.toLowerCase().includes(config.layerPattern.toLowerCase())
      );

      const captured: Record<string, any[] | null> = {};
      targetLayers.forEach((layer: any) => {
        captured[layer.id] = readOriginalFilter(layer);
      });

      originalFiltersCache.set(config.layerPattern, captured);
      setOriginalFilters(captured);
    }, [maplibreMap]);

    // Apply filters to the map whenever selectedFilters or maplibreMap changes
    useEffect(() => {
      if (!maplibreMap) return;
      if (Object.keys(originalFilters).length === 0) return; // Wait for original filters to be captured

      try {
        const targetLayerIds = Object.keys(originalFilters);
        const filterExpression = buildFilterExpression(config, selectedFilters);
        const sourceFilteredLayerIds = applyFilterToClusteredSources(
          maplibreMap,
          targetLayerIds,
          filterExpression
        );
        applyFilterGlobalState(maplibreMap, config, selectedFilters);

        targetLayerIds.forEach((layerId: string) => {
          if (sourceFilteredLayerIds.has(layerId)) {
            return;
          }
          try {
            // Get the ORIGINAL filter (not the current one which may have our filter applied)
            const origFilter = originalFilters[layerId];

            let combinedFilter = filterExpression;

            // If layer has an original filter, combine it with our filter using "all"
            if (origFilter && filterExpression) {
              combinedFilter = ["all", origFilter, filterExpression];
            } else if (origFilter && !filterExpression) {
              combinedFilter = origFilter;
            }

            maplibreMap.setFilter(layerId, combinedFilter);
          } catch (error) {
            console.error(`Error setting filter on layer ${layerId}:`, error);
          }
        });

        // Check if selected feature still matches the new filter criteria
        if (!skipFeatureMatchCheck && selectedFeature?.sourceFeature) {
          const matchesFilter = checkFeatureMatchesFilter(
            selectedFeature.sourceFeature,
            selectedFilters
          );

          if (!matchesFilter) {
            maplibreMap.setFeatureState(
              {
                source: selectedFeature.sourceFeature.source,
                sourceLayer: selectedFeature.sourceFeature.sourceLayer,
                id: selectedFeature.sourceFeature.id,
              },
              { selected: false }
            );

            setSelectedFeature(undefined);
          }
        }
      } catch (error) {
        console.error("Error applying filters:", error);
      }
    }, [selectedFilters, maplibreMap, selectedFeature]);

    const computeFilterInfo = (filters: FilterState): FilterInfo => {
      if (isOrMode) {
        const activeCount = config.filters.filter((f) => filters[f.key]).length;
        return {
          activeCount: config.filters.length - activeCount, // In OR mode, count deselected as "filtered out"
          totalCount: config.filters.length,
          isShowingAll: activeCount === config.filters.length,
        };
      } else {
        const activeCount = config.filters.filter((f) => filters[f.key]).length;
        return {
          activeCount,
          totalCount: config.filters.length,
          isShowingAll: filters.alle === true,
        };
      }
    };

    useEffect(() => {
      if (onFilterChange) {
        onFilterChange(computeFilterInfo(selectedFilters), selectedFilters);
      }
    }, [selectedFilters]);

    const handleFilterClick = (filterName: string) => {
      if (isOrMode) {
        // OR mode: simple toggle, no "alle" button
        setSelectedFilters((prev) => ({
          ...prev,
          [filterName]: !prev[filterName],
        }));
      } else {
        // AND mode: original behavior with "alle" button
        if (filterName === "alle") {
          setSelectedFilters({
            alle: true,
            ...config.filters.reduce(
              (acc, filter) => ({ ...acc, [filter.key]: false }),
              {}
            ),
          });
        } else {
          setSelectedFilters((prev) => {
            const newFilters = {
              ...prev,
              alle: false,
              [filterName]: !prev[filterName],
            };

            const hasIconSelection = config.filters.some(
              (f) => newFilters[f.key]
            );
            if (!hasIconSelection) {
              newFilters.alle = true;
            }

            return newFilters;
          });
        }
      }
    };

    const iconSize = config.styles?.iconSize || "18px";

    return (
      <div
        className="generic-filter-buttons"
        style={{
          pointerEvents: "auto",
          fontSize: config.styles?.fontSize || "13px",
          marginTop: "1px",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: config.styles?.gap || "8px",
          maxWidth: config.styles?.maxWidth || "calc(100vw - 120px)",
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {!isOrMode && (
          <div
            onClick={() => handleFilterClick("alle")}
            style={getFilterButtonStyle(selectedFilters.alle)}
          >
            <span>{config.allLabel}</span>
          </div>
        )}
        {config.filters.map((filterOption) => {
          const isActive = selectedFilters[filterOption.key];
          const iconSrc = isActive
            ? filterOption.icon
            : filterOption.inactiveIcon || filterOption.icon;
          const shouldGrayscale =
            !isActive &&
            !filterOption.inactiveIcon &&
            filterOption.grayscaleWhenInactive !== false;

          return (
            <div
              key={filterOption.key}
              onClick={() => handleFilterClick(filterOption.key)}
              style={getFilterButtonStyle(isActive)}
            >
              {iconSrc && (
                <img
                  src={iconSrc}
                  alt=""
                  style={{
                    width: iconSize,
                    height: iconSize,
                    filter: shouldGrayscale ? "grayscale(100%)" : "none",
                  }}
                />
              )}
              <span className="filter-button-text">{filterOption.label}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return GenericFilterButtons;
};
