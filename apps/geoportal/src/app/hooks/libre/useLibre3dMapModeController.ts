import { useEffect } from "react";

import { registerMapModeController } from "@carma-api";

/**
 * carma-api `getMode` and `mapping3D/2D.activate` answer with and switch the
 * maplibre 3D view.
 */
export const useLibre3dMapModeController = ({
  enabled,
  libre3d,
  toggle,
}: {
  enabled: boolean;
  libre3d: boolean;
  toggle: () => void;
}) => {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    registerMapModeController({
      getMode: () => (libre3d ? "3d" : "2d"),
      setMode: (mode) => {
        if ((mode === "3d") !== libre3d) {
          toggle();
        }
      },
    });
    return () => registerMapModeController(null);
  }, [enabled, libre3d, toggle]);
};
