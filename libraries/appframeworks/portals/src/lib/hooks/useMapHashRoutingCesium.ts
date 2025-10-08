import { useCallback } from "react";
import { useHashState } from "@carma-appframeworks/portals";

export type CesiumSceneChangeEvent = { hashParams: Record<string, string> };

// analog to useMapHashRoutingLeafletLike
// updates hash on cesium scene change
export const useMapHashRoutingCesium = () => {
  const { updateHash } = useHashState();

  const handleCesiumSceneChange = useCallback(
    (e: CesiumSceneChangeEvent) => {
      updateHash(e.hashParams, {
        clearKeys: ["zoom"],
        label: "GPM:3D",
        replace: true, // don't push to history until cesium handled history navigation
      });
    },
    [updateHash]
  );

  return handleCesiumSceneChange;
};
