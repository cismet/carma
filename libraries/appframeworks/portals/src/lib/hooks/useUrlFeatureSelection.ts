import { useContext, useEffect, useRef } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import {
  TopicMapContext,
  TopicMapDispatchContext,
} from "react-cismap/contexts/TopicMapContextProvider";

export const useUrlFeatureSelection = (
  selectionCallBack = (feature: any, objectId: any) =>
    String(feature.properties.id) === String(objectId),
  ifUsePredicate = true
) => {
  const { initializingFeatures, shownFeatures } = useContext<
    typeof FeatureCollectionContext
  >(FeatureCollectionContext);
  const { setSelectedFeatureByPredicate } = useContext<
    typeof FeatureCollectionDispatchContext
  >(FeatureCollectionDispatchContext);
  const { zoomToFeature } = useContext<typeof TopicMapDispatchContext>(
    TopicMapDispatchContext
  );
  const { history } = useContext<typeof TopicMapContext>(TopicMapContext);

  const hasProcessedUrl = useRef(false);

  useEffect(() => {
    if (
      !initializingFeatures &&
      shownFeatures &&
      shownFeatures.length > 0 &&
      !hasProcessedUrl.current
    ) {
      let objectId: string | null = null;
      if (window.location.hash) {
        let hashString = window.location.hash.substring(1);

        if (hashString.includes("?")) {
          hashString = hashString.split("?")[1];
        }

        const hashParams = new URLSearchParams(hashString);
        objectId = hashParams.get("tmSelectionObject");
      }

      if (objectId) {
        if (ifUsePredicate) {
          const targetFeature = shownFeatures.find((feature) =>
            selectionCallBack(feature, objectId)
          );

          if (targetFeature) {
            zoomToFeature(targetFeature);

            setTimeout(() => {
              setSelectedFeatureByPredicate((feature) =>
                selectionCallBack(feature, objectId)
              );
            }, 200);
          }
        } else {
          selectionCallBack(shownFeatures, objectId);
        }

        // Use the same history object that TopicMapComponent uses
        const currentSearch = history.location.search;
        const searchParams = new URLSearchParams(currentSearch);
        searchParams.delete("tmSelectionObject");

        const newSearch = searchParams.toString();
        const newPath = newSearch
          ? `${history.location.pathname}?${newSearch}`
          : history.location.pathname;

        history.replace(newPath);

        hasProcessedUrl.current = true;
      }
    }
  }, [
    initializingFeatures,
    shownFeatures,
    history,
    selectionCallBack,
    setSelectedFeatureByPredicate,
    zoomToFeature,
  ]);

  return null;
};
