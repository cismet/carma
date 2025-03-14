import { useEffect } from "react";

import "./App.css";
import { useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import { md5FetchText, fetchJSON } from "react-cismap/tools/fetching";
import { getGazDataForTopicIds } from "react-cismap/tools/gazetteerHelper";

import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { getClusterIconCreatorFunction } from "react-cismap/tools/uiHelper";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import FeatureCollection from "react-cismap/FeatureCollection";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import getGTMFeatureStyler from "react-cismap/topicmaps/generic/GTMStyler";
import { TopicMapSelectionContent } from "@carma-apps/portals";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import FuzzySearchComponent from "./components/FuzzySearchComponent";
import { MappingConstants } from "react-cismap";

const host = import.meta.env.VITE_WUPP_ASSET_BASEURL;

// const getGazData = async (setGazData) => {
//   const prefix = "GazDataForStories";
//   const sources = {};

//   sources.adressen = await md5FetchText(prefix, host + "/data/adressen.json");
//   sources.bezirke = await md5FetchText(prefix, host + "/data/bezirke.json");
//   sources.quartiere = await md5FetchText(prefix, host + "/data/quartiere.json");
//   sources.pois = await md5FetchText(prefix, host + "/data/pois.json");
//   sources.kitas = await md5FetchText(prefix, host + "/data/kitas.json");

//   const gazData = getGazDataForTopicIds(sources, [
//     "pois",
//     "kitas",
//     "bezirke",
//     "quartiere",
//     "adressen",
//   ]);

//   setGazData(gazData);
// };

function App() {
  // const [gazData, setGazData] = useState([]);
  // useEffect(() => {
  //   getGazData(setGazData);
  // }, []);
  return (
    <TopicMapContextProvider
      getFeatureStyler={getGTMFeatureStyler}
      featureItemsURL={host + "/data/parkscheinautomatenfeatures.json"}
      clusteringOptions={{
        iconCreateFunction: getClusterIconCreatorFunction(
          30,
          (props) => props.color
        ),
      }}
      referenceSystemDefinition={MappingConstants.proj4crs25832def}
      mapEPSGCode="25832"
      referenceSystem={MappingConstants.crs25832}
    >
      <TopicMapComponent
        // gazData={gazData}
        locatorControl={true}
        infoBox={<GenericInfoBoxFromFeature pixelwidth={300} />}
        gazetteerSearchControl={true}
        gazetteerSearchComponent={EmptySearchComponent}
      >
        <TopicMapSelectionContent />
        <FeatureCollection />
      </TopicMapComponent>
      <FuzzySearchComponent />
    </TopicMapContextProvider>
  );
}

export default App;
