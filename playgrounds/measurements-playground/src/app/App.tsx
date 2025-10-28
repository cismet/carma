import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import {
  MeasurementControl,
  Measurements,
  useMapMeasurementsContext,
  useMapLibreMap,
} from "@carma-commons/measurements";
import { ZoomControl } from "@carma-mapping/components";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { useContext, useState } from "react";
import {
  TopicMapSelectionContent,
  useSelectionTopicMap,
} from "@carma-appframeworks/portals";
import CismapLayer from "react-cismap/CismapLayer";
import { getActionLinksForFeature } from "react-cismap/tools/uiHelper";
import { TopicMapDispatchContext } from "react-cismap/contexts/TopicMapContextProvider";
import { SnappingContext } from "../main";

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
  const [maplibreMaps, setMaplibreMaps] = useState<any[]>([]);
  const { mode: measurementMode, setMode: setMeasurementMode } =
    useMapMeasurementsContext();
  const { zoomToFeature } = useContext(TopicMapDispatchContext) as any;
  const { snappingEnabled, setSnappingEnabled } = useContext(SnappingContext);

  const pixelwidth =
    responsiveState === "normal" ? "300px" : (windowSize?.width || 300) - gap;

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
        <MeasurementControl />
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
            {/* First row: Snapping toggle and Clear button */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <input
                  type="checkbox"
                  id="snapping-toggle"
                  checked={snappingEnabled}
                  onChange={(e) => setSnappingEnabled(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                <label
                  htmlFor="snapping-toggle"
                  style={{ cursor: "pointer", margin: 0, userSelect: "none" }}
                >
                  Enable Snapping
                </label>
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

            {/* Second row: Vector layer links */}
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
            </div>
          </div>
        </Control>
      </ControlLayout>
      <TopicMapComponent
        key={JSON.stringify(vectorStyles)}
        gazetteerSearchControl={true}
        gazetteerSearchComponent={EmptySearchComponent}
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        leafletMapProps={{ editable: true }}
      >
        <Measurements snappingLayers={maplibreMaps} />
        <TopicMapSelectionContent />

        {vectorStyles.map((style, index) => {
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
                  setMaplibreMap(map);
                  setMaplibreMaps((prev) => [...prev, map]);
                },
              }}
            />
          );
        })}
      </TopicMapComponent>
    </div>
  );
}
