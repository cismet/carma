// TODO Replace by branded versions
export interface LatLngRecord {
  latitude: number;
  longitude: number;
}

export interface LatLngDegrees {
  latDeg: number;
  lngDeg: number;
}

export interface LatLngRadians {
  latRad: number;
  lngRad: number;
}

export interface PlainCartesian3 {
  x: number;
  y: number;
  z: number;
}

// Prefer branded types over interfaces
// see also
// carma-commons/utils/typescript-branded-ops.ts
// carma-commons/utils/units.ts
export type LatLng = { lat: Degrees; lng: Degrees };
export type LatLngZoom = LatLng & { zoom: number };
