import { useEffect } from "react";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";

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

function App() {
  const { progress, showProgress, handleProgressUpdate } = useProgress();

  useEffect(() => {
    document.title = "Teilzwilling Baumbewirtschaftung Wuppertal";
  }, []);

  return (
    <TopicMapContextProvider
      appKey="tz.baumbewirtschaftung"
      backgroundConfigurations={backgroundConfWithFastOrtho2024}
    >
      <Map />
    </TopicMapContextProvider>
  );
}

export default App;
