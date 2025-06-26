import { useEffect } from "react";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { MappingConstants } from "react-cismap";

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
import { FeatureIconOverlay } from "./components/FeatureIconOverlay";
import itemFilterFunction from "../helper/filter";

export function App() {
  useEffect(() => {
    document.title = "Vorhabenkarte Wuppertal";
  }, []);
  return (
    <TopicMapContextProvider
      appKey="VorhabenkarteWuppertal2025"
      featureItemsURL={
        import.meta.env.VITE_WUPP_ASSET_BASEURL +
        "/data/vorhabenkarte.data.json"
      }
      referenceSystemDefinition={MappingConstants.proj4crs25832def}
      mapEPSGCode="25832"
      referenceSystem={MappingConstants.crs25832}
      getFeatureStyler={getFeatureStyler}
      featureTooltipFunction={(feature) => feature?.text}
      itemFilterFunction={itemFilterFunction}
      filterState={{
        stek: [],
        citizen: false,
      }}
      convertItemToFeature={convertItemToFeature}
      clusteringOptions={{
        iconCreateFunction: getPoiClusterIconCreatorFunction({ svgSize: 24 }),
      }}
    >
      <Map />
      <FeatureIconOverlay zoomLevel={11} />
    </TopicMapContextProvider>
  );
}

export default App;
