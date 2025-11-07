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
    console.log("xxx initializingFeatures", initializingFeatures);
    console.log("xxx shownFeatures length", shownFeatures?.length || 0);

    // Wait for both: features loaded AND features available AND not processed yet
    if (
      !initializingFeatures &&
      shownFeatures &&
      shownFeatures.length > 0 &&
      !hasProcessedUrl.current
    ) {
      let objectId: string | null = null;

      if (window.location.hash) {
        let hashString = window.location.hash.substring(1); // Remove #

        if (hashString.includes("?")) {
          hashString = hashString.split("?")[1];
        }

        const hashParams = new URLSearchParams(hashString);
        objectId = hashParams.get("tmSelectionObject");
      }

      if (objectId) {
        console.log("xxx found tmSelectionObject:", objectId);
        console.log("xxx available features:", shownFeatures.length);

        // Find the feature first to make sure it exists
        const targetFeature = shownFeatures.find(
          (feature) => String(feature.properties.id) === String(objectId)
        );

        if (targetFeature) {
          console.log(
            "xxx found target feature:",
            targetFeature.properties.titel
          );
          setSelectedFeatureByPredicate(
            (feature) => String(feature.properties.id) === String(objectId)
          );

          // Zoom to the feature after a short delay
          setTimeout(() => {
            zoomToFeature(targetFeature);
          }, 100);
        } else {
          console.log(
            "xxx target feature with id 15 not found in shownFeatures"
          );
        }

        setTimeout(() => {
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
          console.log("xxx removed tmSelectionObject from URL");
        }, 3000);

        hasProcessedUrl.current = true;
      }
      console.log("xxx objectId", objectId);
    }
  }, [initializingFeatures, shownFeatures]);

  return null;
};
