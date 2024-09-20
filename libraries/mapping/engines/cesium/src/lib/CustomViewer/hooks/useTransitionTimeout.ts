import { useEffect } from "react";
import { useDispatch } from "react-redux";

import {
  clearTransition,
  useViewerIsTransitioning,
} from "../../CustomViewerContextProvider";

const DEFAULT_TIMEOUT = 4000;

const useTransitionTimeout = (timeOut = DEFAULT_TIMEOUT) => {
  const isTransitioning = useViewerIsTransitioning();
  const dispatch = useDispatch();

  useEffect(() => {
    // reset isTransitioning after 2 seconds
    let timeoutId: NodeJS.Timeout | null = null;

    if (isTransitioning) {
      console.info("HOOK [CESIUM|2D3D] transition timeout added", timeOut);
      timeoutId = setTimeout(() => {
        if (isTransitioning) {
          console.warn("HOOK [CESIUM|2D3D|TIMEOUT] transition timed out, clearing state");
          dispatch(clearTransition());
        }
      }, timeOut);
    }

    return () => {
      if (timeoutId) {
        //console.info("HOOK [CESIUM|2D3D|TIMEOUT] timed out hook cleared");
        clearTimeout(timeoutId);
      }
    };
  }, [isTransitioning, dispatch, timeOut]);
};

export default useTransitionTimeout;
