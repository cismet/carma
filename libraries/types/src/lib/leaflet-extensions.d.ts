import type { GeoJSONOptions, GeoJSON as LGeoJSON } from "leaflet";
import "leaflet"; // ensure module augmentation is applied

declare module "leaflet" {
  /** Additional constants not exposed by default typings */
  namespace DomUtil {
    /** CSS transform property name resolved at runtime (Leaflet internal). */
    const TRANSFORM: string;
  }

  /** Support for the proj4leaflet extension if present. */
  namespace Proj {
    /**
     * Create a GeoJSON layer reprojected via Proj4Leaflet. When the proj plugin
     * isn't loaded this will be undefined at runtime, so consumers must guard.
     */
    function geoJson(
      geojson: GeoJSON.GeoJsonObject | GeoJSON.GeoJsonObject[],
      options?: GeoJSONOptions
    ): LGeoJSON;
  }
}
