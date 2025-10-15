import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { type SearchResultItem } from "@carma/types";

import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import {
  SelectionMetaData,
  useGazData,
  useSelection,
  TopicMapSelectionContent,
  useSelectionTopicMap,
} from "@carma-appframeworks/portals";
import { isAreaType } from "@carma/resources";

suppressReactCismapErrors();

export function App() {
  const { gazData } = useGazData();

  const { setSelection } = useSelection();

  useSelectionTopicMap();

  const onGazetteerSelection = (selection: SearchResultItem | null) => {
    if (!selection) {
      setSelection(null);
      return;
    }
    const selectionMetaData: SelectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaType(selection.type),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));
  };

  return (
    <>
      <TopicMapComponent
        gazData={gazData}
        gazetteerSearchComponent={<></>}
        infoBox={<GenericInfoBoxFromFeature />}
      >
        <TopicMapSelectionContent />
      </TopicMapComponent>
      <div className="custom-left-control">
        <LibFuzzySearch
          gazData={gazData}
          onSelection={onGazetteerSelection}
          placeholder="Wohin?"
        />
      </div>
    </>
  );
}

export default App;
