import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useDispatch } from "react-redux";

import { setIsMode2d } from "@carma-mapping/cesium-engine";

export const use3dMode = () => {
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
    // run only once on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
