import { useContext, useEffect, useRef } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapDispatchContext } from "react-cismap/contexts/TopicMapContextProvider";

export const useUrlFeatureSelection = () => {
  const { selectedFeature } = useContext<typeof FeatureCollectionContext>(
    FeatureCollectionContext
  );
  const { setSelectedFeatureByPredicate } = useContext<
    typeof FeatureCollectionDispatchContext
  >(FeatureCollectionDispatchContext);
  const { zoomToFeature } = useContext<typeof TopicMapDispatchContext>(
    TopicMapDispatchContext
  );
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const objectId = searchParams.get("tmSelectionObject");

    console.log("xxx objectId", objectId);
  }, []);

  return null;
};
