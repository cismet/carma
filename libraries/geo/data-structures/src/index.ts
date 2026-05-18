export type { Altitude } from "./lib/altitudes.d";
export {
  CardinalDirections,
  CardinalDirectionClockwise,
  CardinalDirectionCounterClockwise,
  CardinalDirectionLetters,
  CardinalDirectionNames,
  CardinalHeadingsQuadrants,
} from "./lib/cardinal-directions";
export type { CardinalDirection } from "./lib/cardinal-directions";
export type {
  EastingNorthingMeters,
  EastingNorthingMetersDHHN2016,
  EastingNorthingMetersEllipsoidal,
} from "./lib/cartographic-coordinates.d";
export type { BBox, Extent } from "./lib/extents.d";
export type {
  LatLngZoom,
  Zoom,
  Zoom256,
  Zoom512,
  ZoomUnits,
} from "./lib/geo-tiled-web-map.d";
export type { GeoJsonConfig } from "./lib/geojson.d";
export type { HeadingPitchRoll } from "./lib/geo.d";
export type {
  Latitude,
  LatLng,
  LatLngTyped,
  LngLatArray,
  LngLatArrayTyped,
  Longitude,
} from "./lib/geographic-coordinates.d";
export type { LatLngAlt, LngLatAltArray } from "./lib/geographic-positions.d";
export type { PositionPreset } from "./lib/position-preset.d";
export type { Coordinates, ETRS89UTMZone } from "./lib/projections.d";

// Re-export core units used in geo domain
export type { Meters, Degrees, Radians, Ratio } from "@carma-units";
