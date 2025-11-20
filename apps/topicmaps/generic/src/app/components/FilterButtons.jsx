import { useState, useEffect } from "react";

export const FilterButtons = ({ maplibreMap }) => {
  console.log("xxx maplibreMap", maplibreMap);

  // Filter button selection state
  const [selectedFilters, setSelectedFilters] = useState({
    alle: true,
    kostenfrei: false,
    rollstuhlgerecht: false,
    wickeltisch: false,
    dauergeoffnet: false,
  });

  // Apply filters to the map whenever selectedFilters or maplibreMap changes
  useEffect(() => {
    if (!maplibreMap) return;

    try {
      // Get all layers from the map style
      const layers = maplibreMap.getStyle()?.layers || [];

      // Find toiletten layers (looking for both "toiletten" and "poi" patterns)
      const targetLayerIds = layers
        .filter(
          (layer) =>
            layer.id.toLowerCase().includes("toiletten") ||
            layer.id.toLowerCase().includes("poi")
        )
        .map((layer) => layer.id);

      console.log("xxx Target layers found:", targetLayerIds);
      console.log(
        "xxx All layers:",
        layers.map((l) => l.id)
      );

      // Build the filter expression
      let filterExpression;

      if (selectedFilters.alle) {
        // Show all features
        filterExpression = null;
      } else {
        // Build an 'all' filter for selected criteria
        const conditions = [];

        if (selectedFilters.kostenfrei) {
          // ENTGELT === "nein" means free (kostenfrei)
          conditions.push(["==", ["get", "ENTGELT"], "nein"]);
        }

        if (selectedFilters.rollstuhlgerecht) {
          // ROLLGER === "ja" means wheelchair accessible
          conditions.push(["==", ["get", "ROLLGER"], "ja"]);
        }

        if (selectedFilters.wickeltisch) {
          // WICKELTIS === "ja" means changing table available
          conditions.push(["==", ["get", "WICKELTIS"], "ja"]);
        }

        if (selectedFilters.dauergeoffnet) {
          // Q_24/7_OFF === "ja" means open 24/7
          conditions.push(["==", ["get", "Q_24/7_OFF"], "ja"]);
        }

        // Combine conditions with 'all' operator (AND logic)
        if (conditions.length > 0) {
          filterExpression = ["all", ...conditions];
        } else {
          filterExpression = null;
        }
      }

      console.log("xxx Applying filter:", JSON.stringify(filterExpression));

      // Apply the filter to all target layers
      targetLayerIds.forEach((layerId) => {
        try {
          maplibreMap.setFilter(layerId, filterExpression);
        } catch (error) {
          console.error(`Error setting filter on layer ${layerId}:`, error);
        }
      });
    } catch (error) {
      console.error("Error applying filters:", error);
    }
  }, [selectedFilters, maplibreMap]);

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
        marginTop: "10px",
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
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          backgroundColor: "white",
          padding: "6px 12px",
          borderRadius: "10px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          cursor: "pointer",
          height: "32px",
          border: selectedFilters.alle
            ? "3px solid #4378ccCC"
            : "3px solid transparent",
        }}
      >
        <span
          style={{
            color: selectedFilters.alle ? "#4378ccCC" : "inherit",
            textDecoration: selectedFilters.alle ? "underline" : "none",
          }}
        >
          Alle
        </span>
      </div>
      <div
        onClick={() => handleFilterClick("kostenfrei")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          backgroundColor: "white",
          padding: "6px 12px",
          borderRadius: "10px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          cursor: "pointer",
          height: "32px",
          border: selectedFilters.kostenfrei
            ? "3px solid #4378ccCC"
            : "3px solid transparent",
        }}
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
        <span
          className="filter-button-text"
          style={{
            color: selectedFilters.kostenfrei ? "#4378ccCC" : "inherit",
            textDecoration: selectedFilters.kostenfrei ? "underline" : "none",
          }}
        >
          Kostenfrei
        </span>
      </div>
      <div
        onClick={() => handleFilterClick("rollstuhlgerecht")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          backgroundColor: "white",
          padding: "6px 12px",
          borderRadius: "10px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          cursor: "pointer",
          height: "32px",
          border: selectedFilters.rollstuhlgerecht
            ? "3px solid #4378ccCC"
            : "3px solid transparent",
        }}
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
        <span
          className="filter-button-text"
          style={{
            color: selectedFilters.rollstuhlgerecht ? "#4378ccCC" : "inherit",
            textDecoration: selectedFilters.rollstuhlgerecht
              ? "underline"
              : "none",
          }}
        >
          Rollstuhlgerecht
        </span>
      </div>
      <div
        onClick={() => handleFilterClick("wickeltisch")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          backgroundColor: "white",
          padding: "6px 12px",
          borderRadius: "10px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          cursor: "pointer",
          height: "32px",
          border: selectedFilters.wickeltisch
            ? "3px solid #4378ccCC"
            : "3px solid transparent",
        }}
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
        <span
          className="filter-button-text"
          style={{
            color: selectedFilters.wickeltisch ? "#4378ccCC" : "inherit",
            textDecoration: selectedFilters.wickeltisch ? "underline" : "none",
          }}
        >
          Wickeltisch
        </span>
      </div>
      <div
        onClick={() => handleFilterClick("dauergeoffnet")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          backgroundColor: "white",
          padding: "6px 12px",
          borderRadius: "10px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          cursor: "pointer",
          height: "32px",
          border: selectedFilters.dauergeoffnet
            ? "3px solid #4378ccCC"
            : "3px solid transparent",
        }}
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
        <span
          className="filter-button-text"
          style={{
            color: selectedFilters.dauergeoffnet ? "#4378ccCC" : "inherit",
            textDecoration: selectedFilters.dauergeoffnet
              ? "underline"
              : "none",
          }}
        >
          geöffnet
        </span>
      </div>
    </div>
  );
};
