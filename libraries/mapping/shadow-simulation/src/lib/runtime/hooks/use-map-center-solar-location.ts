import { useEffect, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { areSolarLocationsEqual } from "../../core/solar-location";
import type { SolarLocation } from "../../core/solar-position";
import { readMapCenterSolarLocation } from "../map-center-solar-location";

export const useMapCenterSolarLocation = (
  libreMap: MaplibreMap | null,
  fallbackLatitude: number,
  fallbackLongitude: number
): SolarLocation => {
  const [location, setLocation] = useState<SolarLocation>(() =>
    readMapCenterSolarLocation(
      libreMap,
      fallbackLatitude,
      fallbackLongitude
    )
  );

  useEffect(() => {
    const updateLocation = () => {
      const next = readMapCenterSolarLocation(
        libreMap,
        fallbackLatitude,
        fallbackLongitude
      );
      setLocation((current) =>
        areSolarLocationsEqual(current, next) ? current : next
      );
    };
    updateLocation();
    if (!libreMap) return;
    libreMap.on("moveend", updateLocation);
    return () => {
      libreMap.off("moveend", updateLocation);
    };
  }, [fallbackLatitude, fallbackLongitude, libreMap]);

  return location;
};
