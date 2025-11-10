import type { Degrees, Radians } from "@carma/units/types";
import { PI } from "@carma/units/helpers";

const DEG_TO_RAD = PI / 180;

/**
 * Default tile size for Leaflet and most web map tile services
 */
export const DEFAULT_LEAFLET_TILESIZE = 256;

/**
 * Web Mercator maximum latitude in degrees (EPSG:3857 projection limit)
 */
export const WEB_MERCATOR_MAX_LATITUDE_DEG: Degrees = 85.051129 as Degrees;

/**
 * Web Mercator maximum latitude in radians
 */
export const WEB_MERCATOR_MAX_LATITUDE_RAD: Radians =
  (WEB_MERCATOR_MAX_LATITUDE_DEG * DEG_TO_RAD) as Radians;

/**
 * Default zoom level for web map applications
 */
export const DEFAULT_ZOOM_LEVEL = 15;

/**
 * Default pixel tolerance for spatial operations
 */
export const DEFAULT_PIXEL_TOLERANCE = 8;

/**
 * Default latitude for Mercator calculations (approximately central Europe)
 */
export const DEFAULT_MERCATOR_LATITUDE_DEG: Degrees = 51.2 as Degrees;

/**
 * Default latitude for Mercator calculations in radians
 */
export const DEFAULT_MERCATOR_LATITUDE_RAD: Radians =
  (DEFAULT_MERCATOR_LATITUDE_DEG * DEG_TO_RAD) as Radians;
