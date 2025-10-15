import type { Latitude, Longitude, Altitude } from "@carma/geo/types";
import type { PositionPreset } from "@carma/types";

/**
 * For tests
 *
 * Center
 * WGS84
 * lat: 51.27174
 * lon: 7.20028
 *
 * WEB MERCATOR 3857
 * x: 801531.5031689919
 * y: 6669502.877822709
 *
 * ETRS89 UTM32N
 * x: 374457.92973846296
 * y: 5681582.504430049
 *
 * NE Corner
 * WGS84
 * lat: 51.33
 * lon: 7.32
 * UTM32N
 * x: 382956.92866915197
 * y: 5687863.081930166
 *
 * SW Corner
 * WGS84
 * lat: 51.16
 * lon: 7.0
 * UTM32N
 * x: 360150.05966419703
 * y: 5669519.256383006
 */

export const WUPPERTAL: PositionPreset = {
  name: "Wuppertal",
  position: {
    latitude: 51.27174 as Latitude.deg,
    longitude: 7.20028 as Longitude.deg,
    altitude: 155 as Altitude.EllipsoidalWGS84Meters,
  },
  extent: {
    east: 7.32 as Longitude.deg,
    north: 51.33 as Latitude.deg,
    south: 51.16 as Latitude.deg,
    west: 7.0 as Longitude.deg,
  },
};

export default WUPPERTAL;
