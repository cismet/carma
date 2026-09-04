import type { Map as MaplibreMap } from "maplibre-gl";

import { resolveSolarLocation } from "../core/solar-location";
import type { SolarLocation } from "../core/solar-position";

export const readMapCenterSolarLocation = (
  libreMap: MaplibreMap | null,
  fallbackLatitude: number,
  fallbackLongitude: number
): SolarLocation => {
  const center = libreMap?.getCenter();
  return resolveSolarLocation(
    center ? { latitude: center.lat, longitude: center.lng } : null,
    { latitude: fallbackLatitude, longitude: fallbackLongitude }
  );
};
