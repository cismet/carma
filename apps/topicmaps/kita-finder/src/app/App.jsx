import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";

import createItemsDictionary from "./helper/createItemsDistionary";
import itemFilterFunction, { traegertypMap } from "./helper/filter";
import {
  getClusterIconCreatorFunction,
  getColorForProperties,
  getFeatureStyler,
} from "./helper/styler";
import titleFactory from "./helper/titleFactory";
import KitaKarte from "./Kitakarte";
import "./index.css";
import "./App.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import { useSelector } from "react-redux";
import { getFeatureRenderingOption } from "./store/slices/ui";
import convertItemToFeature from "./helper/convertItemToFeature";
import {
  backgroundConfWithFastOrtho2024,
  ProgressIndicator,
  useProgress,
} from "@carma-apps/portals";
if (typeof global === "undefined") {
  window.global = window;
}

function App() {
  const featureRenderingOption = useSelector(getFeatureRenderingOption);
  const { progress, showProgress, handleProgressUpdate } = useProgress();

  const filters = {};
  traegertypMap.forEach((traeger) => {
    filters[traeger.text] = true;
  });

  if (featureRenderingOption) {
    return (
      <TopicMapContextProvider
        appKey="OnlineKitaFindernWuppertal2022"
        featureItemsURL={
          import.meta.env.VITE_WUPP_ASSET_BASEURL + "/data/kitas.data.json"
        }
        createFeatureItemsDictionary={createItemsDictionary}
        // getFeatureStyler={getFeatureStyler}
        convertItemToFeature={convertItemToFeature}
        itemFilterFunction={itemFilterFunction}
        titleFactory={titleFactory}
        referenceSystemDefinition={MappingConstants.proj4crs25832def}
        mapEPSGCode="25832"
        referenceSystem={MappingConstants.crs25832}
        filterState={{
          umfang_45: true,
          umfang_35: true,
          alter: "ab3",
          normal: true,
          inklusion: true,
          ...filters,
        }}
        additionalStylingInfo={{ featureRenderingOption }}
        // getColorFromProperties={getColorForProperties}
        featureTooltipFunction={(feature) => feature?.properties?.kurzname}
        convertItemToFeatureProgressCallback={handleProgressUpdate}
        backgroundConfigurations={backgroundConfWithFastOrtho2024}
      >
        <ProgressIndicator progress={progress} show={showProgress} />
        <KitaKarte />
      </TopicMapContextProvider>
    );
  }
}

export default App;
