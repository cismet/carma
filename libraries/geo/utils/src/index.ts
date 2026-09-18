export {
  distanceFromMercatorZoomAtLatitudeDeg,
  distanceMeters,
  isLocationVisuallyEquivalentAtZoom,
  isMapCenterZoomEquivalent,
  mercatorZoomFromDistanceAtLatitudeDeg,
  metersPerPixel,
  metersPerPixelAtLatitudeRad,
  pixelsBetweenGeographicLocations,
} from "./lib/geo";
export {
  extractRingsFromGeoJson,
  extractRingsFromGeometry,
} from "./lib/geojson-rings";
export type { ExtractRingsFromGeoJsonOptions } from "./lib/geojson-rings";
export type { WMSLayerDetails, WMSLayerMap } from "./lib/types/ogc/wms.d";
export {
  createMeshLocalProjection,
  getProjectedMeshCameraFit,
  getMeshReprojectionCameraFit,
  MESH_PROJECTION_METHOD,
  MESH_PROJECTION_ACCURACY,
  type MeshProjectionAccuracy,
  MESH_PROJECTION_SAMPLING,
  MESH_REPROJECTION_MODE,
  MESH_REPROJECTION_METHODS,
  type MeshProjectionMethod,
  type MeshReprojectionMode,
  createMeshMercatorLut,
  projectMeshLocalToMercatorExact,
  sampleMeshMercatorLut,
  type MeshMercatorLut,
  type MeshMercatorLutOptions,
} from "./lib/mesh-mercator-lut";
export {
  compareMeshReprojection,
  type MeshReprojectionComparison,
} from "./lib/mesh-reprojection-comparison";
