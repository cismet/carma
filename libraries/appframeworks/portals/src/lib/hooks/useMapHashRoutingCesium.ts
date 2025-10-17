import { useCallback, useEffect, useRef } from "react";
import { useHashState } from "@carma-appframeworks/portals";
import { useCesiumContext, CtxEvent } from "@carma-mapping/engines/cesium/core";

export type CesiumSceneChangeEvent = { hashParams: Record<string, string> };

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
// Internally tracks whether Cesium is suspended (in 2D mode)
export const useMapHashRoutingCesium = (clearKeys = ["zoom"]) => {
  const { updateHash } = useHashState();
  const { subscribe, isSuspendedRef } = useCesiumContext();

  // Subscribe to Cesium context events
  useEffect(() => {
    const unsubActive = subscribe(CtxEvent.Activate, () => {
      console.debug("[CesiumHashRouting] Cesium active");
    });
    const unsubSuspended = subscribe(CtxEvent.Suspend, () => {
      console.debug("[CesiumHashRouting] Cesium suspended");
    });
    return () => {
      unsubActive();
      unsubSuspended();
    };
  }, [subscribe]);

  const handleCesiumSceneChange = useCallback(
    (e: CesiumSceneChangeEvent) => {
      // Don't update hash if Cesium is suspended (in 2D mode)
      if (isSuspendedRef.current) {
        console.debug(
          "[CesiumHashRouting] Skipping hash update - Cesium suspended"
        );
        return;
      }

      updateHash(e.hashParams, {
        clearKeys,
        label: "GPM:3D",
        replace: true, // don't push to history until cesium handled history navigation
      });
    },
    [updateHash, clearKeys]
  );

  return handleCesiumSceneChange;
};
