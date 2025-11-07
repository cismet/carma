import { useContext, useEffect, useRef } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapDispatchContext } from "react-cismap/contexts/TopicMapContextProvider";

export const useUrlFeatureSelection = () => {
  const { initializingFeatures, shownFeatures } = useContext<
    typeof FeatureCollectionContext
  >(FeatureCollectionContext);
  const { setSelectedFeatureByPredicate } = useContext<
    typeof FeatureCollectionDispatchContext
  >(FeatureCollectionDispatchContext);
  const { zoomToFeature } = useContext<typeof TopicMapDispatchContext>(
    TopicMapDispatchContext
  );

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
        const targetFeature = shownFeatures.find(
          (feature) => String(feature.properties.id) === String(objectId)
        );

        if (targetFeature) {
          setSelectedFeatureByPredicate(
            (feature) => String(feature.properties.id) === String(objectId)
          );
          zoomToFeature(targetFeature);
        }

        const currentUrl = new URL(window.location.href);

        if (currentUrl.hash) {
          let hashString = currentUrl.hash.substring(1);

          if (hashString.includes("?")) {
            const [hashPath, hashQuery] = hashString.split("?");
            const hashParams = new URLSearchParams(hashQuery);
            hashParams.delete("tmSelectionObject");

            const remainingParams = hashParams.toString();
            currentUrl.hash = remainingParams
              ? `${hashPath}?${remainingParams}`
              : hashPath;
          } else {
            const hashParams = new URLSearchParams(hashString);
            hashParams.delete("tmSelectionObject");
            currentUrl.hash = hashParams.toString();
          }
        }

        window.history.replaceState({}, "", currentUrl.toString());

        hasProcessedUrl.current = true;
      }
    }
  }, [initializingFeatures, shownFeatures]);

  return null;
};
