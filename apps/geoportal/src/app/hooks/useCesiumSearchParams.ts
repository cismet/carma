import { useEffect } from "react";
import { useDispatch } from "react-redux";

import {
  setIsMode2d,
  setCurrentSceneStyle,
  VIEWERSTATE_KEYS,
} from "@carma-mapping/cesium-engine";
import { getHashParams } from "@carma-commons/utils";

export const useCesiumSearchParams = () => {
  const dispatch = useDispatch();
  useEffect(() => {
    const hashParams = getHashParams();

    if (hashParams[VIEWERSTATE_KEYS.is3d] !== undefined) {
      const is3d = hashParams[VIEWERSTATE_KEYS.is3d];
      if (is3d === "1") {
        dispatch(setIsMode2d(false));
      }
    } else {
      dispatch(setIsMode2d(true));
    }
    // TODO: handle this in common hook with TopicMap basemap setting on start from URL
    if (hashParams[VIEWERSTATE_KEYS.mapStyle] !== undefined) {
      const isPrimaryStyle = hashParams[VIEWERSTATE_KEYS.mapStyle] === "1";
      dispatch(setCurrentSceneStyle(isPrimaryStyle ? "primary" : "secondary"));
    }
    // run only once on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
