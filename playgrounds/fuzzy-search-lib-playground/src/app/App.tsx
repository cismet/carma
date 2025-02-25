import { useEffect, useState } from "react";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { LibFuzzySearch, SearchResultItem } from "@carma-mapping/fuzzy-search";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import {
  SelectionMetaData,
  useGazData,
  useSelection,
} from "@carma-apps/portals";
import { ENDPOINT, isAreaType } from "@carma-commons/resources";

suppressReactCismapErrors();

export function App() {
  const { gazData } = useGazData();
  console.log("xxx gazData", gazData);

  const { setSelection } = useSelection();

  const onGazetteerSelection = (selection: SearchResultItem | null) => {
    if (!selection) {
      //console.debug("onGazetteerSelection", selection);
      setSelection(null);
      return;
    }
    const selectionMetaData: SelectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaType(selection.type as ENDPOINT),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));
  };

  return (
    <TopicMapComponent
      gazData={gazData}
      gazetteerSearchComponent={
        <LibFuzzySearch
          gazData={gazData}
          //referenceSystem={referenceSystem}
          //referenceSystemDefinition={referenceSystemDefinition}
          onSelection={onGazetteerSelection}
          placeholder="Wohin?"
        />
      } // TODO fix topicmap selectionintegration to new provider paradigm
      infoBox={<GenericInfoBoxFromFeature />}
    ></TopicMapComponent>
  );
}

export default App;
