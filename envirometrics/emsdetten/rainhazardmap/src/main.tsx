import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-cismap/topicMaps.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import { GazDataProvider, SelectionProvider } from "@carma-apps/portals";
import { gazDataConfig } from "./config/gazData";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { MappingConstants } from "react-cismap";
import config from "./config";

ReactDOM.render(
  <React.StrictMode>
    <GazDataProvider config={gazDataConfig}>
      <SelectionProvider>
        <TopicMapContextProvider
          appKey={"cismetRainhazardMap.Emsdetten"}
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

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
