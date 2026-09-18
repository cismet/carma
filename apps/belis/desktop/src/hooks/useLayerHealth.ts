import { useEffect, useSyncExternalStore } from "react";

import {
  getLayerHealthState,
  runLayerHealthCheck,
  subscribeLayerHealth,
  type LayerHealthState,
} from "../helper/layerHealthStore";

/**
 * Layer availability for the settings panel. Reads the shared store, and runs
 * a fresh check on every opening: only a current probe can tell whether the
 * VPN just dropped or a service just came back.
 */
export const useLayerHealth = (open: boolean): LayerHealthState => {
  useEffect(() => {
    if (open) void runLayerHealthCheck();
  }, [open]);

  return useSyncExternalStore(
    subscribeLayerHealth,
    getLayerHealthState,
    getLayerHealthState
  );
};

export default useLayerHealth;
