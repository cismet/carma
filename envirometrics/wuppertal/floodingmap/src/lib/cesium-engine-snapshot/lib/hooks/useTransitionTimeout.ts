import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  clearTransition,
  selectViewerCurrentTransition,
  selectViewerIsTransitioning,
} from "../slices/cesium";
import { useCesiumViewer } from "./useCesiumViewer";

const DEFAULT_TIMEOUT = 4000;

const useTransitionTimeout = (timeOut = DEFAULT_TIMEOUT) => {
  const isTransitioning = useSelector(selectViewerIsTransitioning);
  const currentTransition = useSelector(selectViewerCurrentTransition);
  const viewer = useCesiumViewer();
  const dispatch = useDispatch();

  useEffect(() => {
    // reset isTransitioning after 2 seconds
    let timeoutId: NodeJS.Timeout | null = null;

    if (viewer && isTransitioning) {
      console.info(
        "HOOK [CESIUM|2D3D] transition timeout added",
        timeOut,
        isTransitioning,
        currentTransition
      );
      timeoutId = setTimeout(() => {
        if (isTransitioning) {
          console.warn(
            "HOOK [CESIUM|2D3D|TIMEOUT] transition timed out, clearing state"
          );
          dispatch(clearTransition());
        }
      }, timeOut);
    }

    return () => {
      if (timeoutId) {
        console.debug(
          "HOOK [CESIUM|2D3D|TIMEOUT] timeout cleared on transition end"
        );
        clearTimeout(timeoutId);
      }
    };
  }, [viewer, isTransitioning, currentTransition, dispatch, timeOut]);
};

export default useTransitionTimeout;
