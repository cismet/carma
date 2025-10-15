import type { Degrees, Radians } from "@carma/units/types";

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
