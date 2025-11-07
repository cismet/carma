/**
 * Floodingmap-specific wrapper for framework switcher
 * Registers callbacks for handling transition events
 */

import { useEffect } from "react";

import { useHashState } from "@carma-providers/hash-state";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

/**
 * Registers floodingmap-specific callbacks for framework transitions
 * - Updates hash with Leaflet coordinates after Cesium→Leaflet transition
 * - Clears Cesium-specific hash parameters (h, heading, pitch, fov, is3d)
 */
export const useFloodingmapFrameworkSwitcher = () => {
  const { updateHash } = useHashState();
  const { registerCallbacks } = useMapFrameworkSwitcherContext();

  useEffect(() => {
    const callback = ({
      center,
      zoom,
    }: {
      center: { lat: number; lng: number };
      zoom: number;
    }) => {
      console.log("[FLOODINGMAP] Transition to Leaflet complete:", {
        lat: center.lat,
        lng: center.lng,
        zoom,
      });

      // Clear Cesium-specific parameters and set Leaflet parameters
      updateHash(
        { lat: center.lat, lng: center.lng, zoom },
        {
          label: "app/hgk:2D",
          clearKeys: ["h", "heading", "pitch", "fov", "is3d"],
        }
      );
    };

    registerCallbacks({
      onLeafletViewSet: callback,
    });
  }, [registerCallbacks, updateHash]);
};
