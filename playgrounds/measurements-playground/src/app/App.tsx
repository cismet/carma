import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import {
  MeasurementControl,
  MapMeasurementsObjects,
  MeasurementsSnapping,
  MEASUREMENT_MODE,
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

suppressReactCismapErrors();

export function App({ vectorStyles = [] }: { vectorStyles?: any[] }) {
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  ) as any;
  useSelectionTopicMap();
  const [selectedFeature, setSelectedFeature] = useState<any>(undefined);
  const { maplibreMap, setMaplibreMap } = useMapLibreMap();
  const { mode: measurementMode, setMode: setMeasurementMode } =
    useMapMeasurementsContext();
  const { zoomToFeature } = useContext(TopicMapDispatchContext) as any;

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

        {measurementMode === MEASUREMENT_MODE.MEASUREMENT && (
          <MeasurementsSnapping maplibreMap={maplibreMap} />
        )}

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
                },
                // onSelectionChanged: (e: any) => {
                //   if (e?.hits?.length > 0) {
                //     const selectedFeature = e.hits[0];
                //     console.log(
                //       "xxxy selectedFeature",
                //       JSON.stringify(selectedFeature, null, 2)
                //     );

                //     const p = selectedFeature.properties;

                //     if (p.infobox_info) {
                //       selectedFeature.properties = {
                //         ...selectedFeature.properties,
                //         ...JSON.parse(p.infobox_info),
                //       };
                //       setSelectedFeature(selectedFeature);
                //     } else {
                //       //if style has /poi/ in it, then it is a POI layer
                //       if (style?.indexOf && style.indexOf("/poi/") > -1) {
                //         console.log("xxxx style ", style);

                //         const createInfoBoxInfo = (p: any) => {
                //           const identifications = JSON.parse(p.identifications);
                //           const mainlocationtype =
                //             identifications[0].identification;
                //           const info = {
                //             title: p.geographicidentifier,
                //             // additionalInfo: "bbb",
                //             subtitle: p.strasse,
                //             headerColor: p.schrift,
                //             header: mainlocationtype,
                //             url: p.url,
                //             tel: p.telefon,
                //           };
                //           return info;
                //         };

                //         selectedFeature.properties = {
                //           ...selectedFeature.properties,
                //           ...createInfoBoxInfo(p),
                //         };

                //         setSelectedFeature(selectedFeature);
                //       }
                //       //if style has /sgk_hausnummer/ in it
                //       else if (
                //         style?.indexOf &&
                //         style.indexOf("/sgk_hausnummern/") > -1
                //       ) {
                //         console.log("xxx------");

                //         const conf = [
                //           "title:p.name+' '+p.hnummer",
                //           "header:'Adresse ('+p.adressart+')'",
                //           "headerColor:({1: '#006622', 2: '#0000CC', 3: '#FF6600', 4: '#CC0000', 5: '#7030A0'}[p.adresstyp] || '#000000')",
                //         ];
                //         // // Create the function as a string
                //         let functionString = `(function(p) {
                //                           const info = {`;

                //         conf.forEach((rule) => {
                //           functionString += `${rule.trim()},\n`;
                //         });

                //         functionString += `
                //                           };
                //                           return info;
                //     })`;
                //         console.log("xxx functionString", functionString);

                //         const tmpInfo = eval(functionString)(p);

                //         console.log("xxx tmpInfo", tmpInfo);

                //         selectedFeature.properties = {
                //           ...selectedFeature.properties,
                //           ...tmpInfo,
                //         };

                //         setSelectedFeature(selectedFeature);
                //       }
                //     }
                //   }
                // },
              }}
            />
          );
        })}
      </TopicMapComponent>
    </div>
  );
}
