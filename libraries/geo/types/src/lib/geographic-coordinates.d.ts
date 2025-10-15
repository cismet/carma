import type { Degrees, NumericUnit, Radians } from "@carma/units/types";

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

export type LatLngTyped<TLatitude, TLongitude> = {
  latitude: TLatitude;
  longitude: TLongitude;
};

export namespace LatLng {
  export type deg = LatLngTyped<Latitude.deg, Longitude.deg>;
  export type rad = LatLngTyped<Latitude.rad, Longitude.rad>;
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
