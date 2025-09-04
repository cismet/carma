import { Degrees, Radians, Meters } from "./units";

// Spatial type definitions (consolidated, using branded units from units.d.ts)
export interface LatLngDegrees {
  latitude: Degrees;
  longitude: Degrees;
  altitude?: Meters;
}

export interface LatLngRadians {
  latitude: Radians;
  longitude: Radians;
  altitude?: Meters;
}

export interface PlainCartesian3 {
  x: Meters;
  y: Meters;
  z: Meters;
}

// Prefer branded types over interfaces
// see also
// carma-commons/utils/typescript-branded-ops.ts
// carma-commons/utils/units.ts
export type LatLng = { lat: Degrees; lng: Degrees };
export type LatLngZoom = LatLng & { zoom: number };

// Heading/Pitch/Roll consolidated
export interface HeadingPitchRollDegrees {
  heading?: Degrees;
  pitch?: Degrees;
  roll?: Degrees;
}

export interface HeadingPitchRollRadians {
  heading?: Radians;
  pitch?: Radians;
  roll?: Radians;
}
