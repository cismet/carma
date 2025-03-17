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
if (typeof global === "undefined") {
  window.global = window;
}

function App() {
  const [poiColors, setPoiColors] = useState();
  const [progress, setProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
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
        convertItemToFeatureProgressCallback={(e) => {
          const newProgress = Math.round((e.current / e.total) * 100);
          setProgress(newProgress);
          setShowProgress(newProgress < 100);
        }}
        mapEPSGCode="25832"
        referenceSystem={MappingConstants.crs25832}
        additionalStylingInfo={{ poiColors }}
        featureTooltipFunction={(feature) => {
          return feature?.text;
        }}
      >
        {showProgress && (
          <div
            style={{
              position: "absolute",
              zIndex: 1000,
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              backgroundColor: "rgba(255, 255, 255, 0.65)",
              padding: "25px 30px",
              borderRadius: "12px",
              boxShadow:
                "0 10px 25px rgba(0,0,0,0.1), 0 5px 10px rgba(0,0,0,0.05)",
              width: "350px",
              border: "1px solid rgba(0,0,0,0.1)",
              backdropFilter: "blur(5px)",
            }}
          >
            <div
              style={{
                fontSize: "14px",
                marginBottom: "12px",
                color: "#666",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              Daten werden geladen und gecached ...
            </div>
            <ProgressBar
              now={progress}
              // label={`${progress}%`}
              style={{
                height: "20px",
                borderRadius: "10px",
                overflow: "hidden",
              }}
              variant="secondary"
              animated
            />
          </div>
        )}
        <Stadtplankarte poiColors={poiColors} />
      </TopicMapContextProvider>
    );
  } else {
    return <div>loading</div>;
  }
}

export default App;
