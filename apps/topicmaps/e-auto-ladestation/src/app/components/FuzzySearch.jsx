import {
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { isAreaType } from "@carma-commons/resources";
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
      isAreaSelection: isAreaType(selection.type),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));
    setTimeout(() => {
      const gazId = selection.more?.pid || selection.more?.id;
      setSelectedFeatureByPredicate(
        (feature) => feature.properties.id === gazId
      );
    }, 100);
  };

  return (
    <div className="custom-left-control">
      <LibFuzzySearch
        gazData={gazData}
        priorityTypes={[
          "emob",
          "bezirke",
          "quartiere",
          "adressen",
          "streets",
          "pois",
          "poisAlternativeNames",
          "kitas",
          "schulen",
        ]}
        typeInference={{
          adressen: (item) => {
            if (item.glyph === "home") {
              return "adressen";
            } else if (item.glyph === "road") {
              return "streets";
            } else {
              return "adressen";
            }
          },

          pois: (item) => {
            if (item.glyph === "tag") {
              return "pois";
            } else if (item.glyph === "tags") {
              return "poisAlternativeNames";
            } else if (item.glyph === "graduation-cap") {
              return "schulen";
            } else {
              return "pois";
            }
          },
        }}
        onSelection={onGazetteerSelection}
        pixelwidth={pixelwidth}
        placeholder="Ladestation | Stadtteil | Adresse | POI"
      />
    </div>
  );
};

export default FuzzySearch;
