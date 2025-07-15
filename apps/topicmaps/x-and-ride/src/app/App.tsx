import { useEffect } from "react";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";

import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import Map from "./components/Map";
import convertItemToFeature from "../helper/convertItemToFeature";
import {
  getFeatureStyler,
  getPoiClusterIconCreatorFunction,
} from "../helper/styler";

import titleFactory from "../helper/titleFactory";
import itemFilterFunction from "../helper/filter";
import { FeatureCollectionDisplayWithTooltipLabels } from "react-cismap";
import uwz from "./components/UWZ";
import {
  backgroundConfWithFastOrtho2024,
  ProgressIndicator,
  useProgress,
} from "@carma-apps/portals";

export function App() {
  const { progress, showProgress, handleProgressUpdate } = useProgress();
  useEffect(() => {
    document.title = "Park+Ride-Karte Wuppertal";
  }, []);
  return (
    <TopicMapContextProvider
      appKey="XAndRideWuppertal2022"
      featureItemsURL={
        import.meta.env.VITE_WUPP_ASSET_BASEURL + "/data/prbr.data.json"
      }
      referenceSystemDefinition={MappingConstants.proj4crs25832def}
      mapEPSGCode="25832"
      referenceSystem={MappingConstants.crs25832}
      getFeatureStyler={getFeatureStyler}
      featureTooltipFunction={(feature) => feature?.text}
      titleFactory={titleFactory}
      convertItemToFeature={convertItemToFeature}
      clusteringOptions={{
        iconCreateFunction: getPoiClusterIconCreatorFunction(35),
      }}
      itemFilterFunction={itemFilterFunction}
      filterState={{
        pandr: true,
        bandr: true,
        envZoneOutside: true,
        envZoneWithin: true,
      }}
      additionalLayerConfiguration={{
        umweltzonen: {
          title: <span>Umweltzonen</span>,
          initialActive: true,
          layer: (
            <FeatureCollectionDisplayWithTooltipLabels
              key={"ds"}
              featureCollection={uwz}
              style={() => {
                const style = {
                  color: "#155317",
                  weight: 3,
                  opacity: 0.5,
                  fillColor: "#155317",
                  fillOpacity: 0.15,
                };
                return style;
              }}
              featureClickHandler={() => {}}
              labeler={() => {
                return (
                  <h3
                    style={{
                      color: "#155317",
                      opacity: 0.7,
                      textShadow:
                        "1px 1px 0px  #000000,-1px 1px 0px  #000000, 1px -1px 0px  #000000, -1px -1px 0px  #000000, 2px 2px 15px #000000",
                    }}
                  >
                    Umweltzone
                  </h3>
                );
              }}
            />
          ),
        },
      }}
      convertItemToFeatureProgressCallback={handleProgressUpdate}
      backgroundConfigurations={backgroundConfWithFastOrtho2024}
    >
      <ProgressIndicator progress={progress} show={showProgress} />
      <Map />
    </TopicMapContextProvider>
  );
}

export default App;
