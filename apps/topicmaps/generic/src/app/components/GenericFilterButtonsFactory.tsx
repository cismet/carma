import { useState, useEffect, ReactNode } from "react";

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
}

export interface FilterConfig {
  /** The "show all" button label */
  allLabel: string;
  /** Layer name pattern to match (case-insensitive includes) */
  layerPattern: string;
  /** Available filter options */
  filters: FilterOption[];
  /** Style customizations */
  styles?: {
    buttonBorderRadius?: string;
    selectedBorderColor?: string;
    iconSize?: string;
    fontSize?: string;
    gap?: string;
    maxWidth?: string;
  };
}

export interface GenericFilterButtonsProps {
  maplibreMap: any;
  selectedFeature: any;
  setSelectedFeature: (feature: any) => void;
  config: FilterConfig;
}

type FilterState = Record<string, boolean>;

export const createFilterButtons = (config: FilterConfig) => {
  const GenericFilterButtons = ({
    maplibreMap,
    selectedFeature,
    setSelectedFeature,
  }: Omit<GenericFilterButtonsProps, "config">) => {
    // Initialize filter state with "alle" as true and all others as false
    const initialState: FilterState = {
      alle: true,
      ...config.filters.reduce(
        (acc, filter) => ({ ...acc, [filter.key]: false }),
        {}
      ),
    };

    const [selectedFilters, setSelectedFilters] =
      useState<FilterState>(initialState);

    // Function to build filter expression from selected filters
    const buildFilterExpression = (filters: FilterState): any[] | null => {
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
    };

    // Function to check if a feature matches the current filter criteria
    const checkFeatureMatchesFilter = (
      feature: any,
      filters: FilterState
    ): boolean => {
      if (!feature?.properties) return false;

      const props = feature.properties;

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
    };

    // Style function for filter buttons
    const getFilterButtonStyle = (isSelected: boolean) => ({
      display: "flex",
      alignItems: "center",
      gap: "6px",
      backgroundColor: "white",
      padding: "6px 12px",
      borderRadius: config.styles?.buttonBorderRadius || "10px",
      boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
      cursor: "pointer",
      height: "32px",
      border: isSelected
        ? `2px solid ${config.styles?.selectedBorderColor || "#4378ccCC"}`
        : "2px solid transparent",
    });

    // Apply filters to the map whenever selectedFilters or maplibreMap changes
    useEffect(() => {
      if (!maplibreMap) return;

      try {
        const layers = maplibreMap.getStyle()?.layers || [];

        const targetLayerIds = layers
          .filter((layer: any) =>
            layer.id.toLowerCase().includes(config.layerPattern.toLowerCase())
          )
          .map((layer: any) => layer.id);

        const filterExpression = buildFilterExpression(selectedFilters);

        targetLayerIds.forEach((layerId: string) => {
          try {
            maplibreMap.setFilter(layerId, filterExpression);
          } catch (error) {
            console.error(`Error setting filter on layer ${layerId}:`, error);
          }
        });

        // Check if selected feature still matches the new filter criteria
        if (selectedFeature?.sourceFeature) {
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

    const handleFilterClick = (filterName: string) => {
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
    };

    const iconSize = config.styles?.iconSize || "18px";

    return (
      <div
        style={{
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
        <div
          onClick={() => handleFilterClick("alle")}
          style={getFilterButtonStyle(selectedFilters.alle)}
        >
          <span>{config.allLabel}</span>
        </div>
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
