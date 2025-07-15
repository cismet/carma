import { useEffect } from "react";

import "./App.css";
import { useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";

import getGTMFeatureStyler from "react-cismap/topicmaps/generic/GTMStyler";
import ContactButton from "react-cismap/ContactButton";
import convertItemToFeature from "./helper/convertItemToFeature";

import { getClusterIconCreatorFunction } from "react-cismap/tools/uiHelper";
import UWZ from "./Umweltzonenlayer";
import itemFilterFunction from "./helper/filterFunction";
import {
  LOOKUP,
  getStatus,
} from "@carma-collab/wuppertal/luftmessstationen/helper";
import { getGazData } from "./helper/getGazData";
import titleFactory from "./helper/titleFactory";
import { MappingConstants } from "react-cismap";
import Luftmessstationskarte from "./Luftmessstationskarte";
import {
  backgroundConfWithFastOrtho2024,
  ProgressIndicator,
  useProgress,
} from "@carma-apps/portals";

function App() {
  const [gazData, setGazData] = useState([]);
  const { progress, showProgress, handleProgressUpdate } = useProgress();
  useEffect(() => {
    getGazData(setGazData);
    document.title = "Luftmessstationskarte Wuppertal";
  }, []);

  return (
    <TopicMapContextProvider
      appKey="LuftmessstationenWuppertal.TopicMap"
      featureItemsURL={
        import.meta.env.VITE_WUPP_ASSET_BASEURL + "/data/no2.data.json"
      }
      // featureItemsURL={"/data/no2.data.json"} //for dev purpose only
      referenceSystemDefinition={MappingConstants.proj4crs25832def}
      mapEPSGCode="25832"
      referenceSystem={MappingConstants.crs25832}
      getFeatureStyler={getGTMFeatureStyler}
      featureTooltipFunction={(feature) => feature?.text}
      convertItemToFeature={convertItemToFeature}
      clusteringOptions={{
        iconCreateFunction: getClusterIconCreatorFunction(
          30,
          (props) => props.color
        ),
      }}
      additionalLayerConfiguration={{
        uwz: {
          title: "Umweltzone",
          initialActive: true,
          layer: <UWZ />,
        },
      }}
      filterState={{
        stations: [
          "unauffaellig",
          "auffaellig",
          "warnend",
          "inaktiv",
          "abgebaut",
        ],
      }}
      titleFactory={titleFactory}
      itemFilterFunction={itemFilterFunction}
      classKeyFunction={(item) => LOOKUP[getStatus(item)].title}
      getColorFromProperties={(item) => LOOKUP[getStatus(item)].color}
      convertItemToFeatureProgressCallback={handleProgressUpdate}
      backgroundConfigurations={backgroundConfWithFastOrtho2024}
    >
      <ProgressIndicator progress={progress} show={showProgress} />
      <Luftmessstationskarte />
    </TopicMapContextProvider>
  );
}

export default App;
