import { useEffect, useRef } from "react";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import {
  MeasurementControl,
  MapMeasurementsObjects,
  MeasurementsSnapping,
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
  useSelection,
} from "@carma-appframeworks/portals";
import CismapLayer from "react-cismap/CismapLayer";
import InfoBox from "react-cismap/topicmaps/InfoBox";
import { getActionLinksForFeature } from "react-cismap/tools/uiHelper";
import {
  TopicMapDispatchContext,
  TopicMapContext,
} from "react-cismap/contexts/TopicMapContextProvider";
import InfoBoxFotoPreview from "react-cismap/topicmaps/InfoBoxFotoPreview";
import { LightBoxDispatchContext } from "react-cismap/contexts/LightBoxContextProvider";
import { ModeButtons } from "./components/ModeButtons";
import { RadiusSliders } from "./components/RadiusSliders";
import { VectorLayerButton } from "./components/VectorLayerButton";
import {
  useMapMeasurementsContext,
  useMapLibreMap,
} from "@carma-commons/measurements";

suppressReactCismapErrors();

export function App({ vectorStyles = [] }: { vectorStyles?: any[] }) {
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  ) as any;
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const { setSelection } = useSelection();
  useSelectionTopicMap();
  const [selectedFeature, setSelectedFeature] = useState<any>(undefined);
  const { maplibreMap, setMaplibreMap } = useMapLibreMap();
  const [queryRadius, setQueryRadius] = useState(() => {
    const saved = localStorage.getItem("measurements-radius");
    return saved ? Number(saved) : 100;
  });
  const [toleranceRadius, setToleranceRadius] = useState(() => {
    const saved = localStorage.getItem("measurements-tolerance-radius");
    return saved ? Number(saved) : 50;
  });
  const [mode, setMode] = useState<
    | "features"
    | "coordinates"
    | "coordinatesUnderPointer"
    | "spider"
    | "spiderRocket"
    | "serious"
  >(() => {
    const saved = localStorage.getItem("measurements-mode");
    return (saved as any) || "features";
  });
  const { currentDrawHandler } = useMapMeasurementsContext();
  const [seriousClosestPoint, setSeriousClosestPoint] = useState<any>(null);
  const queryRadiusRef = useRef(queryRadius);
  const toleranceRadiusRef = useRef(toleranceRadius);
  const circleMarkerRef = useRef<any>(null);
  const toleranceCircleMarkerRef = useRef<any>(null);
  const { zoomToFeature } = useContext(TopicMapDispatchContext) as any;
  const lightBoxDispatchContext = useContext(LightBoxDispatchContext);

  // Check if there's a saved vector style
  const hasSavedVectorStyle =
    localStorage.getItem("measurements-vector-style") !== null;

  // Clear saved vector style
  const clearVectorStyle = () => {
    localStorage.removeItem("measurements-vector-style");
    window.location.reload(); // Reload to clear the map
  };

  // Keep ref in sync with state and save to localStorage
  useEffect(() => {
    queryRadiusRef.current = queryRadius;
    localStorage.setItem("measurements-radius", String(queryRadius));
  }, [queryRadius]);

  // Keep tolerance radius ref in sync and save to localStorage
  useEffect(() => {
    toleranceRadiusRef.current = toleranceRadius;
    localStorage.setItem(
      "measurements-tolerance-radius",
      String(toleranceRadius)
    );
  }, [toleranceRadius]);

  // Save mode to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("measurements-mode", mode || "");
  }, [mode]);

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
        <MapMeasurementsObjects />
        <TopicMapSelectionContent />
        <MeasurementsSnapping maplibreMap={maplibreMap} />
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
                selectionEnabled: true,
                logMapLibreErrors: true,
                onMapLibreCoreMapReady: (map: any) => {
                  setMaplibreMap(map);
                },
                onSelectionChanged: (e: any) => {
                  if (e?.hits?.length > 0) {
                    const selectedFeature = e.hits[0];
                    console.log(
                      "xxxy selectedFeature",
                      JSON.stringify(selectedFeature, null, 2)
                    );

                    const p = selectedFeature.properties;

                    if (p.infobox_info) {
                      selectedFeature.properties = {
                        ...selectedFeature.properties,
                        ...JSON.parse(p.infobox_info),
                      };
                      setSelectedFeature(selectedFeature);
                    } else {
                      //if style has /poi/ in it, then it is a POI layer
                      if (style?.indexOf && style.indexOf("/poi/") > -1) {
                        console.log("xxxx style ", style);

                        const createInfoBoxInfo = (p: any) => {
                          const identifications = JSON.parse(p.identifications);
                          const mainlocationtype =
                            identifications[0].identification;
                          const info = {
                            title: p.geographicidentifier,
                            // additionalInfo: "bbb",
                            subtitle: p.strasse,
                            headerColor: p.schrift,
                            header: mainlocationtype,
                            url: p.url,
                            tel: p.telefon,
                          };
                          return info;
                        };

                        selectedFeature.properties = {
                          ...selectedFeature.properties,
                          ...createInfoBoxInfo(p),
                        };

                        setSelectedFeature(selectedFeature);
                      }
                      //if style has /sgk_hausnummer/ in it
                      else if (
                        style?.indexOf &&
                        style.indexOf("/sgk_hausnummern/") > -1
                      ) {
                        console.log("xxx------");

                        const conf = [
                          "title:p.name+' '+p.hnummer",
                          "header:'Adresse ('+p.adressart+')'",
                          "headerColor:({1: '#006622', 2: '#0000CC', 3: '#FF6600', 4: '#CC0000', 5: '#7030A0'}[p.adresstyp] || '#000000')",
                        ];
                        // // Create the function as a string
                        let functionString = `(function(p) {
                                          const info = {`;

                        conf.forEach((rule) => {
                          functionString += `${rule.trim()},\n`;
                        });

                        functionString += `
                                          };
                                          return info;
                    })`;
                        console.log("xxx functionString", functionString);

                        const tmpInfo = eval(functionString)(p);

                        console.log("xxx tmpInfo", tmpInfo);

                        selectedFeature.properties = {
                          ...selectedFeature.properties,
                          ...tmpInfo,
                        };

                        setSelectedFeature(selectedFeature);
                      }
                    }
                  }
                },
              }}
            />
          );
        })}
      </TopicMapComponent>
    </div>
  );
}
