import { useMemo } from "react";
import { type MapStyleKey } from "../constants";
import { createEventBus } from "@carma/providers/event-bus";

// Create a global event bus for map style changes
const mapStyleBus = createEventBus<{ change: MapStyleKey }>();

/**
 * Hook for subscribing to map style changes via event bus (bus approach)
 * This avoids React rerenders when only controlling external APIs
 */
export const useMapStyleBus = () => {
  return useMemo(
    () => ({
      subscribe: (listener: (style: MapStyleKey) => void) => {
        return mapStyleBus.subscribe("change", listener);
      },
      emit: (style: MapStyleKey) => {
        mapStyleBus.emit("change", style);
      },
    }),
    []
  );
};

// Export the event bus instance for direct access if needed
export { mapStyleBus };
