/**
 * Proj4 definition for EPSG:3857 (Web Mercator)
 */
export const proj4crs3857def =
  "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs";

/**
 * Proj4 definition for EPSG:4326 (WGS84)
 */
export const proj4crs4326def = "+proj=longlat +datum=WGS84 +no_defs";

/**
 * EPSG:4326 identifier string
 */
export const EPSG4326 = "EPSG:4326";

/**
 * EPSG:3857 identifier string
 */
export const EPSG3857 = "EPSG:3857";

/**
 * Proj4 definition for EPSG:25832 (ETRS89 / UTM zone 32N)
 */
export const proj4crs25832def =
  "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs";

/**
 * EPSG:25832 identifier string
 */
export const EPSG25832 = "EPSG:25832";
