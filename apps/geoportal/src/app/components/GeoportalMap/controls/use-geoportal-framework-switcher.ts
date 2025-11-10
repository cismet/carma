/**
 * Geoportal-specific wrapper for framework switcher
 * Registers callbacks for handling transition events
 */

import { useEffect } from "react";

import { useHashState } from "@carma-providers/hash-state";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

/**
 * Registers geoportal-specific callbacks for framework transitions
 * - Updates hash with Leaflet coordinates after Cesium→Leaflet transition
 * - Clears Cesium-specific hash parameters (h, heading, pitch, fov, is3d)
 */
export const useGeoportalFrameworkSwitcher = () => {
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
      // Clear Cesium-specific parameters and set Leaflet parameters
      updateHash(
        { lat: center.lat, lng: center.lng, zoom },
        {
          label: "[GEOPORTAL] Post-transition hash update",
          clearKeys: ["h", "heading", "pitch", "fov", "is3d"],
        }
      );
    };

    registerCallbacks({
      onLeafletViewSet: callback,
    });
  }, [registerCallbacks, updateHash]);
};
