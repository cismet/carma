import { useEffect } from "react";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import type { LibreLayer } from "@carma-mapping/core";

import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import Map from "./components/Map";
import { addTitleFlag } from "../helper/urlHelper";

const VORHABENKARTE_STYLE_URL =
  "https://tiles.cismet.de/vorhabenkarte/style.json";

const LIBRE_LAYERS: LibreLayer[] = [
  {
    type: "vector",
    name: "Vorhaben",
    style: VORHABENKARTE_STYLE_URL,
    promoteId: "fid",
  },
];

export function App() {
  useEffect(() => {
    document.title = "Vorhabenkarte Wuppertal";
    addTitleFlag();
  }, []);
  return (
    <TopicMapContextProvider
      appKey="VorhabenkarteWuppertal2026"
      infoBoxPixelWidth={350}
    >
      <Map libreLayers={LIBRE_LAYERS} />
    </TopicMapContextProvider>
  );
}

export default App;
