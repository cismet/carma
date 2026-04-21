import { useEffect } from "react";

import { useCesiumOverlaySync } from "@carma-mapping/engines/cesium/react/interactions";
import { useLabelOverlay } from "@carma-providers/label-overlay";

import type { Scene } from "@carma-cesium";
export const useOverlayPositionSync = (scene: Scene | null) => {
  const requestUpdateCallback = useCesiumOverlaySync(scene);
  const overlayContext = useLabelOverlay();

  useEffect(() => {
    if (!overlayContext?.updatePositions) {
      return;
    }

    requestUpdateCallback(overlayContext.updatePositions);
  }, [overlayContext, requestUpdateCallback]);
};
