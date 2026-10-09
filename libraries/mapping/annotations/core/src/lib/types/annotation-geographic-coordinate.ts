/**
 * Engine-neutral geographic coordinate of an annotation node: degrees and
 * ellipsoidal WGS84 metres. Replaces the `CesiumGeographicCoordinate` DTO that
 * the runtime re-exported from the Cesium engine package (cismet/carma#680);
 * the shape is identical, so persisted payloads stay valid.
 */
export type AnnotationGeographicCoordinate = {
  longitude: number;
  latitude: number;
  altitude: number;
};
