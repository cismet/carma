import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useDispatch } from "react-redux";

import {
  setIsMode2d,
  setCurrentSceneStyle,
} from "@carma-mapping/cesium-engine";

export const useCesiumSearchParams = () => {
  const [searchParams] = useSearchParams();
  const dispatch = useDispatch();
  useEffect(() => {
    if (searchParams.has("is3d")) {
      const is3d = searchParams.get("is3d");
      if (is3d === "1") {
        dispatch(setIsMode2d(false));
      } else {
        dispatch(setIsMode2d(true));
      }
    }

    // TODO: handle this in common hook with TopicMap basemap setting on start from URL
    if (searchParams.has("m")) {
      const isPrimaryStyle = searchParams.get("m") === "1";
      dispatch(setCurrentSceneStyle(isPrimaryStyle ? "primary" : "secondary"));
    }
    // run only once on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
