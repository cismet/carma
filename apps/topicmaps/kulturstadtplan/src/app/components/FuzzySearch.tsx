import {
  SelectionMetaData,
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import { LibFuzzySearch, SearchResultItem } from "@carma-mapping/fuzzy-search";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { useContext } from "react";
import { FeatureCollectionDispatchContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import { ENDPOINT, isAreaType } from "@carma-commons/resources";

const FuzzySearch = ({ searchTextPlaceholder }) => {
  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);
  const { setSelectedFeatureByPredicate } = useContext<
    typeof FeatureCollectionDispatchContext
  >(FeatureCollectionDispatchContext);

  const pixelwidth =
    responsiveState === "normal" ? "300px" : windowSize.width - gap;

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
      isAreaSelection: isAreaType(selection.type as ENDPOINT),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));

    setTimeout(() => {
      const gazId = selection.more?.pid || selection.more?.kid;
      setSelectedFeatureByPredicate(
        (feature) => feature.properties.id === gazId
      );
    }, 100);
  };

  return (
    <div className="custom-left-control">
      <LibFuzzySearch
        gazData={gazData}
        onSelection={onGazetteerSelection}
        pixelwidth={pixelwidth}
        placeholder={searchTextPlaceholder}
      />
    </div>
  );
};

export default FuzzySearch;
