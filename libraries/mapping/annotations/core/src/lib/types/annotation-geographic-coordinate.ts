/**
 * Engine-neutral geographic coordinate of an annotation node: degrees and
 * metres above the WGS84 ellipsoid of its ECEF position, the shape persisted
 * measurement sets use.
 */
export type AnnotationGeographicCoordinate = {
  longitude: number;
  latitude: number;
  altitude: number;
};
