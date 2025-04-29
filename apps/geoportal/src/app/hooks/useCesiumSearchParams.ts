import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useDispatch } from "react-redux";

import {
  setIsMode2d,
  setCurrentSceneStyle,
  VIEWERSTATE_KEYS,
} from "@carma-mapping/cesium-engine";

export const useCesiumSearchParams = () => {
  const [searchParams] = useSearchParams();
  const dispatch = useDispatch();
  useEffect(() => {
    if (searchParams.has(VIEWERSTATE_KEYS.is3d)) {
      const is3d = searchParams.get(VIEWERSTATE_KEYS.is3d);
      if (is3d === "1") {
        dispatch(setIsMode2d(false));
      } else {
        dispatch(setIsMode2d(true));
      }
    }

    // TODO: handle this in common hook with TopicMap basemap setting on start from URL
    if (searchParams.has(VIEWERSTATE_KEYS.mapStyle)) {
      const isPrimaryStyle =
        searchParams.get(VIEWERSTATE_KEYS.mapStyle) === "1";
      dispatch(setCurrentSceneStyle(isPrimaryStyle ? "primary" : "secondary"));
    }
    // run only once on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
