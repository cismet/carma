// Common math constants (fractions of π)
export const PI = Math.PI;
export const TWO_PI = Math.PI * 2;
export const PI_OVER_TWO = Math.PI / 2;
export const PI_OVER_FOUR = Math.PI / 4;

// Conversion constants
export const DEG_TO_RAD = PI / 180;
export const RAD_TO_DEG = 180 / PI;

// Earth and mapping constants
export const EARTH_CIRCUMFERENCE = 40075016.686; // meters
// Mean Earth radius (spherical approximation, meters)
export const EARTH_RADIUS = 6371008.7714;

// Web Map Defaults
export const DEFAULT_LEAFLET_TILESIZE = 256;
// Web Mercator max latitude (in radians)
export const WEB_MERCATOR_MAX_LATITUDE_RAD = 85.051129 * DEG_TO_RAD;

// Web Map App opiniate defaults
export const DEFAULT_ZOOM_TOLERANCE = 0.001; // should be no perceptable visual difference at 1/1000
export const DEFAULT_PIXEL_TOLERANCE = 8; // pixels
