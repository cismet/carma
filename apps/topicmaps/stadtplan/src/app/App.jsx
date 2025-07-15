import React from "react";
import { useEffect } from "react";
import { useState } from "react";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";

import { getConvertItemToFeatureWithPOIColors } from "./helper/convertItemToFeature";
import createItemsDictionary from "./helper/createItemsDistionary";
import itemFilterFunction from "./helper/filter";
import { getPOIColors } from "./helper/helper";
import {
  getFeatureStyler,
  getPoiClusterIconCreatorFunction,
} from "./helper/styler";
import { ProgressBar } from "react-bootstrap";
import titleFactory from "./helper/titleFactory";
import Stadtplankarte from "./Stadtplankarte";
import "./index.css";
import "./App.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import { ProgressIndicator, useProgress } from "@carma-apps/portals";
if (typeof global === "undefined") {
  window.global = window;
}

function App() {
  const [poiColors, setPoiColors] = useState();
  const { progress, showProgress, handleProgressUpdate } = useProgress();

  useEffect(() => {
    getPOIColors(setPoiColors);
    document.title = "Online-Stadtplan Wuppertal";
  }, []);
  if (poiColors) {
    return (
      <TopicMapContextProvider
        appKey="OnlineStadtplanWuppertal2022"
        featureItemsURL={
          import.meta.env.VITE_WUPP_ASSET_BASEURL + "/data/poi.data.json"
        }
        createFeatureItemsDictionary={createItemsDictionary}
        getFeatureStyler={getFeatureStyler}
        convertItemToFeature={getConvertItemToFeatureWithPOIColors(poiColors)}
        itemFilterFunction={itemFilterFunction}
        titleFactory={titleFactory}
        referenceSystemDefinition={MappingConstants.proj4crs25832def}
        clusteringOptions={{
          iconCreateFunction: getPoiClusterIconCreatorFunction({
            svgSize: 35,
            poiColors,
          }),
        }}
        convertItemToFeatureProgressCallback={handleProgressUpdate}
        mapEPSGCode="25832"
        referenceSystem={MappingConstants.crs25832}
        additionalStylingInfo={{ poiColors }}
        featureTooltipFunction={(feature) => {
          return feature?.text;
        }}
      >
        <ProgressIndicator progress={progress} show={showProgress} />
        <Stadtplankarte poiColors={poiColors} />
      </TopicMapContextProvider>
    );
  } else {
    return <div>loading</div>;
  }
}

export default App;
