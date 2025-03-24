import {
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { isAreaTypeWithGEP } from "@carma-commons/resources";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { useContext } from "react";
import { FeatureCollectionDispatchContext } from "react-cismap/contexts/FeatureCollectionContextProvider";

const FuzzySearch = () => {
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );
  const { setSelectedFeatureByPredicate } = useContext(
    FeatureCollectionDispatchContext
  );

  const pixelwidth =
    responsiveState === "normal" ? "300px" : windowSize.width - gap;
  const { gazData } = useGazData();
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
      isAreaSelection: isAreaTypeWithGEP(selection.type),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));
    setTimeout(() => {
      const gazId = selection.more?.pid || selection.more?.kid;
      setSelectedFeatureByPredicate(
        (feature) => feature.properties.id === gazId
      );
    }, [100]);
  };

  return (
    <div className="custom-left-control">
      <LibFuzzySearch
        gazData={gazData}
        onSelection={onGazetteerSelection}
        pixelwidth={pixelwidth}
        placeholder="Stadtteil | Adresse | POI"
      />
    </div>
  );
};

export default FuzzySearch;
