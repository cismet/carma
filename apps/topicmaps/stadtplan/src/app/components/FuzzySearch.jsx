import { useGazData, useSelectionTopicMap } from "@carma-apps/portals";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { useCreateGazetteerSelectorForLeaflet } from "@carma-mapping/fuzzy-search/utils/fuzzySearchHelper";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { useContext } from "react";

const FuzzySearch = ({ searchTextPlaceholder }) => {
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );
  const pixelwidth =
    responsiveState === "normal" ? "300px" : windowSize.width - gap;
  const { gazData } = useGazData();
  useSelectionTopicMap();

  return (
    <div className="custom-left-control">
      <LibFuzzySearch
        gazData={gazData}
        onSelection={useCreateGazetteerSelectorForLeaflet()}
        pixelwidth={pixelwidth}
        placeholder={searchTextPlaceholder}
      />
    </div>
  );
};

export default FuzzySearch;
