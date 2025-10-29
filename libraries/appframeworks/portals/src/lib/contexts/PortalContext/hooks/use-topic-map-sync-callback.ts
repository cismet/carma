import { useCallback } from "react";
import type { MapStyleKey } from "../../../constants";

/**
 * Internal hook for managing topicmap sync callback registration
 * Used within PortalStateProvider to avoid circular dependency and keep concerns separated
 */
export const useTopicMapSyncCallback = (
  topicMapSyncCallbackRef: React.MutableRefObject<
    ((styleId: MapStyleKey) => void) | null
  >
) => {
  // Register function for topicmap sync callback (simplified - no unregister needed)
  const setTopicMapSyncCallback = useCallback(
    (callback: (styleId: MapStyleKey) => void) => {
      console.log("[PortalStateProvider] Setting topicmap sync callback");
      topicMapSyncCallbackRef.current = callback;
    },
    [topicMapSyncCallbackRef]
  );

  return {
    setTopicMapSyncCallback,
  };
};
