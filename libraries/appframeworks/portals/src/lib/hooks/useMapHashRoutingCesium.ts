import { useCallback } from "react";
import { useHashState } from "@carma-appframeworks/portals";

export type CesiumSceneChangeEvent = { hashParams: Record<string, string> };

const noop = () => {};

export const triggerCesiumSceneChangeEvent = (
  hashParams: Record<string, string> | null | undefined,
  handler: (e: CesiumSceneChangeEvent) => void
): void => {
  if (!hashParams) return;
  try {
    handler({ hashParams });
  } catch {
    console.warn("Triggering Cesium scene change event failed");
  }
};

// analog to useMapHashRoutingLeafletLike
// updates hash on cesium scene change
export const useMapHashRoutingCesium = (
  enabled = true,
  clearKeys = ["zoom"]
) => {
  const { updateHash } = useHashState();

  const handleCesiumSceneChange = useCallback(
    (e: CesiumSceneChangeEvent) => {
      updateHash(e.hashParams, {
        clearKeys,
        label: "GPM:3D",
        replace: true, // don't push to history until cesium handled history navigation
      });
    },
    [updateHash, clearKeys]
  );

  return enabled ? handleCesiumSceneChange : noop;
};
