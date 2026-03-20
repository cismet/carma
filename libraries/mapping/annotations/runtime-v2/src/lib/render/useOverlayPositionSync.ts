import { useEffect } from "react";

import { useCesiumOverlaySync } from "@carma-mapping/engines/cesium/react/interactions";
import { useLabelOverlay } from "@carma-providers/label-overlay";
import type { RuntimeScene } from "../types/runtimeScene.types";

export const useOverlayPositionSync = (scene: RuntimeScene | null) => {
  const subscribeFrame = useCesiumOverlaySync(scene);
  const overlayContext = useLabelOverlay();

  useEffect(() => {
    if (!overlayContext?.updatePositions) {
      return;
    }

    subscribeFrame(overlayContext.updatePositions);
  }, [overlayContext, subscribeFrame]);
};
