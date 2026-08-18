import { useEffect } from "react";

import type { AddonComponentProps } from "../lib/registry";

/**
 * Moves the map's home position for the duration of the route.
 *
 * Headless, and it shares nothing with sibling addons: it hands the configured
 * view to `carma.mapping.setHomeOverride`, the app's home button reads that
 * override, and the effect's cleanup gives the home position back on a route
 * switch. Fields the config leaves out keep the app's default, so a route that
 * only wants another position writes lat/lng/zoom and inherits altitude and
 * pitch.
 *
 * `zoom` is the leaflet zoom (256 px tiles), the same number the geoportal's
 * url hash carries, so a position can be taken from the address bar as is.
 */
export type HomeOverrideConfig = {
  lat: number;
  lng: number;
  /** leaflet zoom, as in the url hash; omitted keeps the app's home zoom */
  zoom?: number;
  /** ground altitude in meters at the home position, for the 3d camera */
  altitude?: number;
  /** camera pitch in degrees, 3d only */
  pitch?: number;
  /** camera bearing in degrees, 3d only */
  bearing?: number;
  tooltip?: string;
};

export const HomeOverride = ({
  config,
  carma,
}: AddonComponentProps<"homeOverride">) => {
  const { lat, lng, zoom, altitude, pitch, bearing, tooltip } = config ?? {};

  useEffect(() => {
    if (lat === undefined || lng === undefined) {
      return;
    }
    carma.mapping.setHomeOverride({
      lat,
      lng,
      ...(zoom === undefined ? {} : { zoom }),
      ...(altitude === undefined ? {} : { altitude }),
      ...(pitch === undefined ? {} : { pitch }),
      ...(bearing === undefined ? {} : { bearing }),
      ...(tooltip === undefined ? {} : { tooltip }),
    });
    return () => {
      carma.mapping.setHomeOverride(null);
    };
  }, [carma, lat, lng, zoom, altitude, pitch, bearing, tooltip]);

  return null;
};
