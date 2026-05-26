import type { FilterConfig } from "@carma-mapping/layers";
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
  config: FilterConfig;
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
  config: FilterConfig,
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

export const createFilterButtons = (config: FilterConfig) => {
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

        targetLayerIds.forEach((layerId: string) => {
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
