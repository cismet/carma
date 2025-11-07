/**
 * Geoportal-specific wrapper for framework switcher
 * Registers callbacks for handling transition events
 */

import { useEffect } from "react";

import { useHashState } from "@carma-providers/hash-state";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { useCesiumContext } from "@carma-mapping/engines/cesium";

/**
 * Registers geoportal-specific callbacks for framework transitions
 * - Updates hash with Leaflet coordinates after Cesium→Leaflet transition
 * - Clears Cesium-specific hash parameters (h, heading, pitch, fov, is3d)
 */
export const useGeoportalFrameworkSwitcher = () => {
  const { updateHash } = useHashState();
  const { registerCallbacks, isTransitioning } =
    useMapFrameworkSwitcherContext();
  const { shouldSuspendResizeObserverRef } = useCesiumContext();

  // Suspend ResizeObserver during transitions to prevent WebGL context loss
  useEffect(() => {
    shouldSuspendResizeObserverRef.current = isTransitioning;
    if (isTransitioning) {
      console.warn(
        "[GEOPORTAL] Suspending Cesium ResizeObserver during transition"
      );
    } else {
      console.debug(
        "[GEOPORTAL] Resuming Cesium ResizeObserver after transition"
      );
    }
  }, [isTransitioning, shouldSuspendResizeObserverRef]);

  useEffect(() => {
    const callback = ({
      center,
      zoom,
    }: {
      center: { lat: number; lng: number };
      zoom: number;
    }) => {
      console.log("[GEOPORTAL] onLeafletViewSet callback invoked:", {
        lat: center.lat,
        lng: center.lng,
        zoom,
      });

      // Clear Cesium-specific parameters and set Leaflet parameters
      updateHash(
        { lat: center.lat, lng: center.lng, zoom },
        {
          label: "[GEOPORTAL] Post-transition hash update",
          clearKeys: ["h", "heading", "pitch", "fov", "is3d"],
        }
      );
    };

    console.log("[GEOPORTAL] Registering onLeafletViewSet callback");
    registerCallbacks({
      onLeafletViewSet: callback,
    });
  }, [registerCallbacks, updateHash]);
};
