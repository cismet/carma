import {
  SelectionMetaData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import {
  defaultTypeInference,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import { type SearchResultItem } from "@carma-commons/types";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { useContext } from "react";
import { ENDPOINT, isAreaType } from "@carma-commons/resources";

const FuzzySearchWrapper = ({ searchTextPlaceholder }) => {
  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);

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
  };

  return (
    <div className="custom-left-control">
      <LibFuzzySearch
        onSelection={onGazetteerSelection}
        pixelwidth={
          responsiveState === "normal" ? "300px" : windowSize.width - gap
        }
        placeholder={searchTextPlaceholder}
        priorityTypes={[
          "pr",
          "br",
          "bezirke",
          "quartiere",
          "adressen",
          "streets",
          "pois",
          "poisAlternativeNames",
          "schulen",
          "kitas",
        ]}
        typeInference={{
          ...defaultTypeInference,
          prbr: (item) => {
            if (item.glyph === "car") {
              return "pr";
            } else if (item.glyph === "bicycle") {
              return "br";
            } else {
              return "prbr";
            }
          },
        }}
      />
    </div>
  );
};

export default FuzzySearchWrapper;
