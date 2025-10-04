import { useEffect } from "react";

import type { AnyAction, Dispatch } from "@reduxjs/toolkit";
import type { BackgroundLayer } from "@carma/types";
import { setCurrentSceneStyle } from "@carma-mapping/engines/cesium";

export const useSyncCesiumSceneStyle = (
  backgroundLayer: BackgroundLayer | undefined,
  ctx: { isValidViewer: () => boolean },
  dispatch: Dispatch<AnyAction>
) => {
  useEffect(() => {
    if (ctx.isValidViewer() && backgroundLayer) {
      if (backgroundLayer.id === "luftbild") {
        dispatch(setCurrentSceneStyle("primary"));
      } else {
        dispatch(setCurrentSceneStyle("secondary"));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundLayer]);
};
