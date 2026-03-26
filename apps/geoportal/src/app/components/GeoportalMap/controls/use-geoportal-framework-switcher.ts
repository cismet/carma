/**
 * Geoportal-specific wrapper for framework switcher
 * Registers callbacks for handling transition events
 */

import { useEffect } from "react";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

type UseGeoportalFrameworkSwitcherOptions = {
  onEnsureCesiumReady?: () => Promise<void> | void;
  onBeforeTransitionToCesium?: () => Promise<void> | void;
  onAfterTransitionToCesium?: () => void;
};

/**
 * Registers geoportal-specific callbacks for framework transitions
 * - Stages Geoportal-specific Cesium content before 2D→3D transitions
 * - Leaves 2D hash/history updates on the existing guarded routing path
 */
export const useGeoportalFrameworkSwitcher = (
  options?: UseGeoportalFrameworkSwitcherOptions
) => {
  const { registerCallbacks } = useMapFrameworkSwitcherContext();
  const onEnsureCesiumReady = options?.onEnsureCesiumReady;
  const onBeforeTransitionToCesium = options?.onBeforeTransitionToCesium;
  const onAfterTransitionToCesium = options?.onAfterTransitionToCesium;

  useEffect(() => {
    registerCallbacks({
      onEnsureCesiumReady,
      onBeforeTransitionToCesium,
      onAfterTransitionToCesium,
    });
  }, [
    onEnsureCesiumReady,
    onAfterTransitionToCesium,
    onBeforeTransitionToCesium,
    registerCallbacks,
  ]);
};
