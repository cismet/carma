import { useEffect } from "react";
import { useDispatch } from "react-redux";

import { setIsMode2d, VIEWERSTATE_KEYS } from "@carma-mapping/cesium-engine";
import { getHashParams } from "@carma-commons/utils";

export const useViewModeSearchParams = () => {
  const dispatch = useDispatch();

  useEffect(() => {
    const hashParams = getHashParams();

    if (hashParams[VIEWERSTATE_KEYS.is3d] !== undefined) {
      const is3d = hashParams[VIEWERSTATE_KEYS.is3d];
      if (is3d === "1") {
        dispatch(setIsMode2d(false));
      }
    } else {
      // Default to 2D mode when no parameter is present
      dispatch(setIsMode2d(true));
    }
    // run only once on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
