import { useSelection, useSelectionTopicMap } from "@carma-apps/portals";
import {
  defaultTypeInference,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { useContext } from "react";
import { FeatureCollectionDispatchContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import { isAreaType } from "@carma-commons/resources";
import { TopicMapDispatchContext } from "react-cismap/contexts/TopicMapContextProvider";

const FuzzySearchWrapper = ({ searchTextPlaceholder }) => {
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );
  const { setSelectedFeatureByPredicate } = useContext(
    FeatureCollectionDispatchContext
  );

  const { zoomToFeature } = useContext(TopicMapDispatchContext);

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
      const gazId = selection.more?.id;
      if (gazId) {
        setSelectedFeatureByPredicate((feature) => {
          try {
            const check =
              parseInt(feature.properties.standort.id) === hits[0].more.id;
            if (check === true) {
              zoomToFeature(feature);
            }
            return check;
          } catch (e) {
            return false;
          }
        });
      }
    }, 100);
  };

  return (
    <LibFuzzySearch
      onSelection={onGazetteerSelection}
      pixelwidth={pixelwidth}
      placeholder={searchTextPlaceholder}
      priorityTypes={[
        "bpklimastandorte",
        "pois",
        "poisAlternativeNames",
        "schulen",
        "kitas",
        "bezirke",
        "quartiere",
        "adressen",
        "streets",
      ]}
      typeInference={defaultTypeInference}
    />
  );
};

export default FuzzySearchWrapper;
