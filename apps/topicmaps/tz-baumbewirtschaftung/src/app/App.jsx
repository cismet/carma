import { useEffect } from "react";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { defaultLayerConf } from "react-cismap/tools/layerFactory";

import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "./App.css";
import Map from "./Map";
import "./index.css";
import {
  backgroundConfWithFastOrtho2024,
  useProgress,
} from "@carma-appframeworks/portals";

if (typeof global === "undefined") {
  window.global = window;
}
export const offlineConfig = {
  rules: [
    {
      origin: "https://omt.map-hosting.de/fonts/Metropolis Medium Italic,Noto",
      cachePath: "fonts/Open",
    },
    {
      origin: "https://omt.map-hosting.de/fonts/Klokantech Noto",
      cachePath: "fonts/Open",
    },
    {
      origin: "https://omt.map-hosting.de/fonts",
      cachePath: "fonts",
    },
    {
      origin: "https://omt.map-hosting.de/styles",
      cachePath: "styles",
    },

    {
      origin: "https://omt.map-hosting.de/data/v3",
      cachePath: "tiles",
    },

    {
      origin: "https://omt.map-hosting.de/data/gewaesser",
      cachePath: "tiles.gewaesser",
    },

    {
      origin: "https://omt.map-hosting.de/data/kanal",
      cachePath: "tiles.kanal",
    },

    {
      origin: "https://omt.map-hosting.de/data/brunnen",
      cachePath: "tiles.brunnen",
      // realServerFallback: true, //this can override the globalsetting
    },
  ],
  dataStores: [
    {
      name: "Vektorkarte für Wuppertal",
      key: "wuppBasemap",
      url: "https://offline-data.cismet.de/offline-data/wupp.zip",
    },
  ],
  offlineStyles: [
    "https://omt.map-hosting.de/styles/cismet-light/style.json",
    "https://omt.map-hosting.de/styles/osm-bright-grey/style.json",
    "https://omt.map-hosting.de/styles/dark-matter/style.json",
    "https://omt.map-hosting.de/styles/klokantech-basic/style.json",
  ],
  realServerFallback: true, //should be true in production
  consoleDebug: false && process.env.NODE_ENV !== "production",
  optional: true,
  initialActive: false, //todo set to true in production
};

const baseLayerConf = { ...defaultLayerConf };
if (!baseLayerConf.namedLayers.osmBrightOffline) {
  baseLayerConf.namedLayers.osmBrightOffline = {
    type: "vector",
    style: "https://omt.map-hosting.de/styles/osm-bright-grey/style.json",
    offlineAvailable: true,
    offlineDataStoreKey: "wuppBasemap",
    pane: "backgroundvectorLayers",
  };
}

const backgroundModes = [
  {
    title: "Stadtplan (Tag)",
    mode: "default",
    layerKey: "stadtplan",
  },
  {
    title: "Stadtplan (Nacht)",
    mode: "night",
    layerKey: "stadtplan",
  },
  { title: "Luftbildkarte", mode: "default", layerKey: "lbk" },
  {
    title: "Vektor-Stadtplan",
    mode: "default",
    layerKey: "vectorCityMap",
    offlineDataStoreKey: "wuppBasemap",
  },
];

const bgConf = {
  ...backgroundConfWithFastOrtho2024,
  vectorCityMap: {
    layerkey: "osmBrightOffline",
    src: "/images/rain-hazard-map-bg/citymap.png",
    title: "Stadtplan",
  },
};
function App() {
  const { progress, showProgress, handleProgressUpdate } = useProgress();

  useEffect(() => {
    document.title = "Teilzwilling Baumbewirtschaftung Wuppertal";
  }, []);

  return (
    <TopicMapContextProvider
      appKey="tz.baumbewirtschaftung"
      backgroundConfigurations={bgConf}
      backgroundModes={backgroundModes}
      baseLayerConf={baseLayerConf}
      offlineCacheConfig={offlineConfig}
    >
      <Map />
    </TopicMapContextProvider>
  );
}

export default App;
