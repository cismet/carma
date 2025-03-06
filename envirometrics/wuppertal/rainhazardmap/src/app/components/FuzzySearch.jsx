import {
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { isAreaTypeWithGEP } from "@carma-commons/resources";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { useContext } from "react";
const FuzzySearch = () => {
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
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
  };

  return (
    <div className="custom-left-control">
      <LibFuzzySearch
        gazData={gazData}
        onSelection={onGazetteerSelection}
        pixelwidth={pixelwidth}
        placeholder="Stadtteil | Adresse | POI | GEP"
      />
    </div>
  );
};

export default FuzzySearch;
