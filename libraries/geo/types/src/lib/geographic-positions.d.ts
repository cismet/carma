import type { Altitude } from "./altitudes";
import type { LatLng, LngLatArray } from "./geographic-coordinates";

export namespace LatLngAlt {
  export type deg = LatLng.deg &
    Altitude.WithAltitude<Altitude.EllipsoidalWGS84Meters>;
  export type rad = LatLng.rad &
    Altitude.WithAltitude<Altitude.EllipsoidalWGS84Meters>;
}

export namespace LngLatAltArray {
  export type deg = LngLatArray.deg<[Altitude.EllipsoidalWGS84Meters?]>;
  export type rad = LngLatArray.rad<[Altitude.EllipsoidalWGS84Meters?]>;
}
