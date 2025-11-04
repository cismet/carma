import type { Meters, NumericUnit } from "@carma/units/types";

declare const EllipsoidalWGS84MetersSymbol: unique symbol;
declare const DHHN2016MetersSymbol: unique symbol;
declare const GenericMetersSymbol: unique symbol;

export namespace Altitude {
  export type EllipsoidalWGS84Meters = Meters &
    NumericUnit<typeof EllipsoidalWGS84MetersSymbol>;

  export type DHHN2016Meters = Meters &
    NumericUnit<typeof DHHN2016MetersSymbol>;

  export type GenericMeters = Meters & NumericUnit<typeof GenericMetersSymbol>;

  export type WithAltitude<TAltitude> = {
    altitude?: TAltitude;
  };
}
