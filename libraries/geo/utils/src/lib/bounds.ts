/**
 * Bounds utilities for geographic operations.
 *
 * NOTE: This file is intentionally minimal to keep @carma/geo/* framework-agnostic.
 *
 * For map framework-specific bounds handling:
 * - Leaflet bounds conversions → @carma-mapping/engines/leaflet
 * - Maplibre bounds conversions → @carma-mapping/engines/maplibre
 * - Cesium bounds conversions → @carma-mapping/engines/cesium/core
 *
 * These packages can reference Turf, proj4, or other libraries while maintaining
 * framework-specific output formats.
 */
