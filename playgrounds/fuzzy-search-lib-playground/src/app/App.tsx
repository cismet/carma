import { useEffect, useState } from "react";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import { useGazData } from "@carma-apps/portals";

suppressReactCismapErrors();

export function App() {
  const [gazetteerHit, setGazetteerHit] = useState(null);
  const [overlayFeature, setOverlayFeature] = useState(null);

  const { gazData } = useGazData();

  useEffect(() => {
    console.log("hit", gazetteerHit);
  }, [gazetteerHit]);
  useEffect(() => {
    console.log("hit oveyrlay", overlayFeature);
  }, [overlayFeature]);

  return (
    <TopicMapComponent
      gazData={gazData}
      gazetteerSearchComponent={LibFuzzySearch} // TODO fix topicmap selectionintegration to new provider paradigm
      infoBox={<GenericInfoBoxFromFeature />}
    ></TopicMapComponent>
  );
}

export default App;
