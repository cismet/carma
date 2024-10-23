import { useEffect, useState } from "react";
import { getGazDataForTopicIds } from "react-cismap/tools/gazetteerHelper";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { md5FetchText } from "react-cismap/tools/fetching";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import { suppressReactCismapErrors } from "@carma-commons/utils";

const host = "https://wupp-topicmaps-data.cismet.de";

export const getGazData = async (
  setGazData,
  topics = ["pois", "kitas", "bezirke", "quartiere", "adressen"],
) => {
  const prefix = "GazDataForStories";
  const sources: any = {};

  sources.adressen = await md5FetchText(
    prefix,
    host + "/data/3857/adressen.json",
  );
  sources.bezirke = await md5FetchText(
    prefix,
    host + "/data/3857/bezirke.json",
  );
  sources.quartiere = await md5FetchText(
    prefix,
    host + "/data/3857/quartiere.json",
  );
  sources.pois = await md5FetchText(prefix, host + "/data/3857/pois.json");
  sources.kitas = await md5FetchText(prefix, host + "/data/3857/kitas.json");

  const gazData = getGazDataForTopicIds(sources, topics);

  setGazData(gazData);
};

suppressReactCismapErrors();

export function App() {
  const [gazetteerHit, setGazetteerHit] = useState(null);
  const [overlayFeature, setOverlayFeature] = useState(null);
  const [gazData, setGazData] = useState([]);
  useEffect(() => {
    const res = getGazData(setGazData);
  }, []);

  useEffect(() => {
    console.log("hit", gazetteerHit);
  }, [gazetteerHit]);
  useEffect(() => {
    console.log("hit oveyrlay", overlayFeature);
  }, [overlayFeature]);

  return (
    <TopicMapContextProvider>
      <TopicMapComponent
        // gazData={gazData}
        gazetteerSearchComponent={LibFuzzySearch}
        infoBox={<GenericInfoBoxFromFeature />}
      ></TopicMapComponent>
    </TopicMapContextProvider>
  );
}

export default App;
