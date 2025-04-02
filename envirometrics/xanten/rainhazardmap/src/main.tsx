import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-cismap/topicMaps.css";
import App from "./App";
import { GazDataProvider, SelectionProvider } from "@carma-apps/portals";
import { gazDataConfig } from "./config/gazData";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import config from "./config";

const appKey = "cismetRainhazardMap";

ReactDOM.render(
  <React.StrictMode>
    <GazDataProvider config={gazDataConfig}>
      <SelectionProvider>
        <TopicMapContextProvider
          appKey={appKey + ".Xanten"}
          referenceSystem={MappingConstants.crs3857}
          referenceSystemDefinition={MappingConstants.proj4crs3857def}
          baseLayerConf={config.overridingBaseLayerConf}
          infoBoxPixelWidth={370}
        >
          <App />
        </TopicMapContextProvider>
      </SelectionProvider>
    </GazDataProvider>
  </React.StrictMode>,
  document.getElementById("root")
);
