import { useEffect } from "react";

import { useCesiumOverlaySync } from "@carma-mapping/engines/cesium/react/interactions";
import { useLabelOverlay } from "@carma-providers/label-overlay";
import type { Scene } from "@carma-cesium";
export const useOverlayPositionSync = (scene: Scene) => {
  const requestUpdateCallback = useCesiumOverlaySync(scene);
  const overlayContext = useLabelOverlay();

  useEffect(
    function effectSyncOverlayContextPositions() {
      if (overlayContext && overlayContext.updatePositions) {
        requestUpdateCallback(overlayContext.updatePositions);
      }
    },
    [overlayContext, requestUpdateCallback]
  );
};
