// EPSG:4326 (WGS84) is Predefined within proj4 as EPSG:4326
// EPSG:3857 (Web Mercator) is Predefined within proj4 as EPSG:3857

/**
 * Proj4 definition for EPSG:25832 (ETRS89 / UTM zone 32N)
 * Note: This is not predefined within proj4 hence GRS80 is used
 */

export const proj4crs25832def =
  "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs";
