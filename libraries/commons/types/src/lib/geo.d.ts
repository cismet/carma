import { Degrees, Radians, Meters, NumericUnit } from "./units";

declare const EllipsoidalWGS84MetersSymbol: unique symbol;
declare const DHHN2016MetersSymbol: unique symbol;
export namespace Altitude {
  export type EllipsoidalWGS84Meters = Meters &
    NumericUnit<typeof EllipsoidalWGS84MetersSymbol>;
  export type DHHN2016Meters = Meters &
    NumericUnit<typeof DHHN2016MetersSymbol>;
}
interface LatLngDegrees {
  latitude: Degrees;
  longitude: Degrees;
  altitude?: Altitude.EllipsoidalWGS84Meters;
}

interface LatLngRadians {
  latitude: Radians;
  longitude: Radians;
  altitude?: Altitude.EllipsoidalWGS84Meters;
}

export namespace LatLng {
  export type deg = LatLngDegrees;
  export type rad = LatLngRadians;
}

export namespace Extent {
  export type deg = {
    east: Degrees;
    north: Degrees;
    south: Degrees;
    west: Degrees;
  };
  export type rad = {
    east: Radians;
    north: Radians;
    south: Radians;
    west: Radians;
  };
}

// explicitly degrees only.
type LatLngZoom = LatLngDegrees & { zoom: number };

interface HeadingPitchRollDegrees {
  heading?: Degrees;
  pitch?: Degrees;
  roll?: Degrees;
}
interface HeadingPitchRollRadians {
  heading?: Radians;
  pitch?: Radians;
  roll?: Radians;
}

export namespace HeadingPitchRoll {
  export type deg = HeadingPitchRollDegrees;
  export type rad = HeadingPitchRollRadians;
}

export interface Cartesian3Meters {
  x: Meters;
  y: Meters;
  z: Meters;
}

export interface PlainCartesian3 {
  x: number;
  y: number;
  z: number;
}
