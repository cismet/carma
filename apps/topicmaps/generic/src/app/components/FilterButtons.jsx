import { useState, useEffect } from "react";

export const FilterButtons = ({
  maplibreMap,
  selectedFeature,
  setSelectedFeature,
}) => {
  // Filter button selection state
  const [selectedFilters, setSelectedFilters] = useState({
    alle: true,
    kostenfrei: false,
    rollstuhlgerecht: false,
    wickeltisch: false,
    dauergeoffnet: false,
  });

  // Function to build filter expression from selected filters
  const buildFilterExpression = (filters) => {
    if (filters.alle) {
      // Show all features
      return null;
    }

    // Build an 'all' filter for selected criteria
    const conditions = [];

    if (filters.kostenfrei) {
      // ENTGELT === "nein" means free (kostenfrei)
      conditions.push(["==", ["get", "ENTGELT"], "nein"]);
    }

    if (filters.rollstuhlgerecht) {
      // ROLLGER === "ja" means wheelchair accessible
      conditions.push(["==", ["get", "ROLLGER"], "ja"]);
    }

    if (filters.wickeltisch) {
      // WICKELTIS === "ja" means changing table available
      conditions.push(["==", ["get", "WICKELTIS"], "ja"]);
    }

    if (filters.dauergeoffnet) {
      // Q_24/7_OFF === "ja" means open 24/7
      conditions.push(["==", ["get", "Q_24/7_OFF"], "ja"]);
    }

    // Combine conditions with 'all' operator (AND logic)
    if (conditions.length > 0) {
      return ["all", ...conditions];
    }

    return null;
  };

  // Function to check if a feature matches the current filter criteria
  const checkFeatureMatchesFilter = (feature, filters) => {
    if (!feature?.properties) return false;

    const props = feature.properties;

    // If showing all, feature is always visible
    if (filters.alle) return true;

    // Check each active filter - ALL must match (AND logic)
    if (filters.kostenfrei && props.ENTGELT !== "nein") {
      return false;
    }

    if (filters.rollstuhlgerecht && props.ROLLGER !== "ja") {
      return false;
    }

    if (filters.wickeltisch && props.WICKELTIS !== "ja") {
      return false;
    }

    if (filters.dauergeoffnet && props["Q_24/7_OFF"] !== "ja") {
      return false;
    }

    return true;
  };

  // Style function for filter buttons
  const getFilterButtonStyle = (isSelected) => ({
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "white",
    padding: "6px 12px",
    borderRadius: "10px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
    cursor: "pointer",
    height: "32px",
    border: isSelected ? "2px solid #4378ccCC" : "2px solid transparent",
  });

  // Apply filters to the map whenever selectedFilters or maplibreMap changes
  useEffect(() => {
    if (!maplibreMap) return;

    try {
      // Get all layers from the map style
      const layers = maplibreMap.getStyle()?.layers || [];

      // Find toiletten layers (looking for both "toiletten" and "poi" patterns)
      const targetLayerIds = layers
        .filter((layer) => layer.id.toLowerCase().includes("toiletten"))
        .map((layer) => layer.id);

      // Build the filter expression from selected filters
      const filterExpression = buildFilterExpression(selectedFilters);

      // Apply the filter to all target layers
      targetLayerIds.forEach((layerId) => {
        try {
          maplibreMap.setFilter(layerId, filterExpression);
        } catch (error) {
          console.error(`Error setting filter on layer ${layerId}:`, error);
        }
      });

      // Check if selected feature still matches the new filter criteria
      // If not, clear the selection and hide the infobox
      if (selectedFeature?.sourceFeature) {
        const matchesFilter = checkFeatureMatchesFilter(
          selectedFeature.sourceFeature,
          selectedFilters
        );

        if (!matchesFilter) {
          // Feature no longer matches filter - deselect it
          maplibreMap.setFeatureState(
            {
              source: selectedFeature.sourceFeature.source,
              sourceLayer: selectedFeature.sourceFeature.sourceLayer,
              id: selectedFeature.sourceFeature.id,
            },
            { selected: false }
          );

          // Clear the selected feature to hide the infobox
          setSelectedFeature(undefined);
        }
      }
    } catch (error) {
      console.error("Error applying filters:", error);
    }
  }, [selectedFilters, maplibreMap, selectedFeature]);

  const handleFilterClick = (filterName) => {
    if (filterName === "alle") {
      // When "Alle" is clicked, deselect all icon buttons
      setSelectedFilters({
        alle: true,
        kostenfrei: false,
        rollstuhlgerecht: false,
        wickeltisch: false,
        dauergeoffnet: false,
      });
    } else {
      // When any icon button is clicked, toggle it and deselect "Alle"
      setSelectedFilters((prev) => {
        const newFilters = {
          ...prev,
          alle: false,
          [filterName]: !prev[filterName],
        };

        // If no icon buttons are selected, select "Alle" again
        const hasIconSelection =
          newFilters.kostenfrei ||
          newFilters.rollstuhlgerecht ||
          newFilters.wickeltisch ||
          newFilters.dauergeoffnet;
        if (!hasIconSelection) {
          newFilters.alle = true;
        }

        return newFilters;
      });
    }
  };

  return (
    <div
      style={{
        fontSize: "13px",
        marginTop: "1px",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "8px",
        maxWidth: "calc(100vw - 120px)",
        marginLeft: "auto",
        marginRight: "auto",
      }}
    >
      <div
        onClick={() => handleFilterClick("alle")}
        style={getFilterButtonStyle(selectedFilters.alle)}
      >
        <span>Alle</span>
      </div>
      <div
        onClick={() => handleFilterClick("kostenfrei")}
        style={getFilterButtonStyle(selectedFilters.kostenfrei)}
      >
        <img
          src="https://tiles.cismet.de/toiletten/assets/icons/Infobox_Kostenfrei.svg"
          alt=""
          style={{
            width: "18px",
            height: "18px",
            filter: selectedFilters.kostenfrei ? "none" : "grayscale(100%)",
          }}
        />
        <span className="filter-button-text">Kostenfrei</span>
      </div>
      <div
        onClick={() => handleFilterClick("rollstuhlgerecht")}
        style={getFilterButtonStyle(selectedFilters.rollstuhlgerecht)}
      >
        <img
          src="https://tiles.cismet.de/toiletten/assets/icons/Infobox_Rollstuhlgerecht.svg"
          alt=""
          style={{
            width: "18px",
            height: "18px",
            filter: selectedFilters.rollstuhlgerecht
              ? "none"
              : "grayscale(100%)",
          }}
        />
        <span className="filter-button-text">Rollstuhlgerecht</span>
      </div>
      <div
        onClick={() => handleFilterClick("wickeltisch")}
        style={getFilterButtonStyle(selectedFilters.wickeltisch)}
      >
        <img
          src="https://tiles.cismet.de/toiletten/assets/icons/Infobox_Wickeltisch.svg"
          alt=""
          style={{
            width: "18px",
            height: "18px",
            filter: selectedFilters.wickeltisch ? "none" : "grayscale(100%)",
          }}
        />
        <span className="filter-button-text">Wickeltisch</span>
      </div>
      <div
        onClick={() => handleFilterClick("dauergeoffnet")}
        style={getFilterButtonStyle(selectedFilters.dauergeoffnet)}
      >
        <img
          src="https://tiles.cismet.de/toiletten/assets/icons/Infobox_24_7_Geoeffnet.svg"
          alt=""
          style={{
            width: "18px",
            height: "18px",
            filter: selectedFilters.dauergeoffnet ? "none" : "grayscale(100%)",
          }}
        />
        <span className="filter-button-text">Geöffnet</span>
      </div>
    </div>
  );
};
