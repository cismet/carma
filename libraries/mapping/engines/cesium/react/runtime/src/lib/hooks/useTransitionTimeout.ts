import { useEffect } from "react";

import { useCesiumContext } from "./useCesiumContext";
import { useCesiumRuntime } from "./useCesiumRuntime";
const DEFAULT_TIMEOUT = 4000;

const useTransitionTimeout = (timeOut = DEFAULT_TIMEOUT) => {
  const { isTransitioning, currentTransition, clearTransition } =
    useCesiumContext();
  const runtime = useCesiumRuntime();

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
          clearTransition();
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
  }, [runtime, isTransitioning, currentTransition, clearTransition, timeOut]);
};

export default useTransitionTimeout;
