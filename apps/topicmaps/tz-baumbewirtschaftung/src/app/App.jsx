import React, { useEffect } from "react";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";

import convertItemToFeature from "./helper/convertItemToFeature";

import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "./App.css";
import Map from "./Map";
import {
  getFeatureStyler,
  getPoiClusterIconCreatorFunction,
} from "./helper/styler";
import "./index.css";
import {
  backgroundConfWithFastOrtho2024,
  ProgressIndicator,
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
      // featureItemsURL={dataUrl}
      clusteringEnabled={false}
      // referenceSystemDefinition={MappingConstants.proj4crs3857def}
      // mapEPSGCode="3857"
      // referenceSystem={MappingConstants.crs3857}
      // getFeatureStyler={getFeatureStyler}
      // featureTooltipFunction={(feature) => feature?.text}
      convertItemToFeature={(x) => x}
      // clusteringOptions={{
      //   iconCreateFunction: getPoiClusterIconCreatorFunction({ svgSize: 24 }),
      // }}
      // convertItemToFeatureProgressCallback={handleProgressUpdate}
      backgroundConfigurations={backgroundConfWithFastOrtho2024}
    >
      {/* <ProgressIndicator progress={progress} show={showProgress} /> */}
      <Map />
    </TopicMapContextProvider>
  );
}

export default App;
