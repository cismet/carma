import { useContext } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import InfoBoxHeader from "react-cismap/topicmaps/InfoBoxHeader";
import itemFilterFunction from "../utils/filterFunction";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
const InfoBox = (props) => {
  const featureCollectionContext = useContext(FeatureCollectionContext);
  const { setSelectedFeatureByPredicate } = useContext(
    FeatureCollectionDispatchContext
  );
  const { selectedFeature, filterState } = featureCollectionContext;
  const { responsiveState, gap, windowSize, infoBoxPixelWidth } = useContext(
    ResponsiveTopicMapContext
  );
  const overlappingHeaders = [];
  let counter = 1;
  const isActive = itemFilterFunction({ filterState });
  let actualWidth = 350;

  if (responsiveState === "normal") {
    actualWidth = infoBoxPixelWidth;
  } else if (responsiveState === "small") {
    actualWidth = windowSize.width - gap;
  }

  if (selectedFeature?.properties?.overlapping) {
    for (const overlap of selectedFeature.properties.overlapping) {
      if (isActive(overlap)) {
        overlappingHeaders.push(
          <div
            style={{
              width: actualWidth,
              paddingBottom: 3,
              paddingLeft: counter * 5,

              cursor: "pointer", //is a hand
            }}
            onClick={() => {
              setSelectedFeatureByPredicate((feature) => {
                return feature?.properties?.id === overlap.id;
              });
            }}
          >
            <InfoBoxHeader
              headerColor={overlap.kampagne.color}
              content={overlap.kampagne.bezeichnung}
            ></InfoBoxHeader>
          </div>
        );
      }
      counter++;
    }
  }

  return (
    <div>
      <GenericInfoBoxFromFeature
        {...props}
        secondaryInfoBoxElements={overlappingHeaders}
      />
    </div>
  );
};

export default InfoBox;
