import {
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import {
  defaultTypeInference,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { useContext } from "react";
import { FeatureCollectionDispatchContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import { isAreaType } from "@carma-commons/resources";

const FuzzySearchWrapper = ({ searchTextPlaceholder }) => {
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );
  const { setSelectedFeatureByPredicate } = useContext(
    FeatureCollectionDispatchContext
  );

  const pixelwidth =
    responsiveState === "normal" ? "300px" : windowSize.width - gap;
  const { setSelection } = useSelection();
  useSelectionTopicMap();

  const onGazetteerSelection = (selection) => {
    if (!selection) {
      setSelection(null);
      return;
    }
    const selectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaType(selection.type),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));

    setTimeout(() => {
      const gazId = selection.more?.mid;
      setSelectedFeatureByPredicate(
        (feature) => feature.properties.id === gazId
      );
    }, 100);
  };

  return (
    <div className="custom-left-control">
      <LibFuzzySearch
        onSelection={onGazetteerSelection}
        placeholder={searchTextPlaceholder}
        pixelwidth={
          responsiveState === "normal" ? "300px" : windowSize.width - gap
        }
        priorityTypes={[
          "no2",
          "bezirke",
          "quartiere",
          "adressen",
          "streets",
          "schulen",
          "kitas",
          "pois",
          "poisAlternativeNames",
        ]}
        typeInference={defaultTypeInference}
      />
    </div>
  );
};

export default FuzzySearchWrapper;
