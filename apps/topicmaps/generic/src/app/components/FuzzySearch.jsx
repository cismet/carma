import {
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { useContext } from "react";
import { FeatureCollectionDispatchContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import { isAreaType } from "@carma-commons/resources";

const FuzzySearch = ({ featureGazData }) => {
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );

  const pixelwidth =
    responsiveState === "normal" ? "300px" : windowSize.width - gap;
  const { gazData } = useGazData();
  const commonGazData = [...featureGazData, ...gazData];

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
  };

  return (
    <>
      {gazData.length > 0 && (
        <div className="custom-left-control">
          <LibFuzzySearch
            gazData={commonGazData}
            onSelection={onGazetteerSelection}
            pixelwidth={pixelwidth}
            placeholder="Stadtteil | Adresse | Kita"
          />
        </div>
      )}
    </>
  );
};

export default FuzzySearch;
