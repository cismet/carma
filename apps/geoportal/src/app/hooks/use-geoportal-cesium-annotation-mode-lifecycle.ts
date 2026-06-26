import { useCallback } from "react";

import { useCesiumCameraLimiterToggle } from "@carma-mapping/engines/cesium/react/runtime";

import { CESIUM_CONFIG } from "../config/app.config";
import { useModeLifecycleActions } from "./use-mode-lifecycle-actions";

export const useGeoportalCesiumAnnotationModeLifecycle = ({
  active,
}: {
  active: boolean;
}) => {
  const { reenableCameraLimiters, setCameraLimitersDisabled } =
    useCesiumCameraLimiterToggle({
      limiter: CESIUM_CONFIG.camera.limiter,
    });

  const disableCameraLimiters = useCallback(() => {
    setCameraLimitersDisabled(true);
  }, [setCameraLimitersDisabled]);

  const restoreCameraLimiters = useCallback(() => {
    reenableCameraLimiters({
      restoreOnCancel: true,
      updateState: false,
    });
  }, [reenableCameraLimiters]);

  useModeLifecycleActions({
    active,
    onEnter: [disableCameraLimiters],
    onLeave: [restoreCameraLimiters],
  });
};
