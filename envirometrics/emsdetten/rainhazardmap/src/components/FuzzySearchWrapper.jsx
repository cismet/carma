import { useSelection, useSelectionTopicMap } from "@carma-apps/portals";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { isAreaTypeWithGEP } from "@carma-commons/resources";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { useContext } from "react";
const FuzzySearchWrapper = ({ gazLocalData, attributionHeight }) => {
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );

  const { setSelection } = useSelection();
  useSelectionTopicMap();

  const ifDesktop = responsiveState === "normal";

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
    <>
      <LibFuzzySearch
        gazData={gazLocalData}
        onSelection={onGazetteerSelection}
        pixelwidth={
          responsiveState === "normal" ? "300px" : windowSize.width - gap
        }
        placeholder="Adresssuche"
      />
    </>
  );
};

export default FuzzySearchWrapper;
