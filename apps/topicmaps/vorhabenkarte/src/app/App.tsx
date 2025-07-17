import { useEffect, useState } from "react";
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
import { getTopics } from "../helper/getTopics";

export type Topic = {
  id: number;
  name: string;
  farbe: string;
  fuellung: number;
  signatur: string;
};

export function App() {
  const [topicsWithColor, setTopicsWithColor] = useState<Topic[]>([]);
  const topics = topicsWithColor.map((t) => t.name);
  useEffect(() => {
    document.title = "Vorhabenkarte Wuppertal";
    addTitleFlag();
    const fetchTopics = async (url) => {
      const res = await getTopics(url);
      if (res) {
        setTopicsWithColor(res);
      }
    };

    fetchTopics(
      import.meta.env.VITE_WUPP_ASSET_BASEURL + "/data/vk_thema.data.json"
    );
  }, []);
  return (
    <TopicMapContextProvider
      appKey="VorhabenkarteWuppertal2025"
      featureItemsURL={
        import.meta.env.VITE_WUPP_ASSET_BASEURL +
        "/data/vorhabenkarte.data.json"
      }
      referenceSystemDefinition={MappingConstants.proj4crs25832def}
      mapEPSGCode="25832"
      referenceSystem={MappingConstants.crs25832}
      getFeatureStyler={getFeatureStyler}
      featureTooltipFunction={(feature) => feature?.text}
      itemFilterFunction={itemFilterFunction}
      filterState={{
        topics: [],
        citizen: false,
      }}
      convertItemToFeature={convertItemToFeature}
    >
      <Map topicsWitColors={topicsWithColor} />
    </TopicMapContextProvider>
  );
}

export default App;
