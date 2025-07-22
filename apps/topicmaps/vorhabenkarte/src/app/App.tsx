import { useEffect } from "react";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { MappingConstants } from "react-cismap";

import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import Map from "./components/Map";
import convertItemToFeature from "../helper/convertItemToFeature";
import { getFeatureStyler } from "../helper/styler";
import itemFilterFunction from "../helper/filter";
import { addTitleFlag } from "../helper/urlHelper";
import titleFactory from "../helper/titleFactory";
import createItemsDictionary from "../helper/createItemsDictionary";

export function App() {
  useEffect(() => {
    document.title = "Vorhabenkarte Wuppertal";
    addTitleFlag();
  }, []);
  return (
    <TopicMapContextProvider
      appKey="VorhabenkarteWuppertal2025"
      featureItemsURL={
        import.meta.env.VITE_WUPP_ASSET_BASEURL +
        "/data/vorhabenkarte.data.json"
      }
      createFeatureItemsDictionary={createItemsDictionary}
      referenceSystemDefinition={MappingConstants.proj4crs25832def}
      mapEPSGCode="25832"
      referenceSystem={MappingConstants.crs25832}
      titleFactory={titleFactory}
      getFeatureStyler={getFeatureStyler}
      featureTooltipFunction={(feature) => feature?.text}
      itemFilterFunction={itemFilterFunction}
      filterState={{
        // topics: [],
        citizen: false,
      }}
      convertItemToFeature={convertItemToFeature}
    >
      <Map />
    </TopicMapContextProvider>
  );
}

export default App;
