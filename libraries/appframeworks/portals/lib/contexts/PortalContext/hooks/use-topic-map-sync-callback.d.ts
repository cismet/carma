import { MapStyleKey } from "../../../constants";
/**
 * Internal hook for managing topicmap sync callback registration
 * Used within PortalStateProvider to avoid circular dependency and keep concerns separated
 */
export declare const useTopicMapSyncCallback: (
  topicMapSyncCallbackRef: React.MutableRefObject<
    ((styleId: MapStyleKey) => void) | null
  >
) => {
  setTopicMapSyncCallback: (callback: (styleId: MapStyleKey) => void) => void;
};
