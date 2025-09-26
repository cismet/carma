import { useContext, useEffect, useState } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import Menu from "./Menu";
import { getPoiClusterIconCreatorFunction } from "./helper/styler";
import {
  createVectorFeature,
  FeatureInfobox,
  SandboxedEvalProvider,
  TopicMapSelectionContent,
  useSelectionTopicMap,
} from "@carma-appframeworks/portals";
import {
  defaultTypeInference,
  EmptySearchComponent,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";
import { TAILWIND_CLASSNAMES_FULLSCREEN_FIXED } from "@carma-commons/utils";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { GenericInfoBoxFromFeature } from "@carma-appframeworks/portals";
import CismapLayer from "react-cismap/CismapLayer";
import { getWGS84GeoJSON } from "../../../../lagis/desktop/src/core/tools/mappingTools";
import versionData from "../version.json";
import { md5FetchJSON } from "react-cismap/tools/fetching";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

const TZBaumbewirtschaftung = () => {
  const { markerSymbolSize } = useContext(TopicMapStylingContext);
  const { clusteringOptions } = useContext(FeatureCollectionContext);
  const [selectedFeature, setSelectedFeature] = useState();
  const [featureCollection, setFeatureCollection] = useState();
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );
  // useSelectionTopicMap();
  const { appKey } = useContext(TopicMapContext);
  const dataUrl =
    import.meta.env.VITE_WUPP_ASSET_BASEURL +
    "/data/4326/tz_baumbewirtschaftung.json";
  useEffect(() => {
    (async () => {
      const fc = await md5FetchJSON(appKey, dataUrl);
      console.log("xxx featurecollection", fc);
      setFeatureCollection(fc);
    })();
  }, []);

  const infoBoxMapping = [
    "headerColor:'#7AB317'",
    "header:'Baumbewirtschaftung'",
    "title:p.baumart_botanisch + ' (' + p.standort_nr + '.' + p.zusatz + '.' + p.lfd_nr_str + ')'",
    "additionalInfo:' (*' + p.pflanzjahr + ' / ' + p.standalter_jahr + ')' + '\\n\\n' + p.hoehe_m + 'm / ' + p.stammumfang_cm + 'cm'",
    "subtitle: p.ortlicher_bezug",
  ];

  const vectorLayer = true;
  return (
    <div className={TAILWIND_CLASSNAMES_FULLSCREEN_FIXED}>
      <SandboxedEvalProvider>
        <ControlLayout ifStorybook={false}>
          <Control position="topleft" order={10}>
            <ZoomControl />
          </Control>

          <Control position="topleft" order={50}>
            <FullscreenControl />
          </Control>
          <Control position="topleft" order={60} title="Mein Standort">
            <RoutedMapLocateControl
              tourRefLabels={null}
              disabled={false}
              nativeTooltip={true}
            />
          </Control>
          <Control position="bottomleft" order={10}>
            <div style={{ marginTop: "4px" }}>
              <LibFuzzySearch
                pixelwidth={
                  responsiveState === "normal"
                    ? "300px"
                    : windowSize.width - gap
                }
                placeholder="Stadtteil | Adresse | POI"
                priorityTypes={[
                  "pois",
                  "poisAlternativeNames",
                  "bezirke",
                  "quartiere",
                  "adressen",
                  "streets",
                  "schulen",
                  "kitas",
                ]}
                typeInference={defaultTypeInference}
              />
            </div>
          </Control>
          <TopicMapComponent
            modalMenu={<Menu />}
            gazetteerSearchControl={true}
            gazetteerSearchComponent={EmptySearchComponent}
            applicationMenuTooltipString="Einstellungen | Kompaktanleitung"
            locatorControl={false}
            fullScreenControl={false}
            zoomControls={false}
            infoBox={
              <FeatureInfobox
                selectedFeature={selectedFeature}
                versionInfo={versionData}
              />
            }
            contactButtonEnabled={false}
          >
            <TopicMapSelectionContent />

            {/* <FeatureCollection></FeatureCollection> */}

            {featureCollection && (
              <CismapLayer
                pane="additionalLayers0"
                selectionEnabled={true}
                manualSelectionManagement={false}
                logMapLibreErrors={true}
                // maxSelectionCount={1}
                // additionalLayerUniquePane={"vector." + 1}
                // additionalLayersFreeZOrder={1}
                onSelectionChanged={(e) => {
                  (async () => {
                    // console.log("xxx e", e);
                    const hit = e.hit;
                    const feature = await createVectorFeature(
                      infoBoxMapping,
                      hit
                    );
                    console.log("xxx feature", feature);
                    setSelectedFeature(feature);
                  })();
                }}
                style={{
                  version: 8,
                  sources: {
                    trees: {
                      type: "geojson",
                      data: featureCollection,
                    },
                  },
                  glyphs:
                    "https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf",
                  sprite: "https://tiles.cismet.de/poi/sprites",
                  layers: [
                    {
                      id: "green-dots",
                      type: "circle",
                      source: "trees",
                      minzoom: 0,
                      maxzoom: 24,
                      layout: {
                        visibility: "visible",
                      },
                      paint: {
                        "circle-radius": {
                          base: 1.75,
                          stops: [
                            [0, 3],
                            [16, 10],
                            [22, 26],
                          ],
                        },
                        "circle-color": "#7AB317",
                        "circle-stroke-color": "#0D6759",
                        "circle-stroke-width": {
                          base: 1.75,
                          stops: [
                            [0, 0.1],
                            [16, 4],
                            [22, 10],
                          ],
                        },
                        "circle-opacity": [
                          "case",
                          ["boolean", ["feature-state", "selected"], false],
                          0,
                          0.8,
                        ],
                        "circle-stroke-opacity": [
                          "case",
                          ["boolean", ["feature-state", "selected"], false],
                          0,
                          0.8,
                        ],
                      },
                    },
                    {
                      id: "red-dots",
                      type: "circle",
                      source: "trees",
                      minzoom: 0,
                      maxzoom: 24,
                      layout: {
                        visibility: "visible",
                      },
                      paint: {
                        "circle-radius": {
                          base: 1.75,
                          stops: [
                            [0, 3],
                            [16, 10],
                            [22, 26],
                          ],
                        },
                        // "circle-color": "#008800",
                        "circle-color": "#3A7CEB",
                        "circle-stroke-color": "#0D6759",
                        "circle-stroke-width": {
                          base: 1.75,
                          stops: [
                            [0, 0.1],
                            [16, 4],
                            [22, 10],
                          ],
                        },

                        "circle-opacity": [
                          "case",
                          ["boolean", ["feature-state", "selected"], false],
                          0.8,
                          0,
                        ],
                        "circle-stroke-opacity": [
                          "case",
                          ["boolean", ["feature-state", "selected"], false],
                          0.8,
                          0,
                        ],
                      },
                    },
                  ],
                }}
                type="vector"
              />
            )}
          </TopicMapComponent>
        </ControlLayout>
      </SandboxedEvalProvider>
    </div>
  );
};

export default TZBaumbewirtschaftung;
