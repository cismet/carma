import { useEffect } from "react";

import { useCesiumCameraLimiterToggle } from "@carma-mapping/engines/cesium/legacy";

import { CESIUM_CONFIG } from "../config/app.config";

export const useGeoportalCameraLimiterLayerControl = ({
  enabled,
}: {
  enabled: boolean;
}) => {
  const limiterControl = useCesiumCameraLimiterToggle({
    maxPitchDegrees: CESIUM_CONFIG.camera?.maxPitchDeg,
    reenableOptions: CESIUM_CONFIG.camera.limiterReenable,
  });
  const { reenableCameraLimiters } = limiterControl;

  useEffect(
    () => () => {
      if (enabled) {
        reenableCameraLimiters({
          restoreOnCancel: true,
          updateState: false,
        });
      }
    },
    [enabled, reenableCameraLimiters]
  );

  return limiterControl;
};
