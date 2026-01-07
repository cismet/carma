import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import { TopicMapContextProvider } from "react-cismap/contexts/TopicMapContextProvider";

import { App } from "./app/App";

import "./styles.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "leaflet/dist/leaflet.css";
import {
  GazDataProvider,
  SelectionProvider,
} from "@carma-appframeworks/portals";
import { DatasheetProvider } from "./app/useDatasheet";
import { defaultLayerConf } from "react-cismap/tools/layerFactory";

const backgroundModes = [
  {
    title: "Stadtplan",
    mode: "default",
    layerKey: "stadtplan",
  },
  {
    title: "Stadtplan (Vektordaten )",
    mode: "default",
    layerKey: "vector2",
  },
  {
    title: "Stadtplan (Vektordaten light)",
    mode: "default",
    layerKey: "vector",
  },

  { title: "Luftbildkarte", mode: "default", layerKey: "lbk" },
];
const backgroundConfigurations = {
  lbk: {
    layerkey: "cismetText|trueOrtho2020@40",
    layerkey_: "wupp-plan-live@100|trueOrtho2020@75|rvrSchrift@100",
    src: "/images/rain-hazard-map-bg/ortho.png",
    title: "Luftbildkarte",
  },
  stadtplan: {
    layerkey: "wupp-plan-live@60",
    src: "/images/rain-hazard-map-bg/citymap.png",
    title: "Stadtplan",
  },
  vector: {
    layerkey: "cismetLight",
    src: "/images/rain-hazard-map-bg/citymap.png",
    title: "Stadtplan",
  },
  vector2: {
    layerkey: "OMT_OSM_bright",
    src: "/images/rain-hazard-map-bg/citymap.png",
    title: "Stadtplan",
  },
};
const baseLayerConf = { ...defaultLayerConf };

baseLayerConf.namedLayers.cismetLight = {
  type: "vector",
  style: "https://omt.map-hosting.de/styles/cismet-light/style.json",
  pane: "backgroundvectorLayers",
};

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
root.render(
  <StrictMode>
    <DatasheetProvider>
      <GazDataProvider>
        <SelectionProvider>
          <TopicMapContextProvider
            baseLayerConf={baseLayerConf}
            backgroundConfigurations={backgroundConfigurations}
            backgroundModes={backgroundModes}
          >
            <App />
          </TopicMapContextProvider>
        </SelectionProvider>
      </GazDataProvider>
    </DatasheetProvider>
  </StrictMode>
);
