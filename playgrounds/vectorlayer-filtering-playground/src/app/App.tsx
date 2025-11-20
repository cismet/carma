import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import { useMapLibreMap } from "@carma-commons/measurements";
import { LayerButton, ZoomControl } from "@carma-mapping/components";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { useContext, useState, useEffect } from "react";
import {
  TopicMapSelectionContent,
  useSelectionTopicMap,
} from "@carma-appframeworks/portals";
import CismapLayer from "react-cismap/CismapLayer";
import { getActionLinksForFeature } from "react-cismap/tools/uiHelper";
import { TopicMapDispatchContext } from "react-cismap/contexts/TopicMapContextProvider";
import { Layer } from "leaflet";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

suppressReactCismapErrors(true);

export function App({
  vectorStyles = [],
  onClearAllLayers,
}: {
  vectorStyles?: any[];
  onClearAllLayers?: () => void;
}) {
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  ) as any;
  useSelectionTopicMap();
  const [selectedFeature, setSelectedFeature] = useState<any>(undefined);
  const { maplibreMap, setMaplibreMap } = useMapLibreMap();
  const { zoomToFeature } = useContext(TopicMapDispatchContext) as any;
  const [filterText, setFilterText] = useState<string>("");
  const [defaultVectorStyle, setDefaultVectorStyle] = useState<string | null>(
    null
  );

  const pixelwidth =
    responsiveState === "normal" ? "300px" : (windowSize?.width || 300) - gap;

  // Combine default vector style with user-provided styles
  const allVectorStyles = [
    ...(defaultVectorStyle ? [defaultVectorStyle] : []),
    ...vectorStyles,
  ];

  // Apply filter whenever filterText or maplibreMap changes
  useEffect(() => {
    if (!maplibreMap) return;

    try {
      // Check if the layers exist
      const layers = maplibreMap.getStyle()?.layers || [];
      const poiLayers = ["poi-images", "poi-labels", "poi-images-selection"];

      poiLayers.forEach((layerId) => {
        const hasLayer = layers.some((l: any) => l.id === layerId);

        if (hasLayer && filterText.trim()) {
          // Apply filter with the current filterText
          maplibreMap.setFilter(layerId, [
            "in",
            filterText.toLowerCase(),
            ["downcase", ["get", "geographicidentifier"]],
          ]);
        } else if (hasLayer && !filterText.trim()) {
          // Reset to default filter (no filter, show all)
          maplibreMap.setFilter(layerId, null);
        }
      });

      console.log("Filter applied to all layers:", filterText || "(all)");
    } catch (error) {
      console.error("Error applying filter:", error);
    }
  }, [filterText, maplibreMap]);

  let links: any[] = [];
  if (selectedFeature) {
    links = getActionLinksForFeature(selectedFeature, {
      displayZoomToFeature: true,
      zoomToFeature: () => {
        if (selectedFeature) {
          const f = JSON.stringify(selectedFeature, null, 2);
          const pf = JSON.parse(f);
          pf.crs = {
            type: "name",
            properties: {
              name: "urn:ogc:def:crs:EPSG::4326",
            },
          };
          console.log("xxx zoomToFeature", pf);

          zoomToFeature(pf);
        }
      },
    });
  }

  return (
    <div>
      <ControlLayout ifStorybook={false}>
        <Control position="topleft" order={10}>
          <ZoomControl />
        </Control>
        <Control position="bottomleft" order={10}>
          <div style={{ marginTop: "4px" }}>
            <LibFuzzySearch
              pixelwidth={
                responsiveState === "normal"
                  ? "300px"
                  : (windowSize?.width || 300) - gap
              }
            />
          </div>
        </Control>
        <Control position="topcenter" order={10}>
          <div
            style={{
              backgroundColor: "white",
              padding: "8px 12px",
              borderRadius: "4px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              fontSize: "14px",
            }}
          >
            {/* Title section with Clear button */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span>Vector Layer Filtering Playground</span>

              <div
                style={{
                  width: "1px",
                  height: "20px",
                  backgroundColor: "#ddd",
                }}
              />

              <div
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <label
                  htmlFor="filter-input"
                  style={{ fontSize: "13px", color: "#666" }}
                >
                  Filter:
                </label>
                <input
                  id="filter-input"
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Enter filter text..."
                  style={{
                    padding: "4px 8px",
                    fontSize: "13px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    outline: "none",
                    width: "150px",
                  }}
                />
              </div>

              {vectorStyles.length > 0 && (
                <>
                  <div
                    style={{
                      width: "1px",
                      height: "20px",
                      backgroundColor: "#ddd",
                    }}
                  />
                  <button
                    onClick={onClearAllLayers}
                    title="Remove all vector layers"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "4px 8px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "14px",
                      color: "#dc2626",
                      transition: "color 0.2s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "#991b1b")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "#dc2626")
                    }
                  >
                    <span style={{ fontSize: "16px" }}>🗑️</span>
                    <span>Clear Layers ({vectorStyles.length})</span>
                  </button>
                </>
              )}
            </div>

            {/* Vector layer links */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                fontSize: "13px",
              }}
            >
              Drop these:{" "}
              <a
                href="https://tiles.cismet.de/poi/style.json"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "#2563eb",
                  textDecoration: "none",
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#1d4ed8")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#2563eb")}
              >
                POIs
              </a>
              <div
                style={{
                  width: "1px",
                  height: "12px",
                  backgroundColor: "#ddd",
                }}
              />
              <a
                href="https://tiles.cismet.de/alkis/flurstuecke.black.style.json"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "#2563eb",
                  textDecoration: "none",
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#1d4ed8")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#2563eb")}
              >
                ALKIS
              </a>
              <div
                style={{
                  width: "1px",
                  height: "12px",
                  backgroundColor: "#ddd",
                }}
              />
              <a
                href="https://tiles.cismet.de/toiletten/style.json"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "#2563eb",
                  textDecoration: "none",
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#1d4ed8")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#2563eb")}
              >
                Toiletten
              </a>
            </div>
          </div>
        </Control>
      </ControlLayout>
      <TopicMapComponent
        title="Vector Layer Filtering Playground"
        key={JSON.stringify(allVectorStyles)}
        gazetteerSearchControl={true}
        gazetteerSearchComponent={EmptySearchComponent}
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        leafletMapProps={{ editable: true }}
      >
        <TopicMapSelectionContent />

        {allVectorStyles.map((style, index) => {
          return (
            <CismapLayer
              key={index}
              {...{
                type: "vector",
                style: style,
                pane: "additionalLayers" + index,
                opacity: 1,
                maxSelectionCount: 1,
                selectionEnabled: false,
                logMapLibreErrors: true,
                onMapLibreCoreMapReady: (map: any) => {
                  (window as any).mlmap = map;

                  // Debug: Log available layers
                  console.log(
                    "Available layers:",
                    map.getStyle().layers.map((l: any) => l.id)
                  );

                  setMaplibreMap(map);
                },
              }}
            />
          );
        })}
      </TopicMapComponent>
    </div>
  );
}
