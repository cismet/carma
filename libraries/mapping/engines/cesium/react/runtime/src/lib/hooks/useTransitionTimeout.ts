import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  clearTransition,
  selectCesiumRuntimeCurrentTransition,
  selectCesiumRuntimeIsTransitioning,
} from "../slices/cesium";
import { useCesiumRuntime } from "./useCesiumRuntime";
const DEFAULT_TIMEOUT = 4000;

const useTransitionTimeout = (timeOut = DEFAULT_TIMEOUT) => {
  const isTransitioning = useSelector(selectCesiumRuntimeIsTransitioning);
  const currentTransition = useSelector(selectCesiumRuntimeCurrentTransition);
  const runtime = useCesiumRuntime();
  const dispatch = useDispatch();

  useEffect(() => {
    // reset isTransitioning after 2 seconds
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (runtime && isTransitioning) {
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
  }, [runtime, isTransitioning, currentTransition, dispatch, timeOut]);
};

export default useTransitionTimeout;
