import {
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
  type MutableRefObject,
} from "react";
// Event system removed - using direct ref manipulation instead
import type { CesiumConfig } from "@carma/cesium/types";
import type { CesiumWidget } from "@carma/cesium";
import type { CesiumInstanceRecord } from "../CesiumContext";

// Generate unique instance IDs using crypto.randomUUID()
const generateInstanceId = () => `cesium-instance-${crypto.randomUUID()}`;

/**
 * Listens for Activate events and tracks Cesium widget instance lifecycle.
 *
 * NOTE: This ONLY tracks instances for debugging/analytics.
 * Widget initialization is now handled by CesiumSceneComponent automatically.
 */
export const useContextSetupActivationListener = (
  setCesiumInstances: Dispatch<SetStateAction<CesiumInstanceRecord[]>>,
  widgetRef: MutableRefObject<CesiumWidget | null>,
  config: CesiumConfig
) => {
  // Track context mount time (not app start time)
  const contextMountTimeRef = useRef(Date.now());

  // Event subscriptions removed - using direct ref manipulation instead
  // Widget instance tracking is now handled by direct ref polling
};
