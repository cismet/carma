import React, { useEffect } from "react";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";

import convertItemToFeature from "./helper/convertItemToFeature";

import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "./App.css";
import Baederkarte from "./Baederkarte";
import {
  getFeatureStyler,
  getPoiClusterIconCreatorFunction,
} from "./helper/styler";
import "./index.css";
import {
  backgroundConfWithFastOrtho2024,
  ProgressIndicator,
  useProgress,
} from "@carma-apps/portals";
if (typeof global === "undefined") {
  window.global = window;
}

function App() {
  const { progress, showProgress, handleProgressUpdate } = useProgress();

  useEffect(() => {
    document.title = "Bäderkarte Wuppertal";
  }, []);

  return (
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
      convertItemToFeatureProgressCallback={handleProgressUpdate}
      backgroundConfigurations={backgroundConfWithFastOrtho2024}
    >
      <ProgressIndicator progress={progress} show={showProgress} />
      <Baederkarte />
    </TopicMapContextProvider>
  );
}

export default App;
