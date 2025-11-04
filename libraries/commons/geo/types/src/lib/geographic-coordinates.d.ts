import type { Degrees, NumericUnit, Radians } from "@carma/units/types";

// no over-declarition with named keys, no source of confusion
export type LatLngTyped<T> = {
  latitude: T;
  longitude: T;
};

export namespace LatLng {
  export type deg = LatLngTyped<Degrees>;
  export type rad = LatLngTyped<Radians>;
}

// for arrays add branding to avoid confusion of lat vs lng order

declare const LatitudeSymbol: unique symbol;
declare const LongitudeSymbol: unique symbol;

type LatitudeTyped<T> = T & NumericUnit<typeof LatitudeSymbol>;
type LongitudeTyped<T> = T & NumericUnit<typeof LongitudeSymbol>;

export namespace Latitude {
  export type deg = LatitudeTyped<Degrees>;
  export type rad = LatitudeTyped<Radians>;
}

export namespace Longitude {
  export type deg = LongitudeTyped<Degrees>;
  export type rad = LongitudeTyped<Radians>;
}

// all arrays are lng-lat ordered for consistency with proj4 and geojson
// allow elevations or measurements in rest of array
export type LngLatArrayTyped<
  TLongitude,
  TLatitude,
  TRest extends unknown[] = []
> = [TLongitude, TLatitude, ...TRest];

// stick to lng-lat order for arrays for consistency with proj4 and geojson
export namespace LngLatArray {
  export type deg<TRest extends unknown[] = []> = LngLatArrayTyped<
    Longitude.deg,
    Latitude.deg,
    TRest
  >;
  export type rad<TRest extends unknown[] = []> = LngLatArrayTyped<
    Longitude.rad,
    Latitude.rad,
    TRest
  >;
}
