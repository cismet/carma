import { useContext, useEffect, useRef } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapDispatchContext } from "react-cismap/contexts/TopicMapContextProvider";

export const useUrlFeatureSelection = () => {
  const { initializingFeatures } = useContext<typeof FeatureCollectionContext>(
    FeatureCollectionContext
  );
  const { setSelectedFeatureByPredicate } = useContext<
    typeof FeatureCollectionDispatchContext
  >(FeatureCollectionDispatchContext);
  const { zoomToFeature } = useContext<typeof TopicMapDispatchContext>(
    TopicMapDispatchContext
  );

  const hasProcessedUrl = useRef(false);

  useEffect(() => {
    console.log("xxx initializingFeatures", initializingFeatures);
    if (!initializingFeatures && !hasProcessedUrl.current) {
      let objectId: string | null = null;

      const searchParams = new URLSearchParams(window.location.search);
      objectId = searchParams.get("tmSelectionObject");

      if (!objectId && window.location.hash) {
        let hashString = window.location.hash.substring(1);

        if (hashString.includes("?")) {
          hashString = hashString.split("?")[1];
        }

        const hashParams = new URLSearchParams(hashString);
        objectId = hashParams.get("tmSelectionObject");
      }

      if (objectId) {
        console.log("xxx found tmSelectionObject:", objectId);

        setTimeout(() => {
          const currentUrl = new URL(window.location.href);

          currentUrl.searchParams.delete("tmSelectionObject");

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
  }, [initializingFeatures]);

  return null;
};
