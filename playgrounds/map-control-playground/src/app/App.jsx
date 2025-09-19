import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet.locatecontrol";
import "leaflet.locatecontrol/dist/L.Control.Locate.css";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import "react-bootstrap-typeahead/css/Typeahead.css";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import "react-cismap/topicMaps.css";
import "./App.css";
import convertItemToFeature from "./helper/convertItemToFeature";
import {
  getFeatureStyler,
  getPoiClusterIconCreatorFunction,
} from "./helper/styler";
import "./index.css";
import Map from "./Map";

if (typeof global === "undefined") {
  window.global = window;
}

function App() {
  useEffect(() => {
    document.title = "Map Wuppertal";
  }, []);

  return (
    <div style={{ height: "100dvh" }}>
      <TopicMapContextProvider
        appKey="OnlineBaederkarteWuppertal2022"
        featureItemsURL={
          import.meta.env.VITE_WUPP_ASSET_BASEURL + "/data/baeder.data.json"
        }
        referenceSystemDefinition={MappingConstants.proj4crs25832def}
        mapEPSGCode="25832"
        referenceSystem={MappingConstants.crs25832}
        getFeatureStyler={getFeatureStyler}
        featureTooltipFunction={(feature) => feature?.text}
        convertItemToFeature={convertItemToFeature}
        clusteringOptions={{
          iconCreateFunction: getPoiClusterIconCreatorFunction({ svgSize: 24 }),
        }}
      >
        <Map />
      </TopicMapContextProvider>
    </div>
  );
}

export default App;
