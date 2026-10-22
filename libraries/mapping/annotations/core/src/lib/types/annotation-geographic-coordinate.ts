import type { GeographicCoordinate } from "@carma-geo/proj";

/**
 * Engine-neutral geographic coordinate of an annotation node: degrees and
 * metres above the WGS84 ellipsoid of its ECEF position, the shape persisted
 * measurement sets use.
 */
export type AnnotationGeographicCoordinate = GeographicCoordinate;
