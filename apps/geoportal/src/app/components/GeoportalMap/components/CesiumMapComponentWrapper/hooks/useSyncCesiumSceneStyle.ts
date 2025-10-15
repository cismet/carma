import { useEffect } from "react";

import type { BackgroundLayer } from "@carma/types";
import {
  MapStyleKeys,
  ManagedCesiumStyleKeys,
} from "@carma-appframeworks/portals";
import { useCesiumContext, CtxEvent } from "@carma-mapping/engines/cesium";

export const useSyncCesiumSceneStyle = (backgroundLayer: BackgroundLayer) => {
  const { emit } = useCesiumContext();
  useEffect(() => {
    if (backgroundLayer) {
      if (backgroundLayer.id === MapStyleKeys.AERIAL) {
        emit(CtxEvent.SetSceneStyle, ManagedCesiumStyleKeys.LOD2);
      } else {
        emit(CtxEvent.SetSceneStyle, ManagedCesiumStyleKeys.MESH);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundLayer]);
};
