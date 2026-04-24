import { useCallback } from "react";

import { useCesiumCameraLimiterToggle } from "@carma-mapping/engines/cesium/legacy";

import { CESIUM_CONFIG } from "../config/app.config";
import { useModeLifecycleActions } from "./use-mode-lifecycle-actions";

export const useGeoportalCesiumAnnotationModeLifecycle = ({
  active,
}: {
  active: boolean;
}) => {
  const { reenableCameraLimiters, setCameraLimitersDisabled } =
    useCesiumCameraLimiterToggle({
      maxPitchDegrees: CESIUM_CONFIG.camera?.maxPitchDeg,
      reenableOptions: CESIUM_CONFIG.camera.limiterReenable,
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
