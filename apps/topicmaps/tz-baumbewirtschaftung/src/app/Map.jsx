import { useContext, useEffect, useState } from "react";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import Menu from "./Menu";
import Modal from "./Modal";
import {
  createVectorFeature,
  FeatureInfobox,
  SandboxedEvalProvider,
  TopicMapSelectionContent,
  useSelectionTopicMap,
  getInfoBoxControlObjectFromMappingAndVectorFeature,
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
import CismapLayer from "react-cismap/CismapLayer";
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
  useSelectionTopicMap();
  const { appKey } = useContext(TopicMapContext);
  const dataUrl =
    import.meta.env.VITE_WUPP_ASSET_BASEURL +
    "/data/4326/tz_baumbewirtschaftung.json";
  useEffect(() => {
    (async () => {
      const fc = await md5FetchJSON(appKey, dataUrl);

      const enriched = enrichFeatureCollection(fc); // Helper function
      setFeatureCollection(enriched);
    })();
  }, []);

  const infoBoxMapping = [
    "headerColor:'#7AB317'",
    "header:'Baumbewirtschaftung'",
    "title:p.baumart_botanisch + ' (' + p.standort_nr + '.' + p.zusatz + '.' + p.lfd_nr_str + ')'",
    "additionalInfo:' (*' + p.pflanzjahr + ' / ' + p.standalter_jahr + ')' + '\\n\\n' + p.hoehe_m + 'm / ' + p.stammumfang_cm + 'cm'",
    "subtitle: p.ortlicher_bezug",
    "modal:'xxx'",
    // "url:'https://cismet.de'",
    // "email:'info@cismet.de'",
    // "tel:'01709120394'",
    "genericLinks: [{url: 'https://maps.google.com', tooltip:'Zur Fahrplanauskunft', iconname: 'tasks'}]",
    "foto: ['Tilia_x_vulgaris11.jpeg']",
    //   "foto: 'https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_01.jpg'",
    //   "fotos: ['https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_01.jpg','https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_02.jpg',   'https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_03.jpg',      'https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_04.jpg',      'https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_05.jpg',      'https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_06.jpg' ]",
  ];

  function computeLatestStatus(actions) {
    if (!actions || actions.length === 0) return "none";
    return actions[0]?.status || "none";
  }

  function hasStatus(actions, status) {
    if (!actions || actions.length === 0) return false;
    return actions.some((a) => a.status === status);
  }
  function createInfoBoxControlObject(feature) {
    const p = feature.properties;
    const ibo = {
      headerColor: "#7AB317",
      header: "Baumbewirtschaftung",
      title:
        p.baumart_botanisch +
        " (" +
        p.standort_nr +
        "." +
        p.zusatz +
        "." +
        p.lfd_nr_str +
        ")",
      additionalInfo:
        " (*" +
        p.pflanzjahr +
        " / " +
        p.standalter_jahr +
        ")" +
        "\n\n" +
        p.hoehe_m +
        "m / " +
        p.stammumfang_cm +
        "cm",
      subtitle: p.ortlicher_bezug,
      modal: true,
      // url: "https://cismet.de",
      // email: "info@cismet.de",
      // tel: "01709120394",
      genericLinks: [
        {
          action: () => {
            console.log("xxx");
          },
          tooltip: "Status ändern",
          iconname: "tasks",
        },
      ],
      foto: "demo/mod" + (feature.id % 10) + ".png",
      //fotos: [of urls]
      //if there are more than one foto need to be there anyway
    };
    return ibo;
  }

  function enrichFeatureCollection(fc) {
    return {
      ...fc,
      features: fc.features.map((f) => {
        const p = f.properties;
        return {
          ...f,
          properties: {
            ...f.properties,
            // Add computed properties
            latestActionStatus: computeLatestStatus(f.properties.actions),
            hasOpenActions: hasStatus(f.properties.actions, "open"),
            actionCount: f.properties.actions?.length || 0,
          },
        };
      }),
    };
  }
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
                versionData={versionData}
                bigMobileIconsInsteadOfCollapsing={true}
                Modal={Modal}
              />
            }
            contactButtonEnabled={false}
          >
            <TopicMapSelectionContent />

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
                    const hit = e.hit;
                    if (hit) {
                      console.log("xxx hit", hit);

                      const infoBoxControlObject =
                        await getInfoBoxControlObjectFromMappingAndVectorFeature(
                          {
                            mapping: infoBoxMapping,
                            selectedVectorFeature: hit,
                          }
                        );
                      console.log(
                        "xxx infoBoxControlObject",
                        infoBoxControlObject
                      );
                      const feature = hit;
                      console.log("xxx feature", feature);
                      // add infoBoxControlObject
                      feature.properties.info =
                        createInfoBoxControlObject(feature);

                      // //or the snadbox way
                      // feature.properties.info = infoBoxControlObject;

                      setSelectedFeature(feature);
                    } else {
                      setSelectedFeature(undefined);
                    }
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
                      id: "tree-dots",
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
                        "circle-color": [
                          "case",
                          ["==", ["get", "latestActionStatus"], "done"],
                          "#4CAF50", // vibrant green for done
                          ["==", ["get", "latestActionStatus"], "open"],
                          "#FFEB3B", // yellow for open
                          ["==", ["get", "latestActionStatus"], "exception"],
                          "#F44336", // red for exception
                          "#A5D6A7", // grayish green for none
                        ],
                        "circle-stroke-color": [
                          "case",
                          ["==", ["get", "latestActionStatus"], "done"],
                          "#2E7D32", // darker green for done
                          ["==", ["get", "latestActionStatus"], "open"],
                          "#F57C00", // orange for open
                          ["==", ["get", "latestActionStatus"], "exception"],
                          "#B71C1C", // dark red for exception
                          "#757575", // grey for none
                        ],
                        "circle-stroke-width": {
                          base: 1.75,
                          stops: [
                            [0, 0.1],
                            [16, 4],
                            [22, 10],
                          ],
                        },
                        "circle-opacity": 0.8,
                        "circle-stroke-opacity": 1,
                      },
                    },
                    {
                      id: "tree-dots-selected",
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
